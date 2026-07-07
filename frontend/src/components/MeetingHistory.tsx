import { useEffect, useState } from "react";
import { useMeetingStore } from "../store/meetingStore";

const API = "http://127.0.0.1:8765";

interface MeetingSummary {
  id: string;
  title: string | null;
  status: string;
  started_at: string | null;
  duration_seconds: number;
  segment_count: number;
}

interface MeetingDetail extends MeetingSummary {
  ended_at: string | null;
  analysis: {
    summary?: string;
    decisions?: string[];
    action_items?: string[];
    questions?: string[];
    risks?: string[];
    follow_ups?: string[];
  } | null;
  segments: {
    sequence: number;
    text: string;
    speaker: string | null;
    start_sec: number;
    end_sec: number;
  }[];
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MeetingHistory() {
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [selected, setSelected] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { status } = useMeetingStore();

  const fetchMeetings = async () => {
    try {
      const r = await fetch(`${API}/meetings/list`);
      const data = await r.json();
      setMeetings(data.meetings || []);
    } catch {
      // silently fail
    }
  };

  const fetchDetail = async (id: string) => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/meetings/${id}`);
      const data = await r.json();
      setSelected(data);
    } catch {
      // silently fail
    }
    setLoading(false);
  };

  const deleteMeeting = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this meeting transcript?")) return;
    setDeleting(id);
    try {
      await fetch(`${API}/meetings/${id}`, { method: "DELETE" });
      setMeetings((prev) => prev.filter((m) => m.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch {
      // silently fail
    }
    setDeleting(null);
  };

  useEffect(() => {
    fetchMeetings();
  }, [status]);

  if (selected) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => setSelected(null)}
            className="text-xs text-accent hover:text-blue-400 font-mono"
          >
            ← Back
          </button>
          <button
            onClick={(e) => deleteMeeting(selected.id, e)}
            disabled={deleting === selected.id}
            className="text-xs text-red-400 hover:text-red-300 font-mono disabled:opacity-40"
          >
            {deleting === selected.id ? "Deleting..." : "Delete"}
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {selected.title || `Meeting #${selected.id}`}
            </h2>
            <p className="text-xs text-muted font-mono mt-1">
              {fmtDate(selected.started_at)} · {fmtDuration(selected.duration_seconds)} · {selected.segment_count} segments
            </p>
          </div>

          {selected.analysis && !selected.analysis.summary && !selected.analysis.decisions && (
            <div className="text-sm text-muted bg-panel rounded border border-border p-4">
              No analysis available.
            </div>
          )}

          {selected.analysis?.summary && (
            <div className="bg-panel rounded border border-border p-4 space-y-3">
              <h3 className="text-xs font-semibold text-accent uppercase tracking-wide">Summary</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{selected.analysis.summary}</p>

              {selected.analysis.decisions && selected.analysis.decisions.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Decisions</h4>
                  <ul className="text-sm text-slate-300 space-y-1">
                    {selected.analysis.decisions.map((d, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-live shrink-0">•</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selected.analysis.action_items && selected.analysis.action_items.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Action Items</h4>
                  <ul className="text-sm text-slate-300 space-y-1">
                    {selected.analysis.action_items.map((a, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-live shrink-0">→</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selected.analysis.questions && selected.analysis.questions.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-yellow-400 uppercase tracking-wide mb-2">Open Questions</h4>
                  <ul className="text-sm text-slate-300 space-y-1">
                    {selected.analysis.questions.map((q, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-yellow-400 shrink-0">?</span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selected.analysis.risks && selected.analysis.risks.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">Risks</h4>
                  <ul className="text-sm text-slate-300 space-y-1">
                    {selected.analysis.risks.map((r, i) => (
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

          {selected.segments.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Transcript</h3>
              {selected.segments.map((seg, i) => {
                const m = Math.floor(seg.start_sec / 60).toString().padStart(2, "0");
                const s = Math.floor(seg.start_sec % 60).toString().padStart(2, "0");
                return (
                  <div key={i} className="flex gap-3 text-sm">
                    <span className="font-mono text-xs text-muted pt-0.5 w-12 shrink-0 tabular-nums">
                      {m}:{s}
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
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Meeting History</h2>
        <button
          onClick={fetchMeetings}
          className="text-xs text-accent hover:text-blue-400 font-mono"
        >
          Refresh
        </button>
      </div>

      {meetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-muted py-12">
          <p className="text-sm font-mono">No meetings yet</p>
          <p className="text-xs mt-1 opacity-50">Recorded meetings will appear here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {meetings.map((m) => (
            <div
              key={m.id}
              onClick={() => fetchDetail(m.id)}
              className="flex items-center justify-between bg-panel hover:bg-slate-800 rounded border border-border p-3 transition-colors cursor-pointer group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white font-medium truncate">
                    {m.title || `Meeting #${m.id}`}
                  </span>
                  <span className="text-xs text-muted font-mono">#{m.id}</span>
                  <span
                    className={`text-xs font-mono px-2 py-0.5 rounded ${
                      m.status === "completed"
                        ? "bg-green-900/30 text-green-400"
                        : "bg-yellow-900/30 text-yellow-400"
                    }`}
                  >
                    {m.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted font-mono">
                  <span>{fmtDate(m.started_at)}</span>
                  <span>{fmtDuration(m.duration_seconds)}</span>
                  <span>{m.segment_count} segments</span>
                </div>
              </div>
              <button
                onClick={(e) => deleteMeeting(m.id, e)}
                disabled={deleting === m.id}
                className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-300 font-mono px-2 py-1 transition-opacity disabled:opacity-40"
              >
                {deleting === m.id ? "..." : "×"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
