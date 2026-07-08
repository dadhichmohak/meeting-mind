import { useEffect, useState, useCallback, useMemo } from "react";
import { useMeetingStore } from "../store/meetingStore";
import { apiUrl } from "../config";

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
  notes: string;
  segments: {
    sequence: number;
    text: string;
    speaker: string | null;
    start_sec: number;
    end_sec: number;
  }[];
}

interface SearchResult {
  id: string;
  title: string | null;
  status: string;
  started_at: string | null;
  duration_seconds: number;
  segment_count: number;
  match_type: "title" | "transcript";
  matched_segments: { text: string; start_sec: number; speaker: string | null }[];
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

function groupByDate(items: MeetingSummary[]): { label: string; items: MeetingSummary[] }[] {
  const groups: { label: string; items: MeetingSummary[] }[] = [];
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();

  const map = new Map<string, MeetingSummary[]>();
  for (const item of items) {
    const d = item.started_at ? new Date(item.started_at) : now;
    const key = d.toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }

  for (const [key, group] of map) {
    let label: string;
    if (key === today) {
      label = "Today";
    } else if (key === yesterday) {
      label = "Yesterday";
    } else {
      const d = new Date(key);
      label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    }
    groups.push({ label, items: group });
  }

  return groups;
}

export function MeetingHistory({ onSelectMeeting }: { onSelectMeeting?: (id: string | null) => void }) {
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [selected, setSelected] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { status } = useMeetingStore();

  const fetchMeetings = async () => {
    try {
      const r = await fetch(apiUrl("/meetings/list"));
      const data = await r.json();
      setMeetings(data.meetings || []);
    } catch { /* silently fail */ }
  };

  const fetchDetail = async (id: string) => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl(`/meetings/${id}`));
      const data = await r.json();
      setSelected(data);
      setEditTitle(data.title || "");
      setEditNotes(data.notes || "");
      onSelectMeeting?.(id);
    } catch { /* silently fail */ }
    setLoading(false);
  };

  const deleteMeeting = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this meeting transcript?")) return;
    setDeleting(id);
    try {
      await fetch(apiUrl(`/meetings/${id}`), { method: "DELETE" });
      setMeetings((prev) => prev.filter((m) => m.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch { /* silently fail */ }
    setDeleting(null);
  };

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const r = await fetch(apiUrl(`/meetings/search?q=${encodeURIComponent(q)}`));
      const data = await r.json();
      setSearchResults(data.results || []);
    } catch { /* silently fail */ }
    setSearching(false);
  }, []);

  const saveTitle = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await fetch(apiUrl(`/meetings/${selected.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle }),
      });
      setSelected({ ...selected, title: editTitle });
      setMeetings((prev) =>
        prev.map((m) => (m.id === selected.id ? { ...m, title: editTitle } : m))
      );
      setEditingTitle(false);
    } catch { /* silently fail */ }
    setSaving(false);
  };

  const saveNotes = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await fetch(apiUrl(`/meetings/${selected.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: editNotes }),
      });
      setSelected({ ...selected, notes: editNotes });
      setEditingNotes(false);
    } catch { /* silently fail */ }
    setSaving(false);
  };

  useEffect(() => { fetchMeetings(); }, [status, selected]);

  useEffect(() => {
    const t = setTimeout(() => { doSearch(query); }, 300);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  const grouped = useMemo(() => {
    const list = searchResults !== null ? searchResults : meetings;
    if (searchResults !== null) return [{ label: `Results for "${query}"`, items: list }];
    return groupByDate(list);
  }, [meetings, searchResults, query]);

  const fmtRowTime = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  // ── Detail View ──────────────────────────────────────────────
  if (selected) {
    return (
      <div className="pt-24 pb-40 px-8" style={{ maxWidth: "900px" }}>
        <button
          onClick={() => { setSelected(null); setSearchResults(null); setQuery(""); onSelectMeeting?.(null); }}
          className="flex items-center gap-2 text-[13px] theme-text-muted hover:theme-text transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>

        <div className="space-y-6">
          {/* Title */}
          <div>
            {editingTitle ? (
              <div className="flex items-center gap-3">
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveTitle()}
                  className="flex-1 bg-transparent border-b-2 border-accent text-[28px] font-serif theme-text outline-none py-1"
                  style={{ fontWeight: 400 }}
                  autoFocus
                />
                <button onClick={saveTitle} disabled={saving} className="px-4 py-2 rounded-2xl theme-accent-bg text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-40">
                  {saving ? "..." : "Save"}
                </button>
                <button onClick={() => { setEditingTitle(false); setEditTitle(selected.title || ""); }} className="px-4 py-2 rounded-2xl theme-border border text-[13px] theme-text-muted hover:theme-text-secondary">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 group">
                <h1
                  className="text-[28px] font-serif theme-text cursor-pointer hover:theme-text-secondary transition-colors"
                  style={{ fontWeight: 500 }}
                  onClick={() => { setEditingTitle(true); setEditTitle(selected.title || ""); }}
                >
                  {selected.title || `Meeting #${selected.id.slice(0, 8)}`}
                </h1>
                <button
                  onClick={() => { setEditingTitle(true); setEditTitle(selected.title || ""); }}
                  className="opacity-0 group-hover:opacity-100 theme-text-muted hover:theme-text p-1 rounded-lg transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                </button>
              </div>
            )}
            <div className="flex items-center gap-3 text-[12px] theme-text-muted font-mono mt-2">
              <span>{fmtDuration(selected.duration_seconds)}</span>
              <span>&#8226;</span>
              <span>{selected.segment_count} segments</span>
            </div>
          </div>

          {/* Notes */}
          <div className="theme-surface rounded-4xl theme-border border p-6 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[11px] font-semibold theme-text-muted uppercase tracking-wider">Notes</h3>
              {!editingNotes && (
                <button
                  onClick={() => { setEditingNotes(true); setEditNotes(selected.notes || ""); }}
                  className="text-[12px] theme-text-muted hover:theme-text-secondary px-3 py-1.5 rounded-xl hover:theme-surface-hover transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-3">
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Add notes about this meeting..."
                  rows={4}
                  className="w-full bg-transparent border theme-border rounded-2xl px-4 py-3 text-[14px] theme-text theme-text-placeholder focus:outline-none focus:border-accent resize-none"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <button onClick={saveNotes} disabled={saving} className="px-4 py-2 rounded-2xl theme-accent-bg text-white text-[13px] font-semibold hover:opacity-90 disabled:opacity-40">
                    {saving ? "Saving..." : "Save Notes"}
                  </button>
                  <button onClick={() => { setEditingNotes(false); setEditNotes(selected.notes || ""); }} className="px-4 py-2 rounded-2xl theme-border border text-[13px] theme-text-muted hover:theme-text-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[14px] theme-text-secondary leading-relaxed whitespace-pre-wrap">
                {selected.notes || <span className="theme-text-muted italic">No notes yet. Click Edit to add.</span>}
              </p>
            )}
          </div>

          {/* Analysis */}
          {selected.analysis?.summary && (
            <div className="theme-surface rounded-4xl theme-border border p-6 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                  <svg className="w-4 h-4 theme-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <h3 className="text-[11px] font-semibold theme-text-muted uppercase tracking-wider">AI Analysis</h3>
              </div>
              <p className="text-[14px] theme-text-secondary leading-relaxed mb-6">{selected.analysis.summary}</p>

              <div className="grid grid-cols-2 gap-6">
                {selected.analysis.decisions && selected.analysis.decisions.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-semibold theme-text-muted uppercase tracking-wider mb-2">Decisions</h4>
                    <ul className="space-y-1.5">
                      {selected.analysis.decisions.map((d, i) => (
                        <li key={i} className="flex gap-2 text-[13px] theme-text-secondary">
                          <span className="theme-accent shrink-0">&#10003;</span><span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {selected.analysis.action_items && selected.analysis.action_items.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-semibold theme-text-muted uppercase tracking-wider mb-2">Action Items</h4>
                    <ul className="space-y-1.5">
                      {selected.analysis.action_items.map((a, i) => (
                        <li key={i} className="flex gap-2 text-[13px] theme-text-secondary">
                          <span className="theme-accent shrink-0">&#8594;</span><span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {selected.analysis.questions && selected.analysis.questions.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-semibold theme-text-muted uppercase tracking-wider mb-2">Questions</h4>
                    <ul className="space-y-1.5">
                      {selected.analysis.questions.map((q, i) => (
                        <li key={i} className="flex gap-2 text-[13px] theme-text-secondary">
                          <span className="text-[#F59E0B] shrink-0">?</span><span>{q}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {selected.analysis.risks && selected.analysis.risks.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-semibold theme-text-muted uppercase tracking-wider mb-2">Risks</h4>
                    <ul className="space-y-1.5">
                      {selected.analysis.risks.map((r, i) => (
                        <li key={i} className="flex gap-2 text-[13px] theme-text-secondary">
                          <span className="theme-error shrink-0">&#9888;</span><span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {selected.analysis.follow_ups && selected.analysis.follow_ups.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-semibold theme-text-muted uppercase tracking-wider mb-2">Follow-ups</h4>
                    <ul className="space-y-1.5">
                      {selected.analysis.follow_ups.map((f, i) => (
                        <li key={i} className="flex gap-2 text-[13px] theme-text-secondary">
                          <span className="theme-accent-secondary shrink-0">&#8618;</span><span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transcript */}
          {selected.segments.length > 0 && (
            <div className="theme-surface rounded-4xl theme-border border p-6 transition-colors">
              <h3 className="text-[11px] font-semibold theme-text-muted uppercase tracking-wider mb-4">Transcript</h3>
              <div className="space-y-2">
                {selected.segments.map((seg, i) => (
                  <div key={i} className="flex gap-3 py-2 px-4 rounded-xl hover:theme-surface-hover transition-colors">
                    <span className="font-mono text-[11px] theme-text-muted pt-0.5 w-12 shrink-0 tabular-nums select-none">
                      {fmtTime(seg.start_sec)}
                    </span>
                    <div className="flex-1 min-w-0">
                      {seg.speaker && (
                        <span className="theme-accent text-[11px] font-semibold font-mono mr-2">{seg.speaker}</span>
                      )}
                      <span className="text-[14px] theme-text-secondary leading-relaxed">{seg.text}</span>
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

  // ── List View (Granola-style) ──────────────────────────────────
  return (
    <div className="pt-24 pb-40 px-8" style={{ maxWidth: "800px" }}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[40px] font-serif theme-text-muted" style={{ fontWeight: 400 }}>
          History
        </h1>
        <button
          onClick={fetchMeetings}
          className="p-2 rounded-xl theme-text-muted hover:theme-text hover:theme-surface-hover transition-colors"
          title="Refresh"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 theme-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
          className="w-full bg-transparent border-b theme-border pb-2 pl-10 pr-4 text-[14px] theme-text theme-text-placeholder focus:outline-none focus:border-accent transition-colors"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          </div>
        )}
      </div>

      {/* Grouped List */}
      {grouped.length === 0 || (grouped.length === 1 && grouped[0].items.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-24">
          <p className="text-[14px] theme-text-muted">
            {searchResults !== null ? "No matches" : "No meetings yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.label}>
              {/* Date header */}
              <div className="text-[12px] theme-text-muted mb-2 px-1">{group.label}</div>

              {/* Rows */}
              <div className="space-y-0.5">
                {group.items.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => fetchDetail(m.id)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:theme-surface-hover transition-colors group"
                  >
                    {/* Document icon */}
                    <div className="w-8 h-8 rounded-lg theme-surface flex items-center justify-center shrink-0 theme-border border">
                      <svg className="w-4 h-4 theme-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>

                    {/* Title + author */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] theme-text truncate">{m.title || `Meeting #${m.id.slice(0, 8)}`}</div>
                      <div className="text-[12px] theme-text-muted">Me</div>
                    </div>

                    {/* Status indicator (note icon) */}
                    {m.status === "completed" && (
                      <svg className="w-4 h-4 theme-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                      </svg>
                    )}

                    {/* Delete (on hover) */}
                    <button
                      onClick={(e) => deleteMeeting(m.id, e)}
                      disabled={deleting === m.id}
                      className="opacity-0 group-hover:opacity-100 theme-text-muted hover:text-[#EF4444] p-1.5 rounded-lg hover:bg-red-500/10 transition-all disabled:opacity-40 shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>

                    {/* Time */}
                    <span className="text-[12px] theme-text-muted font-mono shrink-0">{fmtRowTime(m.started_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
