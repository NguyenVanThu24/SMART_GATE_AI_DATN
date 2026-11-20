"""Nhan dien bien so tren camera: phat hien lien tuc, OCR den khi chot roi dung."""

from config import BAT_NHAN_DANG_XE
from ocr import BienSoTracker

tracker = BienSoTracker()


def xu_ly_frame(frame, now):
    """
    Xu ly AI tren mot frame BGR.

    Tra ve:
        ket_qua: danh sach bien so hien co (kem state, ocr_score, box)
        vua_xac_nhan: danh sach bien so VUA duoc chot trong luot nay
    """
    vua_xn, _ = tracker.update(frame, now)

    if BAT_NHAN_DANG_XE:
        from nhan_dang_xe import phat_hien_xe, lay_boxes  # chi nap khi bat
        lay_boxes(phat_hien_xe(frame))

    ket_qua = tracker.ket_qua()
    ids = {t['id'] for t in vua_xn}
    moi = [k for k in ket_qua if k["track_id"] in ids]
    return ket_qua, moi


def reset():
    tracker.reset()