"""Inspect an OCI archive without loading image layers or contacting a cloud."""
import json
from pathlib import Path
import sys
import tarfile


def inspect(path):
    with tarfile.open(path) as archive:
        def read_json(name):
            source = archive.extractfile(name)
            if source is None:
                raise ValueError('Missing OCI metadata')
            return json.load(source)

        def blob(digest):
            algorithm, value = digest.split(':', 1)
            if algorithm != 'sha256' or len(value) != 64 or any(c not in '0123456789abcdef' for c in value):
                raise ValueError('Invalid OCI digest')
            return read_json('blobs/sha256/' + value)

        def images(index):
            for entry in index['manifests']:
                value = blob(entry['digest'])
                if 'manifests' in value:
                    yield from images(value)
                elif 'layers' in value:
                    yield value

        candidates = []
        for manifest in images(read_json('index.json')):
            config = blob(manifest['config']['digest'])
            if config.get('os') == 'linux' and config.get('architecture') == 'amd64':
                candidates.append((manifest, config))
        if len(candidates) != 1:
            raise ValueError('Expected exactly one Linux amd64 image')
        manifest, config = candidates[0]
        size = sum(layer['size'] for layer in manifest['layers'])
        if '9000/tcp' not in config.get('config', {}).get('ExposedPorts', {}):
            raise ValueError('SCF listener port 9000 not exposed')
        return {
            'platform': 'linux/amd64', 'port': 9000,
            'compressedLayerBytes': size,
            'documentedScfDefaultLimitBytes': 1000000000,
            'needsImageQuotaConfirmation': size >= 1000000000,
            'gpuRuntimeTested': False,
            'note': 'Image build and CPU-host listener only. No Tencent resource created; GPU driver compatibility and account quota remain unverified.'
        }


if __name__ == '__main__':
    result = inspect(sys.argv[1])
    Path(sys.argv[2]).write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
