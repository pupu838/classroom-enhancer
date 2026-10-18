# Moss first-choice integration — still in progress

## Physical iPad failure: test withdrawn (2026-10-18)

The user reports repeated crashes and automatic reloads on the M1 iPad, then an
EdgeOne 401 page. This overrides the positive desktop-only test results below.
Do not ask the user to repeat the local Moss test or claim that worker isolation
makes the model stable on iPad. The exact crash cause is not established.

The test HTML is now a static withdrawal notice without executable scripts or
buttons. The old worker URL is a kill switch that posts a disabled error and
closes without fetching assets or touching the GPU. Both routes send no-store.
The audition's test link is removed; the exact selected profile remains saved.
The school runtime stays 0.9.2 and has never activated Moss.

The user subsequently identified the 401 as a dropped VPN/proxy connection.
Access recovered. Do not pursue a custom domain or another school login as
the current blocker. Crashes remain the actual problem.

For the chosen Moss sound, client-side live processing is not a viable delivery
in the current implementation. Discuss a short-segment server-side path and its
startup delay/cost; do not silently buy GPU service or
replace Moss with RNNoise. The original requirement remains unfinished.

The user selected `preferred-audition.json` and explicitly requested that it be
used in the **school replay player**, not merely saved on the audition page.
Keep the entire profile unchanged, including gain 0 dB. The user will adjust
listening volume. Do not run another loudness preference trial.

## Follow-up research: user confirms iPadOS 26.3 (2026-10-18)

Known ONNX Runtime/WebKit reports describe runaway compiler allocations after
JSEP or native WebGPU/Asyncify execution, including after worker disposal. This
is a plausible explanation, not a diagnosis of this device without crash logs:
https://github.com/microsoft/onnxruntime/issues/26827 and
https://bugs.webkit.org/show_bug.cgi?id=304810 . The former was closed by a
stale bot, not by a confirmed fix. Some upstream workloads have been fixed;
others still reproduce, so do not promise that an arbitrary 26.x update fixes it.

Safari 27 introduces JSPI, which provides a different runtime path. M1 iPad
models are listed as supported by iPadOS 27. The installed ORT 1.30.0
`ort.webgpu` bundle is explicitly an Asyncify build; it does NOT automatically
turn into JSPI after an OS update. A future candidate must select the matching
`ort.jspi` bundle, loader and WASM, require both `WebAssembly.Suspending` and
`WebAssembly.promising`, and refuse an Asyncify fallback on WebKit. An OS update
alone is not a fix or an iPad Moss stability result.

Primary sources:
- https://webkit.org/blog/18325/webkit-features-for-safari-27-0/
- https://support.apple.com/guide/ipad/ipad213a25b2/ipados
- https://onnxruntime.ai/docs/api/js/interfaces/InferenceSession.WebGpuExecutionProviderOption.html

Private desktop follow-up, same real classroom STFT block, FP32 reference and
14,165,259-byte lowered graph, ORT 1.30.0, Windows Chrome/i5-1135G7/Iris Xe:

| Candidate | Observed result | Decision |
| --- | --- | --- |
| Plain WASM, one thread, arena/pattern off | 55.565 s for about 2.5 s audio; 2,827.188 MiB WASM linear memory after run; relative RMS error 5.91e-6 | Not a live delivery; second run stopped |
| Plain WASM, arena/pattern on | 55.592 s; same WASM memory and error; completed idle observation | Not an improvement |
| Explicit JSPI WebGPU, FP32 | 12.833 / 8.394 s; relative RMS error 3.10e-6; two runs plus 15 s idle completed | Numerically valid desktop candidate, too slow here; no physical iPad result |
| Explicit JSPI with API buffer instrumentation | 13.023 / 7.753 s; same error | Confirms output; instrumentation is NOT a physical GPU memory measurement |
| FP16 only in Conv/ConvTranspose/Gemm, other math FP32 | 9,646,931 bytes; finite but relative RMS error about 0.005; cold run 12.972 s | Misses the strict FP32 equivalence gate; not shipped or listening-validated |
| JSPI, all GPU buffer caches disabled | First run fails: buffer submitted after destruction | Reject this configuration |

WASM linear memory excludes graphics allocations, browser/compiler memory and
other processes. API-created buffer byte counters exclude implicit GC releases
and driver allocations; do not describe them as measured resident GPU memory.
No Windows measurement is a claim of M1 iPad speed, thermal behavior or stability.
The graph's FP32 weights occupy about 11.93 MiB, but a known intermediate alone
is about 79.10 MiB. Shrinking the model download cannot establish a low peak.

Neither the abandoned all-FP16 model nor this partial-FP16 candidate is public.
The public device test remains disabled. No production assets were rebuilt,
no paid GPU resources were created, and the chosen profile is unchanged.

Next local gate: explicit JSPI plus a lower-memory graph/runtime, followed by
short guarded tests and sustained playback on the actual device. A prototype
must preserve output and achieve throughput headroom at the selected speed.
Padding WASM functions and recompiling Asyncify are upstream diagnostic leads,
not established fixes for this model. Do not send another unverified heavy
Asyncify test to the user's iPadOS 26.3 device.

Cloud alternative: bounded short PCM/AAC segments, session reuse, overlap and
crossfades, generation tokens for seeks/track switches, bounded lookahead, original
audio while preparing, pitch-preserving playback and a fixed video clock.
It must not require downloading the whole lesson first. No cloud Moss GPU
endpoint exists yet, and latency/per-lesson cost must be measured before quoting.

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
- Historical, now withdrawn: a short device check ran the validated model in a dedicated
  worker, with explicit start/stop, hidden-page cancellation, a 120-second cap,
  SHA-256 checked versioned assets, and three finite-output checked runs.
  It uses synthetic input of the same dimensions, not school media.
- Local worker check on this Windows GPU: 11.88 / 7.28 / 7.51 s. The page stays
  responsive, the graph produces valid output, and results can be copied.

## Outstanding requirement

**Moss audio is not yet connected to school replay. Do not claim it is working
or replace it with RNNoise under the same name.** The current school runtime
remains 0.9.2 with its independent real-time RNNoise controls.

Historical plan, now superseded by the crash report above: obtain an M1 iPad
device-check result. Suggested throughput headroom was
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
