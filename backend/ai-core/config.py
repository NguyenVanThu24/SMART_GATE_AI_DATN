"""Cấu hình toàn hệ thống, đọc từ biến môi trường (env). Xem .env.example."""
import os

try:  # tùy chọn: nạp file .env khi chạy ngoài Docker
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def _s(name, default=""):
    return os.getenv(name, default)


def _f(name, default):
    return float(os.getenv(name, default))


def _i(name, default):
    return int(os.getenv(name, default))


def _b(name, default):
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


# ---------- Model phát hiện ----------
MODEL_XE = _s("MODEL_XE", "yolov8n.pt")
CONF_XE = _f("CONF_XE", 0.25)
BAT_NHAN_DANG_XE = _b("BAT_NHAN_DANG_XE", False)  # camera: chạy thêm YOLO xe (tốn CPU, hiện không vẽ)

FILE_MODEL_BIEN_SO = _s("FILE_MODEL_BIEN_SO", "DetectLisence_YOLO11.pt")
URL_MODEL_BIEN_SO = _s(
    "URL_MODEL_BIEN_SO",
    "https://raw.githubusercontent.com/ddkhoa2605/LicensePlateDetection/main/DetectLisence_YOLO11.pt",
)
CONF_BIEN_SO = _f("CONF_BIEN_SO", 0.10)          # ngưỡng để giữ khung / ghim vị trí
IMGSZ_BIEN_SO = _i("IMGSZ_BIEN_SO", 1280)
NGUONG_PHAT_HIEN_OCR = _f("NGUONG_PHAT_HIEN_OCR", 0.0)  # 0 = OCR mọi biển đã phát hiện

# ---------- OCR ----------
OCR_BASE_URL = _s("OCR_BASE_URL", "https://raw.githubusercontent.com/ddkhoa2605/LicensePlateDetection/main/")
FILE_OCR_MODEL = _s("FILE_OCR_MODEL", "cct_s_v1_vn.onnx")
FILE_OCR_CONFIG = _s("FILE_OCR_CONFIG", "cct_s_v1_vn_plate_config.yaml")
OCR_DEVICE = _s("OCR_DEVICE", "cpu")
NGUONG_OCR = _f("NGUONG_OCR", 0.70)              # điểm ký tự thấp nhất tối thiểu của 1 lần OCR
SO_LAN_XAC_NHAN = _i("SO_LAN_XAC_NHAN", 3)       # số lần OCR trùng khớp để chốt biển số
OCR_TOI_DA_MOI_XE = _i("OCR_TOI_DA_MOI_XE", 10)  # cửa sổ trượt: số lần đọc gần nhất dùng để bỏ phiếu
OCR_INTERVAL = _f("OCR_INTERVAL", 0.2)           # giây giữa 2 lần OCR của cùng 1 biển

# ---------- Tracking ----------
FPS_MUC_TIEU = _f("FPS_MUC_TIEU", 15)
IOU_GHEP_BIEN_SO = _f("IOU_GHEP_BIEN_SO", 0.25)
THOI_GIAN_GIU_TRACK = _f("THOI_GIAN_GIU_TRACK", 1.0)      # giây; track chưa chốt mất biển quá lâu thì xóa
THOI_GIAN_GIU_DA_CHOT = _f("THOI_GIAN_GIU_DA_CHOT", 5.0)  # giây; track ĐÃ CHỐT được giữ lâu hơn

# ---------- Camera / web ----------
RTSP_URL = _s("RTSP_URL", "")
JPEG_QUALITY = _i("JPEG_QUALITY", 80)
WEB_WIDTH = _i("WEB_WIDTH", 960)
WEB_HEIGHT = _i("WEB_HEIGHT", 540)
STREAM_INTERVAL = _f("STREAM_INTERVAL", 0.067)
AI_INTERVAL = _f("AI_INTERVAL", 0.1)             # giây giữa 2 lần phát hiện biển số
CAMERA_RETRY_DELAY = _f("CAMERA_RETRY_DELAY", 3)
SERVER_HOST = _s("SERVER_HOST", "0.0.0.0")
SERVER_PORT = _i("SERVER_PORT", 5000)

# ---------- API ----------
API_URL = _s("AI_API_URL", "http://server:3000/api/ai/detect")
API_KEY = _s("AI_API_KEY", "")
GATE_ID = _i("GATE_ID", 1)
MIN_OCR_SCORE = _f("MIN_OCR_SCORE", NGUONG_OCR)  # nên <= NGUONG_OCR, nếu không biển điểm thấp sẽ không được gửi
COOLDOWN = _f("COOLDOWN", 30)
API_TIMEOUT = _f("API_TIMEOUT", 5)
DO_DAI_BIEN_MIN = _i("DO_DAI_BIEN_MIN", 7)
DO_DAI_BIEN_MAX = _i("DO_DAI_BIEN_MAX", 10)

# ---------- Ảnh/video ----------
OUTPUT_DIR = _s("OUTPUT_DIR", "/data")
FPS_MAC_DINH_VIDEO = _f("FPS_MAC_DINH_VIDEO", 25)