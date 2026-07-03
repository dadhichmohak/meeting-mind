import { useEffect, useRef, useState } from "react";
import { useMeetingStore } from "../store/meetingStore";

function fmtTime(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export function LiveTranscript() {
  const { segments, status } = useMeetingStore();
  const [analysis, setAnalysis] = useState<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments.length]);

  // Listen for analysis from API
  useEffect(() => {
    const handleAnalysis = (evt: any) => {
      if (evt.detail?.analysis) {
        setAnalysis(evt.detail.analysis);
      }
    };
    window.addEventListener("meeting-stopped", handleAnalysis);
    return () => window.removeEventListener("meeting-stopped", handleAnalysis);
  }, []);

  if (segments.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted">
        {status === "recording" ? (
          <>
            <div className="w-10 h-10 rounded-full border-2 border-live border-t-transparent animate-spin mb-4" />
            <p className="text-sm font-mono">Listening for speech...</p>
            <p className="text-xs mt-1 opacity-50">Transcript will appear here</p>
          </>
        ) : (
          <>
            <p className="text-sm font-mono">No transcript yet</p>
            <p className="text-xs mt-1 opacity-50">Press Start Recording to begin</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
      {/* Analysis Summary */}
      {analysis && !analysis.error && (
        <div className="space-y-3 bg-panel rounded border border-border p-4 mb-4">
          {analysis.summary && (
            <div>
              <h3 className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">
                Summary
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">{analysis.summary}</p>
            </div>
          )}

          {analysis.decisions && analysis.decisions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">
                Decisions
              </h3>
              <ul className="text-sm text-slate-300 space-y-1">
                {analysis.decisions.map((d: string, i: number) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-live shrink-0">•</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.action_items && analysis.action_items.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">
                Action Items
              </h3>
              <ul className="text-sm text-slate-300 space-y-1">
                {analysis.action_items.map((a: string, i: number) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-live shrink-0">→</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.questions && analysis.questions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-yellow-400 uppercase tracking-wide mb-2">
                Open Questions
              </h3>
              <ul className="text-sm text-slate-300 space-y-1">
                {analysis.questions.map((q: string, i: number) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-yellow-400 shrink-0">?</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.risks && analysis.risks.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">
                Risks & Concerns
              </h3>
              <ul className="text-sm text-slate-300 space-y-1">
                {analysis.risks.map((r: string, i: number) => (
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

      {/* Raw Transcript */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Transcript</h3>
        {segments.map((seg, i) => (
          <div key={i} className="transcript-entry flex gap-3 group">
            <span className="font-mono text-xs text-muted pt-0.5 w-12 shrink-0 tabular-nums">
              {fmtTime(seg.start)}
            </span>
            <div className="flex-1">
              {seg.speaker && (
                <span className="text-accent text-xs font-semibold font-mono mr-2">
                  {seg.speaker}
                </span>
              )}
              <span className="text-sm text-slate-200 leading-relaxed">{seg.text}</span>
            </div>
          </div>
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}