# Moss first-choice integration — still in progress

The user selected `preferred-audition.json` and explicitly requested that it be
used in the **school replay player**, not merely saved on the audition page.
Keep the entire profile unchanged, including gain 0 dB. The user will adjust
listening volume. Do not run another loudness preference trial.

## Completed

- Audition preset 12 and the top “我的首选” button apply the exact profile.
  Actual Chrome Web Audio playback and exported settings were checked. Existing
  private audition links remain valid. A rapid preset-then-play race was fixed.
- Original ONNX WebGPU graph failed on an Einsum shader. All 132 Einsum nodes
  were replaced with equivalent broadcasting/MatMul operations; static shape
  simplification reduced the graph to 4,459 nodes and 14,165,259 bytes.
- CPU validation on the same real classroom STFT block: relative RMS difference
  3.4812e-7, maximum absolute difference 1.6332e-5. Float32 weights retained.
- Chrome/Intel gen-12lp actual classroom block: cold run 15.63 s, steady runs
  8.665 and 8.657 s per 2.5 s of audio. This is too slow for uninterrupted live
  enhancement. It is not an M1 iPad performance measurement.
- The full-half-precision attempt produced nonfinite output and is rejected.
  A separate mixed conversion experiment was stopped; it is not a shipped model.
- A short device check now runs the actual validated model in a dedicated
  worker, with explicit start/stop, hidden-page cancellation, a 120-second cap,
  SHA-256 checked versioned assets, and three finite-output checked runs.
  It uses synthetic input of the same dimensions, not school media.
- Local worker check on this Windows GPU: 11.88 / 7.28 / 7.51 s. The page stays
  responsive, the graph produces valid output, and results can be copied.

## Outstanding requirement

**Moss audio is not yet connected to school replay. Do not claim it is working
or replace it with RNNoise under the same name.** The current school runtime
remains 0.9.2 with its independent real-time RNNoise controls.

First obtain the M1 iPad device-check result. Suggested throughput headroom is
under 1.875 s per 2.5 s at 1x, or under 0.9375 s at 2x; this is a planning gate,
not a stability guarantee. Physical device measurements are needed because the
available computer uses a different GPU and browser platform.

If throughput is adequate, finish a bounded lookahead pipeline, with no whole
lesson download prerequisite, pitch-preserving playback rate, original/processed
comparison, fixed video clock, seek resets, and all three audio sources. Existing
audio must remain usable during initialization and failed processing.

If throughput is inadequate, discuss the actual buffering/cloud tradeoff with
the user instead of publishing an enhancement that repeatedly stalls.

## Reproduction

Export with `processor/moss_webgpu_export.py INPUT.onnx OUTPUT.onnx` using
onnx, onnxsim, NumPy. The original converted model was pinned to Hugging Face
TigreGotico/audiosronnx-mossformergan revision
`5f471c9d92dda80c0883cc850227fd878b334b08`.

Package using `scripts/build-moss-assets.mjs RESEARCH_DIR` with the validated
graph and the extracted `onnxruntime-web@1.30.0` distribution. The WASM module
is split into two bounded files for the static host. Model/runtime license and
notices are shipped alongside the assets.
