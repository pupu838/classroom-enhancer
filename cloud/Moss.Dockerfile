# Build from repository root. GPU and CUDA 12.8+/cuDNN 9 required at runtime.
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04 AS build
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
# Keep the complete cuDNN implementation and ONNX CUDA dependencies, but omit
# unused CUDA components (NCCL, cuSPARSE, cuSOLVER, NPP, NVJPEG). The model and
# runtime versions are unchanged. Copy symlinks instead of duplicating binaries.
RUN mkdir -p /opt/gpu-libs/blas /opt/gpu-libs/dnn /opt/gpu-libs/fft /opt/gpu-libs/misc && \
    for pattern in 'libcudart.so*' 'libcublas.so*' 'libcublasLt.so*' 'libcufft.so*' 'libcurand.so*' 'libnvrtc.so*' 'libnvrtc-builtins.so*' 'libnvJitLink.so*' 'libcudnn*.so*'; do \
      case "$pattern" in libcublas*) group=blas;; libcudnn*) group=dnn;; libcufft*) group=fft;; *) group=misc;; esac; \
      find /usr/local/cuda/targets/x86_64-linux/lib /usr/lib/x86_64-linux-gnu -maxdepth 1 -name "$pattern" -exec cp -P -t /opt/gpu-libs/$group {} +; \
    done

FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 CE_MOSS_MODEL=/opt/models/moss-se16k.onnx \
    PATH=/opt/venv/bin:$PATH NVIDIA_VISIBLE_DEVICES=all NVIDIA_DRIVER_CAPABILITIES=compute,utility \
    NVIDIA_REQUIRE_CUDA="cuda>=12.8"
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
# Separate complete library families into independently verifiable layers.
# A slow or interrupted registry connection need not resend one giant blob.
COPY --from=build /opt/gpu-libs/blas/ /usr/local/lib/
COPY --from=build /opt/gpu-libs/dnn/ /usr/local/lib/
COPY --from=build /opt/gpu-libs/fft/ /usr/local/lib/
COPY --from=build /opt/gpu-libs/misc/ /usr/local/lib/
COPY --from=build /opt/venv/ /opt/venv/
COPY --from=build /opt/models/ /opt/models/
COPY --from=build /app/cloud/ /app/cloud/
COPY --from=build /NGC-DL-CONTAINER-LICENSE /NGC-DL-CONTAINER-LICENSE
COPY --from=build /usr/share/doc/ /usr/share/doc/
RUN ldconfig && python3 -c "import pathlib,subprocess; p=next(pathlib.Path('/opt/venv').rglob('libonnxruntime_providers_cuda.so')); r=subprocess.check_output(['ldd',str(p)],text=True); print(r); assert 'not found' not in r, 'Missing CUDA shared-library dependency'"
WORKDIR /app
# Tencent SCF WebServer images require 0.0.0.0:9000 (not an arbitrary port).
# The model stays lazy: the HTTP listener starts without GPU initialization.
EXPOSE 9000
CMD ["uvicorn","cloud.moss_service:create_app","--factory","--host","0.0.0.0","--port","9000","--workers","1","--limit-concurrency","2"]
