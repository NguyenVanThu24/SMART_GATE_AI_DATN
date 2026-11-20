import time
import threading

import cv2
from flask import Flask, Response, jsonify

from config import (RTSP_URL, JPEG_QUALITY, WEB_WIDTH, WEB_HEIGHT, STREAM_INTERVAL,
                    AI_INTERVAL, CAMERA_RETRY_DELAY, SERVER_HOST, SERVER_PORT)
from camera_ai import xu_ly_frame, reset as reset_tracker
from api_client import gui_bien_so

app = Flask(__name__)

latest_raw = None
latest_frame = None
latest_results = []
_log_truoc = None

frame_lock = threading.Lock()


def doc_camera():
    """Doc camera RTSP lien tuc."""
    global latest_raw, latest_frame

    while True:
        cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)

        if not cap.isOpened():
            print(f"Khong ket noi duoc camera. Thu lai sau {CAMERA_RETRY_DELAY} giay.")
            cap.release()
            time.sleep(CAMERA_RETRY_DELAY)
            continue

        print("Da ket noi camera")

        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    print("Mat ket noi camera. Dang thu lai...")
                    break

                with frame_lock:
                    latest_raw = frame.copy()
                    ket_qua = list(latest_results)

                frame_web = cv2.resize(frame, (WEB_WIDTH, WEB_HEIGHT))
                sx = frame_web.shape[1] / frame.shape[1]
                sy = frame_web.shape[0] / frame.shape[0]

                for item in ket_qua:
                    x1, y1, x2, y2 = item["box"]
                    x1, y1, x2, y2 = int(x1 * sx), int(y1 * sy), int(x2 * sx), int(y2 * sy)

                    # Da chot: vang | Dang OCR/that bai: cam. Khung luon bam theo bien so.
                    color = (0, 255, 255) if item["verified"] else (0, 165, 255)
                    cv2.rectangle(frame_web, (x1, y1), (x2, y2), color, 2)
                    cv2.putText(frame_web, item["plate"], (x1, max(25, y1 - 8)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)

                success, encoded = cv2.imencode(
                    ".jpg", frame_web, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
                if success:
                    with frame_lock:
                        latest_frame = encoded.tobytes()

        finally:
            cap.release()
            with frame_lock:
                latest_raw = None
                latest_frame = None
                latest_results.clear()

        time.sleep(2)


def xu_ly_ai():
    """Phat hien bien so lien tuc (AI_INTERVAL); OCR chi chay den khi chot."""
    global latest_results, _log_truoc

    so_luot, moc_log = 0, time.monotonic()

    while True:
        bat_dau = time.monotonic()

        with frame_lock:
            frame = latest_raw.copy() if latest_raw is not None else None

        if frame is None:
            reset_tracker()
            time.sleep(0.2)
            continue

        try:
            ket_qua, moi_chot = xu_ly_frame(frame, bat_dau)

            with frame_lock:
                latest_results = ket_qua

            # Log khi trang thai thay doi (de debug)
            tom_tat = [(k["track_id"], k["state"], k["plate"], k["detection_conf"]) for k in ket_qua]
            if tom_tat != _log_truoc:
                print("TRACK:", tom_tat, flush=True)
                _log_truoc = tom_tat

            # Moi bien so chi gui API 1 lan, ngay luc duoc chot
            for item in moi_chot:
                print("CHOT BIEN SO:", item["plate"], "| OCR:", item["ocr_score"])
                gui_bien_so(item)
        except Exception as e:
            print("Loi xu ly AI:", e)

        # Do toc do phat hien thuc te (de biet may co theo kip khong)
        so_luot += 1
        bay_gio = time.monotonic()
        if bay_gio - moc_log >= 5:
            print(f"AI: {so_luot / (bay_gio - moc_log):.1f} lan phat hien/giay", flush=True)
            so_luot, moc_log = 0, bay_gio

        time.sleep(max(0.0, AI_INTERVAL - (time.monotonic() - bat_dau)))


def tao_luong_mjpeg():
    """Phat video MJPEG cho React."""
    while True:
        with frame_lock:
            frame = latest_frame

        if frame is None:
            time.sleep(0.1)
            continue

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + frame
            + b"\r\n"
        )
        time.sleep(STREAM_INTERVAL)


@app.route("/video_feed")
def video_feed():
    return Response(
        tao_luong_mjpeg(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-store"},
    )


@app.route("/health")
def health():
    with frame_lock:
        camera_ok = latest_frame is not None
        results = list(latest_results)

    return jsonify({
        "service": "smartgate-ai-camera",
        "camera_connected": camera_ok,
        "detections": results,
    })


if __name__ == "__main__":
    if not RTSP_URL:
        raise RuntimeError("Chua cau hinh RTSP_URL")

    threading.Thread(target=doc_camera, daemon=True).start()
    threading.Thread(target=xu_ly_ai, daemon=True).start()

    app.run(host=SERVER_HOST, port=SERVER_PORT, threaded=True, debug=False)