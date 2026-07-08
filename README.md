# MetMind

AI-powered second brain for your busy schedule & meetings. Records, transcribes, and analyzes meetings in real-time using Whisper + Groq LLM.

## Features

- **Live Transcription** — Real-time speech-to-text via faster-whisper
- **Dual Audio Capture** — Record microphone + any app/window audio simultaneously
- **WASAPI Loopback** — Capture browser/app audio even when speaker is muted (taps into audio stream before volume control)
- **Smart App Detection** — Shows which apps are currently producing audio (Brave, Zoom, Spotify, etc.)
- **AI Analysis** — Automatic summarization, action items, decisions, and risks via Groq LLM
- **Meeting History** — Browse past meetings with full transcripts and analysis
- **Voice Activity Detection** — Smart filtering to skip silence
- **Markdown Export** — Each meeting saves as a structured .md file
- **Full-Text Search** — Search across meeting titles and transcript segments
- **Audio Upload** — Upload and transcribe pre-recorded audio files (MP3, WAV, M4A, OGG, FLAC, WebM, MP4, AAC, WMA)
- **Multi-Language** — 13 transcription languages + 12 summary languages
- **Dark/Light Theme** — Blue-cyan-teal brand palette with theme toggle
- **Minimizable Recording** — Minimize recording modal to a compact bar while recording continues
- **Audio Source Selector** — Choose mic-only, system-audio-only, or both before recording

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Zustand |
| Backend | FastAPI, SQLAlchemy, SQLite |
| Transcription | faster-whisper (local, CPU) |
| LLM | Groq API (Llama 3.3 70B) |
| Audio | sounddevice, pyaudiowpatch (WASAPI), pycaw |

## Setup

### 1. Backend

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

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/config` | Non-sensitive config |
| GET | `/meetings/list` | List past meetings |
| GET | `/meetings/{id}` | Get meeting + transcript + analysis |
| POST | `/meetings/start` | Start recording |
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
meeting-mind/
├── backend/
│   ├── api/           # FastAPI routes + WebSocket
│   ├── audio/         # Mic/loopback capture, VAD, WASAPI, app detection
│   │   ├── capture.py        # sounddevice mic/loopback
│   │   ├── wasapi_capture.py # WASAPI loopback (system audio)
│   │   ├── apps.py           # Audio app enumeration (pycaw)
│   │   ├── stream.py         # Thread-safe audio queue
│   │   └── vad.py            # Voice activity detection
│   ├── llm/           # Groq engine, analyzer, prompts
│   ├── whisper/       # faster-whisper transcriber
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
