"""Optional deployment adapter; importing this file creates no cloud resources.

Deployment requires account/payment authorization. Gateway remains disabled
until an actual GPU benchmark and playback test pass.
"""
from pathlib import Path
import modal

ROOT = Path(__file__).resolve().parents[1]
image = (modal.Image.from_registry('nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04', add_python='3.12')
         .apt_install('ffmpeg')
         .pip_install_from_requirements(ROOT / 'cloud/moss-requirements.txt')
         .add_local_file(ROOT / 'cloud/moss_engine.py', '/app/cloud/moss_engine.py')
         .add_local_file(ROOT / 'cloud/moss_service.py', '/app/cloud/moss_service.py')
         .add_local_file(ROOT / 'portal/tablet/vendor/moss-fp32-ort130-708b725800ee/moss-se16k.onnx', '/opt/models/moss-se16k.onnx')
         .add_local_file(ROOT / 'portal/tablet/vendor/moss-fp32-ort130-708b725800ee/MODEL-LICENSE.txt', '/opt/models/MODEL-LICENSE.txt')
         .add_local_file(ROOT / 'portal/tablet/vendor/moss-fp32-ort130-708b725800ee/MODEL-NOTICE.txt', '/opt/models/MODEL-NOTICE.txt')
         .env({'PYTHONPATH': '/app', 'CE_MOSS_MODEL': '/opt/models/moss-se16k.onnx'}))
app = modal.App('classroom-moss-private')


@app.function(image=image, gpu='L4', cpu=2, memory=6144, min_containers=0,
              max_containers=1, scaledown_window=30, timeout=60,
              secrets=[modal.Secret.from_name('classroom-moss-private')])
@modal.concurrent(max_inputs=1)
@modal.asgi_app(requires_proxy_auth=True)
def service():
    from cloud.moss_service import create_app
    return create_app()
