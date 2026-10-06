"""CI only: actual CPU model on generated speech. Not a classroom accuracy benchmark."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
from huggingface_hub import snapshot_download
spec=importlib.util.spec_from_file_location('processor',Path(__file__).parents[1]/'processor/classroom_processor.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
with tempfile.TemporaryDirectory() as folder:
    root=Path(folder)
    # Explicit public test model download, confined to this smoke test.
    model=snapshot_download('Systran/faster-whisper-tiny',allow_patterns=['model.bin','config.json','tokenizer.json','preprocessor_config.json','vocabulary.*'])
    subprocess.run(['espeak-ng','-v','cmn','-w',str(root/'voice.wav'),'这是课堂字幕测试。水流与水力梯度有关。'],check=True)
    backend=p.WhisperBackend(model)
    data=p.process(root/'voice.wav',root/'result','smoke-test',backend)
    assert data['coverage']['status']=='complete'
    assert len(data['tracks'][0]['segments'])>0, 'No transcript returned for generated speech'
    print('PASS actual CPU Whisper adapter + ffmpeg + data package; generated speech only, not accuracy evidence')
