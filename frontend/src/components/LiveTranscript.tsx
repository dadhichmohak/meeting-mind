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

  useEffect(() => {
    const handleAnalysis = (evt: any) => {
      if (evt.detail?.analysis) setAnalysis(evt.detail.analysis);
    };
    window.addEventListener("meeting-stopped", handleAnalysis);
    return () => window.removeEventListener("meeting-stopped", handleAnalysis);
  }, []);

  // Empty state
  if (segments.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {status === "recording" ? (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-2 border-live/30 animate-pulse-slow" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-4 h-4 rounded-full bg-live animate-pulse" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-txt-primary">Listening for speech...</p>
              <p className="text-xs text-muted mt-1">Transcript will appear here in real-time</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-panel-2 border border-border flex items-center justify-center">
              <svg className="w-6 h-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-txt-primary">No transcript yet</p>
              <p className="text-xs text-muted mt-1">Press Start Recording to begin</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Analysis Card */}
      {analysis && !analysis.error && (
        <div className="mx-6 mt-6 bg-panel border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-panel-2/50">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
              <h3 className="text-xs font-semibold text-accent uppercase tracking-wider">AI Analysis</h3>
            </div>
          </div>
          <div className="p-5 space-y-4">
            {analysis.summary && (
              <div>
                <h4 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Summary</h4>
                <p className="text-sm text-txt-secondary leading-relaxed">{analysis.summary}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {analysis.decisions && analysis.decisions.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Decisions</h4>
                  <ul className="space-y-1">
                    {analysis.decisions.map((d: string, i: number) => (
                      <li key={i} className="flex gap-2 text-sm text-txt-secondary">
                        <span className="text-success shrink-0 mt-0.5">&#10003;</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.action_items && analysis.action_items.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Action Items</h4>
                  <ul className="space-y-1">
                    {analysis.action_items.map((a: string, i: number) => (
                      <li key={i} className="flex gap-2 text-sm text-txt-secondary">
                        <span className="text-primary shrink-0 mt-0.5">&#8594;</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.questions && analysis.questions.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Questions</h4>
                  <ul className="space-y-1">
                    {analysis.questions.map((q: string, i: number) => (
                      <li key={i} className="flex gap-2 text-sm text-txt-secondary">
                        <span className="text-warning shrink-0 mt-0.5">?</span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.risks && analysis.risks.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Risks</h4>
                  <ul className="space-y-1">
                    {analysis.risks.map((r: string, i: number) => (
                      <li key={i} className="flex gap-2 text-sm text-txt-secondary">
                        <span className="text-error shrink-0 mt-0.5">&#9888;</span>
                        <span>{r}</span>
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
      <div className="px-6 py-4 space-y-1">
        <h3 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-3">Transcript</h3>
        {segments.map((seg, i) => (
          <div
            key={i}
            className="flex gap-3 py-2 px-3 rounded-lg hover:bg-panel/80 transition-colors group"
          >
            <span className="font-mono text-xs text-muted pt-0.5 w-12 shrink-0 tabular-nums select-none">
              {fmtTime(seg.start)}
            </span>
            <div className="flex-1 min-w-0">
              {seg.speaker && (
                <span className="text-primary text-xs font-semibold font-mono mr-2">
                  {seg.speaker}
                </span>
              )}
              <span className="text-sm text-txt-secondary leading-relaxed">{seg.text}</span>
            </div>
          </div>
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
