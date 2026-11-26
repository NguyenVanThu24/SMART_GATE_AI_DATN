"""Xu ly anh bang chung nhan dien bien so."""

import base64
import math

import cv2


SNAPSHOT_QUALITY = 85
PLATE_QUALITY = 95


def encode_jpeg(image, quality):
    """Nen JPEG va ma hoa Base64."""

    if image is None or image.size == 0:
        raise ValueError("Anh khong hop le")

    success, encoded = cv2.imencode(
        ".jpg",
        image,
        [cv2.IMWRITE_JPEG_QUALITY, quality]
    )

    if not success:
        raise RuntimeError("Khong the ma hoa JPEG")

    return base64.b64encode(
        encoded.tobytes()
    ).decode("ascii")


def crop_plate(frame, box):
    """Cat anh bien so, gioi han toa do trong frame."""

    if frame is None or frame.size == 0:
        raise ValueError("Frame khong hop le")

    if box is None or len(box) != 4:
        raise ValueError("Bounding box khong hop le")

    height, width = frame.shape[:2]

    x1, y1, x2, y2 = map(float, box)

    x1 = max(0, min(width, math.floor(x1)))
    y1 = max(0, min(height, math.floor(y1)))
    x2 = max(0, min(width, math.ceil(x2)))
    y2 = max(0, min(height, math.ceil(y2)))

    if x2 <= x1 or y2 <= y1:
        raise ValueError("Vung bien so khong hop le")

    return frame[y1:y2, x1:x2].copy()


def create_evidence(frame, box):
    """Tao anh toan canh va anh bien so."""

    plate_image = crop_plate(frame, box)

    return {
        "snapshot_base64": encode_jpeg(
            frame, SNAPSHOT_QUALITY
        ),
        "plate_base64": encode_jpeg(
            plate_image, PLATE_QUALITY
        ),
    }
