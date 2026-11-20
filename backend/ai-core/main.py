"""File điều khiển luồng: chọn ảnh/video -> nhận dạng xe + biển số -> OCR.

Cài đặt: pip install ultralytics fast-plate-ocr onnxruntime opencv-python
Chạy:    python main.py [duong_dan_tep]
Cấu hình: biến môi trường (xem config.py / .env.example)
"""
import sys
from pathlib import Path
import cv2
import numpy as np

from config import (CONF_XE, CONF_BIEN_SO, FPS_MUC_TIEU, OUTPUT_DIR, FPS_MAC_DINH_VIDEO)
from nhan_dang_xe import khoi_tao_model_xe, phat_hien_xe, lay_boxes, ve_boxes
from nhan_dang_bien_so import khoi_tao_model_bien_so, phat_hien_bien_so
from ocr import khoi_tao_ocr, ocr_anh, BienSoTracker, ve_track


def tinh_buoc(fps):
    return max(1, round(fps / FPS_MUC_TIEU))


def hien_anh(ten, anh):
    """Lưu ảnh kết quả, không mở cửa sổ đồ họa."""
    thu_muc = Path(OUTPUT_DIR)
    thu_muc.mkdir(parents=True, exist_ok=True)
    duong_dan = thu_muc / f"{ten}.jpg"
    if not cv2.imwrite(str(duong_dan), anh):
        raise RuntimeError(f"Không thể lưu ảnh: {duong_dan}")
    print(f"Đã lưu ảnh: {duong_dan}")


def nhan_dien(frame):
    """Chạy cả hai model trên 1 ảnh, vẽ xe (xanh) và biển số (đỏ)."""
    kq_xe = phat_hien_xe(frame, CONF_XE)
    kq_bien_so = phat_hien_bien_so(frame, CONF_BIEN_SO)
    ket_qua = frame.copy()
    for kq, mau, la_bien_so in [(kq_xe, (0, 255, 0), False), (kq_bien_so, (0, 0, 255), True)]:
        for box in kq.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            ten = "bien so" if la_bien_so else kq.names[int(box.cls.item())]
            cv2.rectangle(ket_qua, (x1, y1), (x2, y2), mau, 2)
            cv2.putText(ket_qua, f"{ten} {box.conf.item():.2f}", (x1, max(20, y1 - 5)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, mau, 2)
    print("Số xe:", len(kq_xe.boxes), "| Số biển số:", len(kq_bien_so.boxes))
    return ket_qua


def mo_video(ten_file, hau_to, fps_mac_dinh):
    cap = cv2.VideoCapture(ten_file)
    if not cap.isOpened():
        raise ValueError("Không mở được video.")
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not np.isfinite(fps) or fps <= 0:
        fps = fps_mac_dinh
    tong = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    ok, frame = cap.read()
    if not ok:
        cap.release()
        raise ValueError("Video không có khung hình đọc được.")
    h, w = frame.shape[:2]
    dau_ra = str(Path(ten_file).with_name(Path(ten_file).stem + hau_to))
    writer = cv2.VideoWriter(dau_ra, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    if not writer.isOpened():
        cap.release()
        raise RuntimeError("Không tạo được video đầu ra.")
    return cap, writer, fps, tong, ok, frame, dau_ra


def video_nhan_dien(ten_file):
    cap, writer, fps, tong, ok, frame, dau_ra = mo_video(ten_file, "_nhan_dien.mp4", FPS_MAC_DINH_VIDEO)
    buoc = tinh_buoc(fps)
    print(f"Camera: {fps:.1f} FPS | YOLO: mỗi {buoc} frame (~{fps/buoc:.1f} FPS)")
    dem = 0
    boxes_xe, boxes_bien = [], []
    names_xe = khoi_tao_model_xe().names
    try:
        while ok:
            if dem % buoc == 0:
                boxes_xe = lay_boxes(phat_hien_xe(frame, CONF_XE))
                boxes_bien = lay_boxes(phat_hien_bien_so(frame, CONF_BIEN_SO))
            ket_qua = frame.copy()
            ve_boxes(ket_qua, boxes_xe, names_xe, (0, 255, 0))
            ve_boxes(ket_qua, boxes_bien, None, (0, 0, 255))
            writer.write(ket_qua)
            dem += 1
            if dem % 90 == 0:
                print(f"\rĐã xử lý {dem}/{tong} frame", end="")
            ok, frame = cap.read()
    finally:
        cap.release()
        writer.release()
    print(f"\nHoàn tất: {dau_ra}")


def video_ocr(ten_file):
    cap, writer, fps, tong, ok, frame, dau_ra = mo_video(ten_file, "_ocr.mp4", FPS_MAC_DINH_VIDEO)
    buoc = tinh_buoc(fps)
    print(f"Video {fps:.1f} FPS, phát hiện biển số mỗi {buoc} frame (~{fps/buoc:.1f} FPS).")
    tracker = BienSoTracker()
    dem = 0
    tong_ocr = 0
    try:
        while ok:
            if dem % buoc == 0:
                vua_xn, so_ocr = tracker.update(frame, dem / fps)  # thời gian video
                tong_ocr += so_ocr
                for t in vua_xn:
                    print(f"\nĐã chốt biển số #{t['id']}: {t['best']} ({t['score']:.2f})")
            annotated = frame.copy()
            ve_track(annotated, tracker.tracks)
            writer.write(annotated)
            dem += 1
            if dem % 90 == 0:
                print(f"\rĐã ghi {dem}/{tong} frame | OCR {tong_ocr} lần", end="")
            ok, frame = cap.read()
    finally:
        cap.release()
        writer.release()
    print(f"\nHoàn tất: {dau_ra} | Số lần OCR: {tong_ocr}")


def main():
    loai = input("Nhập 1 để chọn ảnh, 2 để chọn video: ").strip()
    if loai not in ("1", "2"):
        raise ValueError("Chỉ nhập 1 hoặc 2.")

    ten_file = sys.argv[1] if len(sys.argv) > 1 else input("Nhập đường dẫn tệp: ").strip().strip('"')
    if not Path(ten_file).is_file():
        raise ValueError("Bạn chưa chọn tệp hợp lệ.")

    khoi_tao_model_xe()
    khoi_tao_model_bien_so()
    khoi_tao_ocr()
    print("Xanh: xe | Đỏ: biển số")

    if loai == "1":
        anh = cv2.imdecode(np.fromfile(ten_file, dtype=np.uint8), cv2.IMREAD_COLOR)
        if anh is None:
            raise ValueError("Không đọc được ảnh.")
        hien_anh("nhan_dien", nhan_dien(anh))
        hien_anh("ocr", ocr_anh(anh))
    else:
        video_nhan_dien(ten_file)
        video_ocr(ten_file)


if __name__ == "__main__":
    main()