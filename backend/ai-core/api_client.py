import json
import re
import time
import urllib.request
import urllib.error

from config import (API_URL, API_KEY, GATE_ID, MIN_OCR_SCORE, COOLDOWN, API_TIMEOUT,
                    DO_DAI_BIEN_MIN, DO_DAI_BIEN_MAX)

lan_gui_cuoi = {}


def chuan_hoa_bien_so(plate):
    return re.sub(r"[^A-Z0-9]", "", plate.upper())


def gui_bien_so(item):
    plate = item.get("plate", "")
    score = float(item.get("ocr_score", 0))

    if not item.get("verified", False):
        return False

    if score < MIN_OCR_SCORE:
        return False

    plate_key = chuan_hoa_bien_so(plate)

    if not DO_DAI_BIEN_MIN <= len(plate_key) <= DO_DAI_BIEN_MAX:
        return False

    now = time.monotonic()

    if now - lan_gui_cuoi.get(plate_key, -float("inf")) < COOLDOWN:
        return False

    if not API_KEY:
        print("Chua cau hinh AI_API_KEY")
        return False

    payload = {
        "gate_id": GATE_ID,
        "plate": plate,
        "confidence": round(score * 100, 2),
    }

    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-api-key": API_KEY},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=API_TIMEOUT) as response:
            result = json.load(response)

        lan_gui_cuoi[plate_key] = time.monotonic()
        print("DA LUU MYSQL:", plate, "| ID:", result.get("id"), "| Ket qua:", result.get("result"))
        return True

    except urllib.error.HTTPError as e:
        print("API HTTP ERROR:", e.code)
    except Exception as e:
        print("Loi gui API:", e)

    return False