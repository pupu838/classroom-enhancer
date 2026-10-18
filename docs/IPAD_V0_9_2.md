# 0.9.2 — audition and user audio controls

The user reports severe classroom reverb and electronic coloration in the original. Enabling the previous denoiser does not noticeably change this. GTCRN's previous sample was also rejected. Subjective quality remains unresolved; no model is declared a winner.

## Delivery

- Twelve 25-second, same-segment clips (2026-10-14 lesson, 3:02–3:27): original, EQ, RNNoise blends, GTCRN blends, DeepFilterNet blends, MossFormerGAN blends, and online WPE.
- Fixed gain matched to approximately -20 LUFS per exported clip. Measured encoded clips: -20.00 to -20.01 LUFS, all 25 seconds, true peak below -1.5 dBTP. The interactive player's model bases are matched; blending can slightly change loudness.
- Audition page uses precomputed clips, shared progress, original comparison, sliders, favorite marking, persistence and settings export/import. It runs no local ASR or large neural model. Decoded cache is limited to original plus one candidate.
- Public portal page contains AES-GCM ciphertext. The access key is held only in the user's URL fragment and local delivery files; it is not committed. The standalone local HTML embeds its samples directly. Do not put the keyed URL in public documentation.
- Classroom Assistant adds independent live RNNoise mix, gain, high/low cuts, four EQ bands, compressor threshold, presets, original comparison and settings export/import. Audio download remains separate. The audition's strong-model settings are not importable as a real-time model.

## Signal correction

Classic RNNoise returns the previous 480-sample frame. Previously the blend combined this with the current dry frame. Dry mixing now uses the previous frame, matching the model's 10 ms algorithmic delay, plus the worklet's existing 10 ms frame queue. Seek/track changes reset neural history. Bypass remains direct and skips inference.

## Validation and limits

- Actual RNNoise WASM: finite output, continuous noise test, zero-mix waveform matches input delayed by 960 samples, reset clears prior audio.
- Native three-audio mock: track switch, offset timing, buffering, volume, settings bounds and bypass; no download.
- Unified DOM: presets, individual slider change, settings round trip, invalid-import rejection, download remains separate.
- Chrome with actual Web Audio/AAC: each model produces a finite, nonzero output; switching retains progress; seeking, original/return, pause, persistence and 768px layout pass. This is not physical iPad Safari validation or an intelligibility assessment.
- Existing cloud/current-lesson, loader, multi-view sync, layout, subtitle and DOM checks pass.
- Exact installed 0.7.0 loader accepts 0.9.2's runtime (621,511 characters), avoiding reinstall for normal runtime updates.
- MossFormerGAN prototype: approximately 193 seconds inference plus 52 seconds initialization for 30 seconds audio on this Windows CPU. This is an offline quality candidate, not verified for real-time browser deployment.
- WPE waveform changes were small in the prior experiment; no dereverberation quality claim.

## Reproduction and workspace

Active checkout: `E:/桌面/云课堂/classroom-enhancer`, branch `cloud-pipeline-v0.5`. The old clean desktop checkout was advanced to the existing current branch before editing. Prior private research audio remains under the previous Codex workspace; it is not committed.

`node scripts/build-audio-audition.mjs RESEARCH_DIR OUTPUT_DIR` requires ffmpeg, the existing float32 model outputs, and produces a new private link each time. Do not regenerate after sharing a link without retaining the prior key/page pair.

Deployment: `dpb662akx3q3` (verify completion and production manifest before reporting success).
