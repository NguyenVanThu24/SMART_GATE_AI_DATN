FROM python:3.10-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
# Anh ket qua (khi khong co man hinh) se luu vao thu muc nay
ENV OUTPUT_DIR=/data

# Thu vien he thong cho OpenCV va doc/ghi video
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Cai dat thu vien Python (tach layer de tan dung cache)
COPY requirements.txt .
RUN python -m pip install --no-cache-dir -r requirements.txt

# Thu vien doc bien moi truong tu file .env
RUN python -m pip install --no-cache-dir python-dotenv

# Sao chep ma nguon
COPY . .

# Tai san model luc build de luc chay khong can mang
RUN python -c "from nhan_dang_xe import khoi_tao_model_xe; \
from nhan_dang_bien_so import khoi_tao_model_bien_so; \
from ocr import khoi_tao_ocr; \
khoi_tao_model_xe(); khoi_tao_model_bien_so(); khoi_tao_ocr()"

# Thu muc chua anh/video dau vao va ket qua (mount tu may that)
VOLUME ["/data"]

# Mac dinh chay camera RTSP + stream web (cong 5000)
EXPOSE 5000
CMD ["python", "camera_stream.py"]

# Muon chay CLI chon anh/video:
# docker run -it --rm -v "$(pwd)/data:/data" smartgate-ai:dev python main.py