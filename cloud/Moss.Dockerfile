# Build from repository root. GPU and CUDA 12.8+/cuDNN 9 required at runtime.
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04
ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 CE_MOSS_MODEL=/opt/models/moss-se16k.onnx
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
WORKDIR /app
COPY cloud/moss-requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY cloud/moss_engine.py cloud/moss_service.py /app/cloud/
COPY portal/tablet/vendor/moss-fp32-ort130-708b725800ee/moss-se16k.onnx /opt/models/moss-se16k.onnx
COPY portal/tablet/vendor/moss-fp32-ort130-708b725800ee/MODEL-*.txt /opt/models/
RUN python3 -c "from pathlib import Path;import hashlib;assert hashlib.sha256(Path('/opt/models/moss-se16k.onnx').read_bytes()).hexdigest()=='708b725800ee43542f64c2a00a7a00289411385aecec75e8fc2295ea596be422'"
# Tencent SCF WebServer images require 0.0.0.0:9000 (not an arbitrary port).
# The model stays lazy: the HTTP listener starts without GPU initialization.
EXPOSE 9000
CMD ["uvicorn","cloud.moss_service:create_app","--factory","--host","0.0.0.0","--port","9000","--workers","1","--limit-concurrency","2"]
