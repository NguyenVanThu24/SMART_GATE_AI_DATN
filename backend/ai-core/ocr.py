"""OCR biển số Việt Nam (fast-plate-ocr) + tracker biển số.

Luồng cho mỗi track:
  - YOLO phát hiện biển số LIÊN TỤC -> luôn cập nhật/ghim vị trí khung.
  - Chưa chốt: OCR nhiều lần (cách nhau OCR_INTERVAL), không bao giờ bỏ cuộc.
  - Đủ SO_LAN_XAC_NHAN lần OCR trùng khớp và đạt NGUONG_OCR -> CONFIRMED, DỪNG OCR.
  - Đã chốt: chỉ còn phát hiện để ghim vị trí khung; track được giữ THOI_GIAN_GIU_DA_CHOT giây khi mất biển.
"""
from pathlib import Path
from collections import Counter
from urllib.request import urlretrieve
import re
import cv2
import numpy as np
import onnxruntime as ort
from fast_plate_ocr import LicensePlateRecognizer

from config import (NGUONG_OCR, OCR_TOI_DA_MOI_XE, SO_LAN_XAC_NHAN, OCR_INTERVAL,
                    NGUONG_PHAT_HIEN_OCR, CONF_BIEN_SO, IOU_GHEP_BIEN_SO,
                    THOI_GIAN_GIU_TRACK, THOI_GIAN_GIU_DA_CHOT, OCR_BASE_URL,
                    FILE_OCR_MODEL, FILE_OCR_CONFIG, OCR_DEVICE)
from nhan_dang_bien_so import iou_box, phat_hien_bien_so
from nhan_dang_xe import lay_boxes

# Trạng thái track
NEW, OCR_PENDING, CONFIRMED = "NEW", "OCR_PENDING", "CONFIRMED"

ocr_vn = None


def khoi_tao_ocr():
    global ocr_vn

    if ocr_vn is None:
        for f in (FILE_OCR_MODEL, FILE_OCR_CONFIG):
            if not Path(f).is_file():
                urlretrieve(OCR_BASE_URL + f, f)

        # Gioi han luong xu ly OCR
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL

        ocr_vn = LicensePlateRecognizer(
            onnx_model_path=FILE_OCR_MODEL,
            plate_config_path=FILE_OCR_CONFIG,
            device=OCR_DEVICE,
            sess_options=options,
        )

        print("Da khoi tao OCR - ONNX 2 threads")

    return ocr_vn


def chuan_hoa(text):
    return re.sub(r"[^A-Z0-9]", "", (text or "").upper())


def dinh_dang(text):
    mau = re.fullmatch(r"(\d{2}[A-Z](?:[A-Z]|\d)?)(\d{5})", text)
    if mau:
        dau, so = mau.groups()
        return f"{dau}-{so[:3]}.{so[3:]}"
    return text


def doc_mot_bien(frame, box):
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = box
    x1, y1, x2, y2 = max(0, x1), max(0, y1), min(w, x2), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        return '', 0.0
    rgb = cv2.cvtColor(frame[y1:y2, x1:x2], cv2.COLOR_BGR2RGB)
    try:
        pred = khoi_tao_ocr().run_one(rgb, return_confidence=True)
        txt = pred.plate or ''
        probs = np.asarray(pred.char_probs).reshape(-1) if pred.char_probs is not None else np.array([])
        if not txt or len(probs) < len(txt):
            return txt, 0.0
        diem = probs[:len(txt)]
        score = float(np.min(diem)) if np.all(np.isfinite(diem)) else 0.0
        return txt, score
    except Exception as e:
        print('OCR lỗi:', e)
        return '', 0.0


class BienSoTracker:
    """Ghép biển số giữa các frame theo IoU và điều khiển OCR theo trạng thái."""

    def __init__(self):
        self.tracks = {}
        self.next_id = 0

    def reset(self):
        self.tracks.clear()

    # ---- OCR / xác nhận ----
    @staticmethod
    def _kiem_tra_xac_nhan(t):
        """Chốt khi có >= SO_LAN_XAC_NHAN lần OCR cùng nội dung và đều đạt ngưỡng."""
        dat = Counter(k for k, s in t['history'] if s >= NGUONG_OCR)
        if not dat:
            return None
        key, so_lan = dat.most_common(1)[0]
        return key if so_lan >= SO_LAN_XAC_NHAN else None

    @staticmethod
    def _chon_tot_nhat(t):
        """Kết quả tạm thời để hiển thị: xuất hiện nhiều nhất, rồi điểm cao nhất."""
        if not t['history']:
            return
        dem = Counter(k for k, _ in t['history'])
        diem_max = {}
        for k, s in t['history']:
            diem_max[k] = max(diem_max.get(k, 0.0), s)
        key = max(dem, key=lambda k: (dem[k], diem_max[k]))
        t['best'], t['score'] = key, diem_max[key]

    def _ocr_track(self, frame, t, now):
        t['last_ocr'] = now
        t['count'] += 1
        txt, score = doc_mot_bien(frame, t['box'])
        key = chuan_hoa(txt)
        if key:
            t['history'].append((key, score))
        # Cửa sổ trượt: chỉ giữ các lần đọc gần nhất, không bao giờ bỏ cuộc
        t['history'] = t['history'][-OCR_TOI_DA_MOI_XE:]

        chot = self._kiem_tra_xac_nhan(t)
        if chot:
            diem = max(s for k, s in t['history'] if k == chot)
            t['best'], t['score'], t['state'] = chot, diem, CONFIRMED
            t['moi_xac_nhan'] = True
        else:
            self._chon_tot_nhat(t)
            t['state'] = OCR_PENDING

    @staticmethod
    def _giu(t):
        """Thời gian giữ track khi mất phát hiện: track đã chốt giữ lâu hơn."""
        return THOI_GIAN_GIU_DA_CHOT if t['state'] == CONFIRMED else THOI_GIAN_GIU_TRACK

    # ---- cập nhật mỗi lượt phát hiện ----
    def update(self, frame, now):
        """now: thời gian (giây). Trả về (danh_sach_track_vua_xac_nhan, so_lan_ocr)."""
        so_ocr = 0
        vua_xac_nhan = []
        det = lay_boxes(phat_hien_bien_so(frame, CONF_BIEN_SO))  # luôn chạy để ghim vị trí
        da_ghep = set()
        for box, _, conf in det:
            cands = [(iou_box(box, t['box']), tid) for tid, t in self.tracks.items()
                     if tid not in da_ghep and now - t['last'] <= self._giu(t)]
            best_iou, tid = max(cands, default=(0, None))
            if best_iou < IOU_GHEP_BIEN_SO:
                tid = self.next_id
                self.next_id += 1
                self.tracks[tid] = {
                    'id': tid, 'box': box, 'last': now, 'conf': conf, 'state': NEW,
                    'count': 0, 'history': [], 'best': '', 'score': 0.0,
                    'last_ocr': -float('inf'), 'moi_xac_nhan': False,
                }
            t = self.tracks[tid]
            t['box'], t['last'], t['conf'] = box, now, conf
            da_ghep.add(tid)

            # OCR chỉ chạy khi CHƯA chốt và đến lượt
            if (t['state'] in (NEW, OCR_PENDING)
                    and conf >= NGUONG_PHAT_HIEN_OCR
                    and now - t['last_ocr'] >= OCR_INTERVAL):
                self._ocr_track(frame, t, now)
                so_ocr += 1
                if t['moi_xac_nhan']:
                    vua_xac_nhan.append(t)
                    t['moi_xac_nhan'] = False

        self.tracks = {tid: t for tid, t in self.tracks.items()
                       if now - t['last'] <= self._giu(t)}
        return vua_xac_nhan, so_ocr

    def ket_qua(self):
        """Danh sách dict cho camera/API."""
        out = []
        for t in self.tracks.values():
            out.append({
                "track_id": t['id'],
                "plate": dinh_dang(t['best']) if t['best'] else "Dang doc...",
                "ocr_score": round(t['score'], 3),
                "detection_conf": round(t['conf'], 3),
                "verified": t['state'] == CONFIRMED,
                "state": t['state'],
                "box": list(t['box']),
            })
        return out


def ve_track(frame, tracks):
    for t in tracks.values():
        x1, y1, x2, y2 = t['box']
        nhan = dinh_dang(t['best']) if t['best'] else 'Dang doc...'
        if t['state'] == CONFIRMED:
            color = (0, 255, 0)
        else:
            color = (0, 165, 255)
            nhan += ' ...'
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        cv2.putText(frame, f"#{t['id']} {nhan}", (x1, max(20, y1 - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)


def ocr_anh(anh):
    """OCR ảnh tĩnh: trả về ảnh đã vẽ."""
    boxes = lay_boxes(phat_hien_bien_so(anh, CONF_BIEN_SO))
    annotated = anh.copy()
    for box, _, _ in boxes:
        txt, score = doc_mot_bien(anh, box)
        x1, y1, x2, y2 = box
        cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(annotated, dinh_dang(chuan_hoa(txt)) if txt else 'Khong doc duoc', (x1, max(20, y1 - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, .65, (0, 255, 0), 2)
        print('OCR:', txt, '| diem ky tu thap nhat:', round(score, 3))
    return annotated