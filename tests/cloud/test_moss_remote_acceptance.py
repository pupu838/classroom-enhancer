"""The remote acceptance CLI must stop on failure and retain safe diagnostics."""
import json
import os
from pathlib import Path
import runpy
import sys
import tempfile
import unittest
from unittest.mock import patch

import httpx


SCRIPT = Path(__file__).resolve().parents[2] / 'scripts/check-moss-remote.py'


class RemoteAcceptanceFailureTest(unittest.TestCase):
    def test_billing_hold_blocks_before_credentials_audio_or_network(self):
        for source in ('environment', 'marker'):
            with self.subTest(source=source):
                argv = [str(SCRIPT), 'nonexistent-private-audio.m4a', 'unused-report.json']
                environment = {'CE_MOSS_REMOTE_BLOCKED': '1'} if source == 'environment' else {}
                with patch.dict(os.environ, environment, clear=True), patch.object(sys, 'argv', argv), \
                        patch('pathlib.Path.exists', return_value=source == 'marker'), \
                        patch('httpx.Client') as client, \
                        self.assertRaisesRegex(SystemExit, 'no request issued'):
                    runpy.run_path(str(SCRIPT), run_name='__main__')
                client.assert_not_called()

    def test_resource_failure_is_reported_once_without_credentials(self):
        for rounds in (1, 2):
            with self.subTest(rounds=rounds), tempfile.TemporaryDirectory() as temp:
                source = Path(temp) / 'clip.m4a'
                source.write_bytes(b'private-test-audio' * 4)
                report = Path(temp) / 'result.json'
                calls = []

                class Client:
                    def __init__(self, **options):
                        assert options['follow_redirects'] is False

                    def __enter__(self):
                        return self

                    def __exit__(self, *args):
                        pass

                    def post(self, url, **kwargs):
                        calls.append(url)
                        return httpx.Response(449, json={'Response': {
                            'Error': {'Code': 'InsufficientResources',
                                      'Message': 'No GPU; private-token-' * 4},
                            'RequestId': 'support-request-123',
                            'untrusted': kwargs['content'].decode(),
                        }})

                environment = {'CE_MOSS_URL': 'https://private.example/enhance',
                               'CE_MOSS_TOKEN': 'private-token-' * 4}
                argv = [str(SCRIPT), str(source), str(report), '--rounds', str(rounds)]
                with patch.dict(os.environ, environment, clear=True), patch.object(sys, 'argv', argv), \
                        patch('pathlib.Path.exists', return_value=False), \
                        patch('httpx.Client', Client), self.assertRaises(SystemExit):
                    runpy.run_path(str(SCRIPT), run_name='__main__')
                self.assertEqual(len(calls), 1)
                raw = report.read_text(encoding='utf-8')
                result = json.loads(raw)
                self.assertEqual(result['requests'], 1)
                self.assertEqual(result['maximumRequests'], rounds)
                self.assertEqual(result['httpStatus'], 449)
                self.assertEqual(result['diagnostic']['RequestId'], 'support-request-123')
                self.assertNotIn(environment['CE_MOSS_TOKEN'], raw)
                self.assertNotIn('untrusted', raw)
                self.assertNotIn('private-test-audio', raw)
                self.assertEqual(result['results'], [])


if __name__ == '__main__':
    unittest.main()
