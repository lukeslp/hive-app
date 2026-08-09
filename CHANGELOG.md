# Changelog

## 2026-08-08

### Added

- Added Rind as a native-macOS-only spatial workspace mode with an orbitable
  geodesic sphere, readable idea labels, selection, inspection, and keyboard or
  screen-reader access to the same ideas.
- Added deterministic sphere placement that preserves imported BrainSphere/Rind
  positions and keeps newly projected branches adjacent where possible.

### Changed

- Persist workspace mode, Rind camera, subdivisions, and placements through the
  existing canonical board envelope without duplicating generation, history,
  artifacts, provider settings, or credentials.
- Excluded the Three.js renderer from web, iOS, and Android production bundles.

## 2026-07-14

### Added

- Added ML Kit Prompt API `1.0.0-beta2` and a cancellable Android AICore
  Capacitor bridge for Gemini Nano status, explicit download, and generation.
- Ordered Android generation as AICore Gemini Nano, verified LiteRT-LM Gemma,
  then the unchanged managed cloud fallback.
- Added Android Settings status that explains local availability, download
  choices, and when the cloud fallback sends prompts off-device.

### Changed

- Replaced the deprecated MediaPipe Tasks GenAI `LlmInference` fallback with
  LiteRT-LM Android. The unchanged Capacitor contract now loads a
  checksum-verified `.litertlm` Gemma artifact through a private CPU-backed
  LiteRT-LM engine.
- Raised Android's minimum API level from 24 to 26 because the existing
  AICore-first ML Kit Prompt API requires API 26; no unsafe manifest override
  is used.
- Updated the Kotlin Gradle plugin to 2.3.0, matching the Kotlin metadata
  emitted by the resolved LiteRT-LM Android release.

## 2026-07-13

### Added

- Finalized the Android identity as `app.ideatiles.android` on API 36/JDK 21.
- Registered the native Gemma bridge and its original MediaPipe Tasks GenAI dependency.
- Added opt-in HTTPS model delivery with SHA-256 verification, private no-backup
  storage, atomic activation, and truthful cloud-fallback status.
- Added environment-only release signing and versioned APK/AAB checksum staging.
- Added native model-verification and web prompt-construction tests.

### Security and privacy

- Disabled Android application backup and cleartext traffic.
- Kept model credentials, signing material, and Gemma weights out of source.
- Android no longer implies local processing when the verified model is absent;
  Settings discloses that cloud fallback sends prompts off-device.

## 2026-07-10

### Security

- Removed client control over server-side Ollama hosts, models, and
  credentials.
- Disabled redirect following for the operator-configured Ollama upstream.
- Made production bind loopback and fail when its configured port is busy.

### Fixed

- Unknown `/api/*` requests now return structured JSON 404 responses instead
  of the SPA document.

### Documentation

- Added current production deployment and safety guidance.
