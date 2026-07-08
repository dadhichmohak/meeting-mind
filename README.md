# MetMind

AI-powered second brain for your busy schedule & meetings. Records, transcribes, and analyzes meetings in real-time using Whisper + Groq LLM.

## Recent Updates

- **Production-ready API URLs** — Frontend uses relative URLs with Vite proxy in dev; set `VITE_API_URL` for production builds
- **WebSocket reconnection backoff** — Exponential backoff (1s → 30s cap) prevents network flooding when backend is down
- **Thread-safe WebSocket broadcast** — Fixed race condition where concurrent connections could crash the broadcast loop
- **Session state race conditions fixed** — `session.active` and resource references now read/write under lock; no more crashes from concurrent start/stop/reset
- **Duplicate transcript segments eliminated** — Overlap region is now skipped during transcription, preventing repeated text
- **Mic device selection works** — Selected microphone is now correctly passed to the backend
- **Migration auto-stamp** — Existing databases without Alembic tracking are automatically stamped to head on startup
- **Path traversal prevention** — Upload filenames are sanitized to prevent writing outside the meetings directory
- **Health check caching** — Groq API health check cached for 5 minutes, reducing API calls
- **LLM calls outside DB sessions** — Network I/O no longer holds database connections open
- **Timestamps handle >1hr** — `format_timestamp` now shows `h:mm:ss` for meetings over an hour

## Features

- **Live Transcription** — Real-time speech-to-text via faster-whisper (~0.5s latency)
- **Audio Preprocessing** — High-pass filter, peak normalization, and noise gate for clean transcription input
- **Dual Audio Capture** — Record microphone + any app/window audio simultaneously
- **WASAPI Loopback** — Capture browser/app audio even when speaker is muted (taps into audio stream before volume control)
- **Smart App Detection** — Shows which apps are currently producing audio (Brave, Zoom, Spotify, etc.)
- **AI Analysis** — Automatic summarization, action items, decisions, and risks via Groq LLM
- **Meeting History** — Browse past meetings with full transcripts and analysis
- **Markdown Export** — Each meeting saves as a structured .md file
- **Full-Text Search** — Search across meeting titles and transcript segments
- **Audio Upload** — Upload and transcribe pre-recorded audio files (MP3, WAV, M4A, OGG, FLAC, WebM, MP4, AAC, WMA)
- **Multi-Language** — 13 transcription languages + 12 summary languages
- **Dark/Light Theme** — Blue-cyan-teal brand palette with theme toggle
- **Minimizable Recording** — Minimize recording modal to a compact bar while recording continues
- **Audio Source Selector** — Choose mic-only, system-audio-only, or both before recording
- **Custom Meeting Titles** — Name your meeting before recording starts (defaults to timestamp if empty)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | Python 3.10+ |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Zustand |
| Backend | FastAPI, SQLAlchemy, SQLite |
| Transcription | faster-whisper (local, CPU) |
| LLM | Groq API (Llama 3.3 70B) |
| Audio | sounddevice, pyaudiowpatch (WASAPI), pycaw |

## Setup

### 1. Backend

Requires **Python 3.10+**.

```bash
cd backend
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt
```

Create `.env` in project root:

```
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxx
GROQ_MODEL=llama-3.3-70b-versatile
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8765
FRONTEND_URL=http://localhost:5173
```

Run backend:

```bash
python -m backend.main
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

For production builds, set the backend URL:

```bash
VITE_API_URL=https://your-backend-url npm run build
```

### 3. App Audio Capture (Windows)

The app uses **WASAPI loopback** to capture system audio. This works even when your speaker volume is down — it taps into the audio stream before the volume control.

**How it works:**
1. Select audio source using the Mic/Speaker/Both toggle next to the Record button
2. Play audio in any app (YouTube in Brave, Spotify, Zoom, etc.)
3. The app auto-detects which apps are producing audio
4. Both your mic and the app audio are transcribed together

**No extra setup needed** — WASAPI loopback is built into Windows. The `pyaudiowpatch` library handles it automatically.

**If WASAPI doesn't work**, you can fall back to Stereo Mix:
1. Open **Sound Settings** → **Recording** tab
2. Enable **Stereo Mix** (or install [VB-Cable](https://vb-audio.com/Cable/))
3. Select "Mic only" mode and configure the loopback device manually

## How Transcription Works

The transcription pipeline is optimized for low latency and clean audio:

1. **Audio Capture** — Chunks arrive every 500ms from mic/system audio
2. **Preprocessing** — Each batch is cleaned before Whisper:
   - High-pass filter (80Hz, 2nd-order Butterworth) removes rumble/hum
   - Peak normalization (0.9) ensures consistent volume levels
   - Noise gate (2× RMS threshold) suppresses background hiss
3. **Overlapping Context** — 2.0s buffer with 1.5s overlap between batches. Only 0.5s of new audio is processed per batch, giving ~0.5s effective latency while maintaining cross-chunk context for accuracy
4. **Whisper Transcription** — faster-whisper (base model, CPU, int8) with VAD filter (min_silence=800ms)
5. **WebSocket Push** — Segments stream to the frontend in real-time

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/config` | Non-sensitive config |
| GET | `/meetings/list` | List past meetings |
| GET | `/meetings/{id}` | Get meeting + transcript + analysis |
| POST | `/meetings/start` | Start recording (accepts optional `title`) |
| POST | `/meetings/stop` | Stop & save |
| POST | `/meetings/reset` | Force-reset stuck session |
| GET | `/meetings/status` | Current session status |
| GET | `/meetings/devices` | List devices + audio apps |
| GET | `/meetings/search` | Full-text search meetings + transcripts |
| PATCH | `/meetings/{id}` | Edit meeting title/notes |
| DELETE | `/meetings/{id}` | Delete meeting |
| POST | `/upload` | Upload audio file |
| WS | `/ws` | Live transcript stream |

## Project Structure

```
metmind/
├── backend/
│   ├── api/           # FastAPI routes + WebSocket
│   ├── audio/         # Mic/loopback capture, WASAPI, app detection
│   │   ├── capture.py        # sounddevice mic/loopback
│   │   ├── wasapi_capture.py # WASAPI loopback (system audio)
│   │   ├── apps.py           # Audio app enumeration (pycaw)
│   │   ├── stream.py         # Thread-safe audio queue
│   │   └── vad.py            # Voice activity detection (Silero)
│   ├── llm/           # Groq engine, analyzer, prompts
│   ├── whisper/       # faster-whisper transcriber + audio preprocessor
│   ├── utils/         # Logger setup
│   ├── config.py      # Env config loader
│   ├── database.py    # SQLAlchemy + SQLite
│   └── models.py      # Meeting, TranscriptSegment, Note
├── frontend/
│   └── src/
│       ├── components/  # React UI components
│       ├── hooks/       # useMeeting, useWebSocket, useTheme
│       ├── store/       # Zustand state
│       └── types/       # TypeScript types
├── meetings/          # Exported .md transcripts
├── logs/              # App logs
└── meetings.db        # SQLite database
```

## UI Overview

### Floating Bar (Bottom Center)
- **Meeting Title Input** — Optional title field (defaults to timestamp)
- **Record Button** — Starts recording with animated waveform indicator
- **Audio Source Toggle** — Mic / System / Both (three icon buttons)
- **Search Bar** — "Ask anything" input with "What did I miss" quick-action
- **Filter Pills** — "Today" and "Me" filters for quick meeting search

### Recording Modal
- **Minimizable** — Click chevron to minimize to a compact floating bar
- **Live Transcript** — Chat-bubble style transcript segments
- **Duration Timer** — Real-time elapsed time display
- **Stop Button** — Green accent button to end recording

### Note View
- **Serif Title** — Cormorant Garamond heading
- **Filter Tags** — Today/Me pills with active state
- **Textarea** — Large serif textarea for notes
- **Upload Results** — Displays transcription + analysis after upload
- **AI Summary** — Shows decisions, action items, questions, risks

### History View
- **Meeting List** — Grouped by date with search
- **Detail View** — Full transcript, analysis, editable title/notes
- **Delete** — Remove meetings from history

## Color Theme

Blue-cyan-teal brand palette for trust, intelligence, and productivity:

| Element | Dark | Light |
|---------|------|-------|
| Background | `#0B1220` | `#F8FAFC` |
| Surface | `#111827` | `#FFFFFF` |
| Border | `#334155` | `#CBD5E1` |
| Primary Text | `#F8FAFC` | `#0F172A` |
| Accent | `#3B82F6` | `#2563EB` |
| Secondary | `#22D3EE` | `#06B6D4` |
| Tertiary | `#2DD4BF` | `#14B8A6` |
| Recording | `#EF4444` | `#EF4444` |
| Success | `#4ADE80` | `#22C55E` |

## What Else Can Be Done

### High Priority
- [ ] **Speaker diarization** — Identify who said what (pyannote or whisperx)
- [ ] **Export formats** — PDF, DOCX, Notion integration

### Medium Priority
- [ ] **Calendar integration** — Google/Outlook calendar to auto-title meetings
- [ ] **Meeting bookmarks** — Mark important moments during recording
- [ ] **Playback audio** — Record and playback meeting audio
- [ ] **Per-app audio isolation** — Capture audio from a specific app only

### Low Priority
- [ ] **Cloud sync** — Sync meetings across devices
- [ ] **Team workspaces** — Shared meeting notes for teams
- [ ] **Custom prompts** — User-defined analysis templates
- [ ] **Meeting templates** — Standup, 1on1, brainstorm presets
