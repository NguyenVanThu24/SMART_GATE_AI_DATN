import json
import re
import time
import uuid
import queue
import threading
import urllib.request
import urllib.error

from evidence import create_evidence

from config import (
    API_URL, API_KEY, GATE_ID, MIN_OCR_SCORE,
    COOLDOWN, API_TIMEOUT,
    DO_DAI_BIEN_MIN, DO_DAI_BIEN_MAX
)

lan_gui_cuoi = {}
_lock = threading.Lock()

# Hang doi gui API, khong chan vong lap AI
_hang_doi = queue.Queue(maxsize=100)
_worker_started = False

# Gioi han bo nho frame bang chung dang cho
MAX_EVIDENCE_BYTES = 64 * 1024 * 1024
_evidence_bytes = 0

MAX_RETRY = 3
RETRY_DELAY = 2


def chuan_hoa_bien_so(plate):
    return re.sub(r"[^A-Z0-9]", "", plate.upper())


def _gui_request(payload):
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-api-key": API_KEY
        },
        method="POST",
    )

    with urllib.request.urlopen(
        request, timeout=API_TIMEOUT
    ) as response:
        return json.load(response)


def _worker():
    global _evidence_bytes

    while True:
        payload, frame, box = _hang_doi.get()
        plate = payload["plate"]

        # Xu ly anh mot lan, tai su dung khi retry
        if frame is not None:
            try:
                images = create_evidence(frame, box)

                candidate = {**payload, **images}

                # Du phong gioi han JSON 5 MB cua Backend
                if len(json.dumps(candidate).encode("utf-8")) <= 4 * 1024 * 1024:
                    payload.update(images)
                else:
                    print("ANH BANG CHUNG QUA LON:", plate, flush=True)

            except Exception as e:
                print("LOI XU LY ANH:", plate, str(e), flush=True)

            finally:
                with _lock:
                    _evidence_bytes -= frame.nbytes

                frame = None

        try:
            for attempt in range(1, MAX_RETRY + 1):
                try:
                    result = _gui_request(payload)

                    print(
                        "DA LUU MYSQL:",
                        plate,
                        "| ID:", result.get("id"),
                        "| Event:", payload["event_id"],
                        "| Ket qua:", result.get("result"),
                        flush=True
                    )
                    break

                except urllib.error.HTTPError as e:
                    print(
                        "API HTTP ERROR:",
                        e.code,
                        "| Bien:", plate,
                        flush=True
                    )

                    # Loi 4xx thuong khong nen gui lai
                    if 400 <= e.code < 500:
                        break

                except Exception as e:
                    print(
                        "Loi gui API:",
                        str(e),
                        "| Lan:", attempt,
                        flush=True
                    )

                if attempt < MAX_RETRY:
                    time.sleep(RETRY_DELAY)

            else:
                print(
                    "GUI API THAT BAI SAU RETRY:",
                    plate,
                    "| Event:", payload["event_id"],
                    flush=True
                )

        finally:
            _hang_doi.task_done()


def _khoi_dong_worker():
    global _worker_started

    with _lock:
        if not _worker_started:
            threading.Thread(
                target=_worker,
                daemon=True,
                name="smartgate-api-worker"
            ).start()
            _worker_started = True


def gui_bien_so(item, frame=None):
    global _evidence_bytes
    plate = item.get("plate", "")
    score = float(item.get("ocr_score", 0))

    if not item.get("verified", False):
        return False

    if score < MIN_OCR_SCORE:
        return False

    plate_key = chuan_hoa_bien_so(plate)

    if not DO_DAI_BIEN_MIN <= len(plate_key) <= DO_DAI_BIEN_MAX:
        return False

    if not API_KEY:
        print("Chua cau hinh AI_API_KEY")
        return False

    now = time.monotonic()

    with _lock:
        if now - lan_gui_cuoi.get(
            plate_key, -float("inf")
        ) < COOLDOWN:
            return False

        # Tao UUID mot lan cho su kien moi
        event_id = str(uuid.uuid4())

        payload = {
            "event_id": event_id,
            "gate_id": GATE_ID,
            "plate": plate,
            "confidence": round(score * 100, 2),
        }

        evidence_frame = None
        evidence_box = None

        if _hang_doi.full():
            print("HANG DOI API DAY:", plate, flush=True)
            return False

        if frame is not None and item.get("box") is not None:
            if _evidence_bytes + frame.nbytes <= MAX_EVIDENCE_BYTES:
                evidence_box = tuple(item["box"])
                evidence_frame = frame.copy()
                _evidence_bytes += evidence_frame.nbytes
            else:
                print("BO NHO ANH DA DAY:", plate, flush=True)

        try:
            _hang_doi.put_nowait(
                (payload, evidence_frame, evidence_box)
            )

        except queue.Full:
            if evidence_frame is not None:
                _evidence_bytes -= evidence_frame.nbytes

            print("HANG DOI API DAY:", plate, flush=True)
            return False

        lan_gui_cuoi[plate_key] = now

    _khoi_dong_worker()

    print(
        "DA XEP HANG DOI:",
        plate,
        "| Event:", event_id,
        flush=True
    )

    return True
