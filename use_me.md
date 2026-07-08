# How to Test MetMind

## 1. Activate the environment

```bash
conda activate venv
```

> The project's dependencies (fastapi, faster-whisper, sqlalchemy, loguru, groq, etc.)
> live in this env. `pytest` and `alembic` are already installed in it.

## 2. Run the automated test suite

From the project root (`metmind/`):

```bash
python -m pytest
```

Expected output:

```
..............                                                           [100%]
14 passed in X.XXs
```

## 3. Run a subset of tests (optional)

```bash
# Only the meeting-analyzer normalization tests
python -m pytest tests/test_analyzer.py

# Only the WASAPI resampling/mono helpers (no audio hardware needed)
python -m pytest tests/test_wasapi.py

# Only transcript formatting
python -m pytest tests/test_transcript.py

# Only config / db engine
python -m pytest tests/test_config.py

# Verbose, with names
python -m pytest -v
```

## 4. What the tests cover

| File | Covers |
|------|--------|
| `tests/test_analyzer.py` | `MeetingAnalyzer._normalize` — full JSON, missing keys, string-lists, non-list values |
| `tests/test_wasapi.py` | `WASAPICapture._to_mono` (stereo averaging, partial frames) and `_resample` (48k→16k, 44.1k→16k, same-rate passthrough) |
| `tests/test_transcript.py` | `build_raw_transcript` / `format_timestamp` — speaker prefixes, empty-line skipping |
| `tests/test_config.py` | `Config` defaults present; engine is a SQLite URL |

All tests are offline — **no microphone, no Groq API key, and no audio device required**.

## 5. Manual / integration testing

### Backend
```bash
conda activate venv
python -m backend.main
```
- `GET http://127.0.0.1:8765/health` → `{"status":"ok",...}`
- `GET http://127.0.0.1:8765/config` → shows `groq_available` and model

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173

### Live recording
1. Enter a meeting title in the floating bar (optional, defaults to timestamp).
2. Pick audio source (Mic / System / Both).
3. Click **Record** → transcript streams in via WebSocket.
4. Live transcript appears at the bottom of the Record view.
5. Click **Stop** → Groq analysis (summary/decisions/action items/risks/questions/follow-ups) appears.
6. Ask anything about the meeting using the chat at the bottom.

### Upload
1. Click **Upload Audio** in the sidebar, select an audio file (mp3/wav/m4a/ogg/flac/webm/mp4/aac/wma).
2. Wait for transcription + analysis; result appears in the Record view.

### Verify the bug fixes
- **WASAPI resampling**: play 44.1 kHz system audio; transcript should no longer be sped-up/aliased (tested by `test_wasapi.py`).
- **Structured LLM output**: with a valid `GROQ_API_KEY`, analysis sections parse reliably even if the model changes wording (tested by `test_analyzer.py`).
- **SQLite robustness**: rapid start/stop no longer throws "database is locked" (WAL + 30s timeout).
- **Low-latency transcription**: ~0.5s effective latency with 2.0s buffer + 1.5s overlap.
- **Audio preprocessing**: high-pass filter, normalization, noise gate applied before Whisper.

## 6. Logo & Favicon

All static assets go in `frontend/public/`. Vite serves them at the root URL.

### Favicon files

Place these in `frontend/public/`:

| File | Size | Format | Usage |
|------|------|--------|-------|
| `favicon.svg` | Any (vector) | SVG | Modern browsers, Android Chrome |
| `favicon-16x16.png` | 16×16 px | PNG | Browser tab, bookmarks bar |
| `favicon-32x32.png` | 32×32 px | PNG | Browser tab (standard) |
| `apple-touch-icon.png` | 180×180 px | PNG | iOS home screen shortcut |

Already referenced in `frontend/index.html`:
```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
```

A default `favicon.svg` is already provided (chat bubble with dots, charcoal + muted blue).

### Logo files

For in-app logos (sidebar, loading screen, etc.):

| File | Recommended Size | Format | Usage |
|------|-----------------|--------|-------|
| `logo.svg` | 120×40 px (wide) or 40×40 px (square) | SVG | Sidebar header, navigation |
| `logo-dark.png` | 240×80 px @2x | PNG | Dark theme branding |
| `logo-light.png` | 240×80 px @2x | PNG | Light theme branding |
| `logo-icon.png` | 64×64 px @2x | PNG | Splash screen, about dialog |

### How to generate favicon from logo

1. Start with a square logo (at least 512×512 px, transparent background)
2. Generate favicons:
   - **Online**: https://favicon.io/ or https://realfavicongenerator.net/
   - **CLI**: `npx favicons frontend/public/logo-icon.png --output=frontend/public`
3. Place generated files in `frontend/public/`

### Color reference

The app uses a charcoal + muted blue palette. Logo should work on dark backgrounds:

| Element | Hex |
|---------|-----|
| Background | `#0D0F12` |
| Surface | `#151920` |
| Accent (blue) | `#5B7FCC` |
| Text primary | `#E8ECF1` |
| Text muted | `#6B7280` |

## 7. Troubleshooting

- `ModuleNotFoundError: No module named 'pytest'` → run `conda activate venv` first, or `pip install pytest alembic` inside the env.
- Tests import `backend.*` — always run `pytest` from the **project root**, not from inside `backend/`.
- The repo `.env` is gitignored; tests do not require it.
- API key entered in Settings is stored in browser localStorage and sent with every request. The `.env` GROQ_API_KEY is used as fallback.
- If history shows stale meetings, click the refresh button (circular arrow) next to "History" title.
