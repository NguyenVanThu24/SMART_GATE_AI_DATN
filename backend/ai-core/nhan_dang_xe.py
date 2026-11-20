"""Nhận dạng xe (YOLOv8n, các lớp COCO: 2=car, 3=motorcycle, 5=bus, 7=truck)."""
import cv2
from ultralytics import YOLO

from config import MODEL_XE, CONF_XE

LOP_XE = [2, 3, 5, 7]

model_xe = None


def khoi_tao_model_xe():
    global model_xe
    if model_xe is None:
        model_xe = YOLO(MODEL_XE)
    return model_xe


def phat_hien_xe(frame, conf=CONF_XE):
    """Trả về kết quả YOLO thô của xe trên 1 frame."""
    return khoi_tao_model_xe()(frame, classes=LOP_XE, conf=conf, verbose=False)[0]


def lay_boxes(kq):
    return [(tuple(map(int, b.xyxy[0].tolist())), int(b.cls.item()), float(b.conf.item())) for b in kq.boxes]


def ve_boxes(frame, boxes, names=None, mau=(0, 255, 0), nhan_mac_dinh='bien so'):
    for (x1, y1, x2, y2), cls, conf in boxes:
        ten = names.get(cls, nhan_mac_dinh) if names is not None else nhan_mac_dinh
        cv2.rectangle(frame, (x1, y1), (x2, y2), mau, 2)
        cv2.putText(frame, f'{ten} {conf:.2f}', (x1, max(20, y1 - 7)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, mau, 2)