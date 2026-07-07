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
      const r = await fetch(`${API}/upload`, {
        method: "POST",
        body: formData,
      });

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

  if (result) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="flex items-center gap-4 mb-4">
          <button onClick={reset} className="text-xs text-accent hover:text-blue-400 font-mono">
            ← Upload another
          </button>
          <span className="text-xs text-muted font-mono">
            {result.filename} · {fmtDuration(result.duration_seconds)} · {result.segment_count} segments
          </span>
        </div>

        <div className="space-y-4">
          {/* Analysis */}
          {result.analysis && !result.analysis.summary && !result.analysis.decisions && !result.analysis.error && (
            <div className="text-sm text-muted bg-panel rounded border border-border p-4">
              No analysis available.
            </div>
          )}

          {result.analysis?.error && (
            <div className="text-sm text-yellow-400 bg-panel rounded border border-border p-4">
              {result.analysis.error}
            </div>
          )}

          {result.analysis?.summary && (
            <div className="bg-panel rounded border border-border p-4 space-y-3">
              <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">Summary</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{result.analysis.summary}</p>

              {result.analysis.decisions && result.analysis.decisions.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Decisions</h4>
                  <ul className="text-sm text-slate-300 space-y-1">
                    {result.analysis.decisions.map((d, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-live shrink-0">•</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.analysis.action_items && result.analysis.action_items.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Action Items</h4>
                  <ul className="text-sm text-slate-300 space-y-1">
                    {result.analysis.action_items.map((a, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-live shrink-0">→</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.analysis.questions && result.analysis.questions.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-yellow-400 uppercase tracking-wide mb-2">Open Questions</h4>
                  <ul className="text-sm text-slate-300 space-y-1">
                    {result.analysis.questions.map((q, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-yellow-400 shrink-0">?</span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.analysis.risks && result.analysis.risks.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">Risks</h4>
                  <ul className="text-sm text-slate-300 space-y-1">
                    {result.analysis.risks.map((r, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-red-400 shrink-0">⚠</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Transcript */}
          {result.transcript.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Transcript</h3>
              {result.transcript.map((seg, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <span className="font-mono text-xs text-muted pt-0.5 w-12 shrink-0 tabular-nums">
                    {fmtTime(seg.start)}
                  </span>
                  <div className="flex-1">
                    {seg.speaker && (
                      <span className="text-accent text-xs font-semibold font-mono mr-2">
                        {seg.speaker}
                      </span>
                    )}
                    <span className="text-slate-200">{seg.text}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-2">
            Upload Audio
          </h2>
          <p className="text-xs text-muted">
            Upload an audio file to transcribe and analyze with AI
          </p>
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
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            file
              ? "border-accent bg-accent/5"
              : "border-border hover:border-accent/50 hover:bg-panel/50"
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
            <div className="space-y-1">
              <p className="text-sm text-white font-medium">{file.name}</p>
              <p className="text-xs text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-2xl">📁</div>
              <p className="text-sm text-muted">Click or drag audio file here</p>
              <p className="text-xs text-muted/50">MP3, WAV, M4A, OGG, FLAC, WebM, MP4</p>
            </div>
          )}
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-900/20 rounded p-3">{error}</div>
        )}

        {progress && (
          <div className="text-xs text-accent bg-accent/10 rounded p-3 font-mono">{progress}</div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-accent hover:bg-blue-500
                     text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <span>⬆</span>
              Transcribe & Analyze
            </>
          )}
        </button>
      </div>
    </div>
  );
}
