# Changelog

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
