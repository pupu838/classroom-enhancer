FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY cloud/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY cloud /app/cloud
ENV CE_DATA=/data
VOLUME /data
CMD ["uvicorn", "cloud.app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
