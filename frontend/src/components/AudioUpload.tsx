import { useState, useRef } from "react";
import { useMeetingStore } from "../store/meetingStore";

const API = "http://127.0.0.1:8765";

interface UploadResult {
  meeting_id: string;
  filename: string;
  duration_seconds: number;
  segment_count: number;
  transcript: { text: string; start: number; end: number; speaker: string | null }[];
  analysis: {
    summary?: string;
    decisions?: string[];
    action_items?: string[];
    questions?: string[];
    risks?: string[];
    follow_ups?: string[];
    error?: string;
    info?: string;
  } | null;
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function AudioUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { status } = useMeetingStore();

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    setProgress("Uploading file...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("model_size", "base");
      formData.append("language", "en");

      setProgress("Transcribing audio...");
      const r = await fetch(`${API}/upload`, { method: "POST", body: formData });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.detail || "Upload failed");
      }

      setProgress("Analyzing with AI...");
      const data: UploadResult = await r.json();
      setResult(data);
      setProgress("");
    } catch (e: any) {
      setError(e.message || "Upload failed");
      setProgress("");
    }
    setUploading(false);
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setProgress("");
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Results View ─────────────────────────────────────────────
  if (result) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <button onClick={reset} className="flex items-center gap-2 text-sm text-muted hover:text-txt-primary transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Upload another
            </button>
            <div className="flex items-center gap-3 text-xs text-muted font-mono">
              <span>{result.filename}</span>
              <span className="text-border">&#8226;</span>
              <span>{fmtDuration(result.duration_seconds)}</span>
              <span className="text-border">&#8226;</span>
              <span>{result.segment_count} segments</span>
            </div>
          </div>

          {/* Analysis */}
          {result.analysis && !result.analysis.summary && !result.analysis.decisions && !result.analysis.error && (
            <div className="text-sm text-muted bg-panel rounded-xl border border-border p-5 mb-6">
              No analysis available for this audio.
            </div>
          )}

          {result.analysis?.error && (
            <div className="text-sm text-warning bg-warning/5 rounded-xl border border-warning/20 p-4 mb-6">
              {result.analysis.error}
            </div>
          )}

          {result.analysis?.summary && (
            <div className="bg-panel border border-border rounded-xl overflow-hidden mb-6">
              <div className="px-5 py-3 border-b border-border bg-panel-2/50">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                  </svg>
                  <h3 className="text-xs font-semibold text-accent uppercase tracking-wider">AI Analysis</h3>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <h4 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Summary</h4>
                  <p className="text-sm text-txt-secondary leading-relaxed">{result.analysis.summary}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {result.analysis.decisions && result.analysis.decisions.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Decisions</h4>
                      <ul className="space-y-1">
                        {result.analysis.decisions.map((d, i) => (
                          <li key={i} className="flex gap-2 text-sm text-txt-secondary">
                            <span className="text-success shrink-0 mt-0.5">&#10003;</span><span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.analysis.action_items && result.analysis.action_items.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Action Items</h4>
                      <ul className="space-y-1">
                        {result.analysis.action_items.map((a, i) => (
                          <li key={i} className="flex gap-2 text-sm text-txt-secondary">
                            <span className="text-primary shrink-0 mt-0.5">&#8594;</span><span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.analysis.questions && result.analysis.questions.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Questions</h4>
                      <ul className="space-y-1">
                        {result.analysis.questions.map((q, i) => (
                          <li key={i} className="flex gap-2 text-sm text-txt-secondary">
                            <span className="text-warning shrink-0 mt-0.5">?</span><span>{q}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.analysis.risks && result.analysis.risks.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Risks</h4>
                      <ul className="space-y-1">
                        {result.analysis.risks.map((r, i) => (
                          <li key={i} className="flex gap-2 text-sm text-txt-secondary">
                            <span className="text-error shrink-0 mt-0.5">&#9888;</span><span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Transcript */}
          {result.transcript.length > 0 && (
            <div className="bg-panel border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-panel-2/50">
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Transcript</h3>
              </div>
              <div className="p-5 space-y-1">
                {result.transcript.map((seg, i) => (
                  <div key={i} className="flex gap-3 py-2 px-3 rounded-lg hover:bg-panel-2/50 transition-colors">
                    <span className="font-mono text-xs text-muted pt-0.5 w-12 shrink-0 tabular-nums select-none">
                      {fmtTime(seg.start)}
                    </span>
                    <div className="flex-1 min-w-0">
                      {seg.speaker && (
                        <span className="text-primary text-xs font-semibold font-mono mr-2">{seg.speaker}</span>
                      )}
                      <span className="text-sm text-txt-secondary">{seg.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Upload Zone ──────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-txt-primary mb-1">Upload Audio</h2>
          <p className="text-xs text-muted">Transcribe and analyze audio files with AI</p>
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const droppedFile = e.dataTransfer.files[0];
            if (droppedFile) setFile(droppedFile);
          }}
          className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
            file
              ? "border-primary bg-primary/5 shadow-glow-blue"
              : "border-border hover:border-primary/40 hover:bg-panel/50"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".mp3,.wav,.m4a,.ogg,.flac,.webm,.mp4,.aac,.wma"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="hidden"
          />
          {file ? (
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3v11.25" />
                </svg>
              </div>
              <p className="text-sm font-medium text-txt-primary">{file.name}</p>
              <p className="text-xs text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-panel-2 border border-border flex items-center justify-center mx-auto">
                <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-txt-secondary">Click or drag an audio file here</p>
                <p className="text-xs text-muted mt-1">MP3, WAV, M4A, OGG, FLAC, WebM, MP4</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="text-xs text-error bg-error/5 rounded-xl border border-error/20 p-4">{error}</div>
        )}

        {progress && (
          <div className="flex items-center gap-3 text-xs text-primary bg-primary/5 rounded-xl border border-primary/20 p-4 font-mono">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            {progress}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl
                     bg-brand-gradient text-white text-sm font-semibold
                     shadow-glow-blue hover:shadow-lg hover:scale-[1.01]
                     active:scale-[0.99] transition-all
                     disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {uploading ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
              Transcribe & Analyze
            </>
          )}
        </button>
      </div>
    </div>
  );
}
