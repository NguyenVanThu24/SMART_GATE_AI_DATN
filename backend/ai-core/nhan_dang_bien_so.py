"""Nhận dạng vị trí biển số (YOLO11).
Model: https://github.com/ddkhoa2605/LicensePlateDetection
"""
from pathlib import Path
from urllib.request import urlretrieve
from ultralytics import YOLO

from config import CONF_BIEN_SO, FILE_MODEL_BIEN_SO, URL_MODEL_BIEN_SO, IMGSZ_BIEN_SO

model_bien_so = None


def khoi_tao_model_bien_so():
    global model_bien_so
    if model_bien_so is None:
        if not Path(FILE_MODEL_BIEN_SO).exists():
            urlretrieve(URL_MODEL_BIEN_SO, FILE_MODEL_BIEN_SO)
        model_bien_so = YOLO(FILE_MODEL_BIEN_SO)
    return model_bien_so


def phat_hien_bien_so(frame, conf=CONF_BIEN_SO):
    """Phát hiện biển số bằng YOLO11."""
    return khoi_tao_model_bien_so()(
        frame,
        conf=conf,
        imgsz=IMGSZ_BIEN_SO,
        verbose=False,
    )[0]


def iou_box(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    inter = max(0, min(ax2, bx2) - max(ax1, bx1)) * max(0, min(ay2, by2) - max(ay1, by1))
    union = max(1, (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter)
    return inter / union