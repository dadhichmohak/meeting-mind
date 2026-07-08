import { useState, useEffect, useRef, useCallback } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { useMeetingStore } from "./store/meetingStore";
import { usePreferences } from "./store/usePreferences";
import { useTheme } from "./hooks/useTheme";
import { useMeeting } from "./hooks/useMeeting";
import { MeetingHistory } from "./components/MeetingHistory";
import { Settings } from "./components/Settings";

const API = "http://127.0.0.1:8765";

type AudioSource = "mic" | "system" | "both";

function fmtTime(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export default function App() {
  useWebSocket();
  const { status, segments, duration } = useMeetingStore();
  const prefs = usePreferences();
  const { toggleTheme, isDark } = useTheme();
  const { startMeeting, stopMeeting } = useMeeting();
  const [view, setView] = useState<"note" | "history">("note");
  const [noteText, setNoteText] = useState("");
  const [analysis, setAnalysis] = useState<any>(null);
  const [showRecording, setShowRecording] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "today" | "me">("all");
  const [recordingMinimized, setRecordingMinimized] = useState(false);
  const [audioSource, setAudioSource] = useState<AudioSource>("both");
  const [devices, setDevices] = useState<any>({ devices: [], apps: [], input_devices: [], output_devices: [] });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isRecording = status === "recording";
  const isLoading = status === "loading" || status === "stopping";

  useEffect(() => {
    fetch(`${API}/meetings/devices`)
      .then(r => r.json())
      .then(setDevices)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleAnalysis = (evt: any) => {
      if (evt.detail?.analysis) {
        setAnalysis(evt.detail.analysis);
        setShowRecording(false);
      }
    };
    window.addEventListener("meeting-stopped", handleAnalysis);
    return () => window.removeEventListener("meeting-stopped", handleAnalysis);
  }, []);

  useEffect(() => {
    if (isRecording) setShowRecording(true);
  }, [isRecording]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [view]);

  const handleStart = async () => {
    const enableLoopback = audioSource === "system" || audioSource === "both";
    const micDevice = audioSource === "system" ? undefined : undefined;
    await startMeeting({
      enable_loopback: enableLoopback,
      use_wasapi: true,
      mic_device: micDevice,
    });
    setRecordingMinimized(false);
  };
  const handleStop = async () => { await stopMeeting(); };

  const handleSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      setShowSearch(false);
      return;
    }
    setIsSearching(true);
    try {
      const r = await fetch(`${API}/meetings/search?q=${encodeURIComponent(q)}&limit=5`);
      const data = await r.json();
      setSearchResults(data.results || []);
      setShowSearch(true);
    } catch {
      setSearchResults([]);
    }
    setIsSearching(false);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(searchQuery);
  };

  const handleWhatDidIMiss = async () => {
    const q = searchQuery.trim();
    if (q) {
      handleSearch(q);
      return;
    }
    setIsSearching(true);
    try {
      const r = await fetch(`${API}/meetings/search?q=today&limit=3`);
      const data = await r.json();
      if (data.results && data.results.length > 0) {
        setSearchQuery("today");
        setSearchResults(data.results);
        setShowSearch(true);
      } else {
        const r2 = await fetch(`${API}/meetings/search?q=action+items+decisions&limit=3`);
        const d2 = await r2.json();
        setSearchQuery("action items decisions");
        setSearchResults(d2.results || []);
        setShowSearch(true);
      }
    } catch {
      setSearchResults([]);
    }
    setIsSearching(false);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("summary_language", prefs.summaryLang);
      if (prefs.groqApiKey) formData.append("groq_api_key", prefs.groqApiKey);
      const r = await fetch(`${API}/upload`, { method: "POST", body: formData });
      const data = await r.json();
      if (!r.ok) {
        setUploadResult({ error: data.detail || data.error || "Upload failed" });
      } else {
        setUploadResult(data);
      }
    } catch (e) {
      setUploadResult({ error: "Upload failed — could not connect to server" });
    }
    setUploading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    e.target.value = "";
  };

  const SidebarContent = ({ mobile }: { mobile: boolean }) => (
    <>
      <div className="px-5 py-6 flex items-center justify-between">
        <h1 className="text-[20px] font-serif theme-text" style={{ fontWeight: 500 }}>
          MetMind
        </h1>
        {mobile && (
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg theme-text-muted hover:theme-text">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <nav className="px-3 flex-1 space-y-1">
        <button
          onClick={() => setView("note")}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] transition-colors ${
            view === "note" ? "theme-surface theme-text" : "theme-text-secondary hover:theme-surface-hover"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          Note
        </button>
        <button
          onClick={() => setView("history")}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] transition-colors ${
            view === "history" ? "theme-surface theme-text" : "theme-text-secondary hover:theme-surface-hover"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          History
        </button>
        <button
          onClick={() => { fileInputRef.current?.click(); if (mobile) setSidebarOpen(false); }}
          disabled={uploading}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] theme-text-secondary hover:theme-surface-hover transition-colors disabled:opacity-40"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          {uploading ? "Uploading..." : "Upload Audio"}
        </button>
      </nav>
      <div className="px-3 pb-4 space-y-1">
        <button
          onClick={() => { setShowSettings(true); if (mobile) setSidebarOpen(false); }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] theme-text-secondary hover:theme-surface-hover transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] theme-text-secondary hover:theme-surface-hover transition-colors"
        >
          {isDark ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
            </svg>
          )}
          {isDark ? "Light mode" : "Dark mode"}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen theme-bg transition-colors duration-200">
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.wav,.m4a,.ogg,.flac,.webm,.mp4,.aac,.wma"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:fixed lg:top-0 lg:left-0 lg:bottom-0 lg:w-[240px] lg:z-40 lg:flex-col lg:theme-sidebar lg:theme-border lg:border-r">
        <SidebarContent mobile={false} />
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-[260px] h-full theme-sidebar theme-border border-r flex flex-col animate-fade-in-up">
            <SidebarContent mobile={true} />
          </div>
        </div>
      )}

      {/* Mobile Top Bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 theme-sidebar theme-border border-b flex items-center px-4 py-3">
        <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-xl theme-text-secondary hover:theme-surface-hover">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <h1 className="ml-3 text-[18px] font-serif theme-text" style={{ fontWeight: 500 }}>MetMind</h1>
      </div>

      {/* Main Content */}
      {view === "note" ? (
        <div className="pt-20 lg:pt-24 pb-40 px-4 sm:px-6 lg:px-8 lg:ml-[240px] max-w-[900px] mx-auto lg:mx-0">
          <h1 className="font-serif text-[32px] sm:text-[40px] theme-text-muted mb-6 sm:mb-8" style={{ fontWeight: 500 }}>
            New note
          </h1>
          <div className="flex items-center gap-2 sm:gap-3 mb-6 sm:mb-8 flex-wrap">
            <button
              onClick={() => {
                setActiveFilter("today");
                handleSearch("today");
              }}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-[12px] sm:text-[13px] transition-colors ${
                activeFilter === "today"
                  ? "theme-accent-bg text-white font-medium"
                  : "theme-text-secondary theme-border border hover:theme-surface-hover"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => {
                setActiveFilter("me");
                handleSearch("me");
              }}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-[12px] sm:text-[13px] transition-colors ${
                activeFilter === "me"
                  ? "theme-accent-bg text-white font-medium"
                  : "theme-text-secondary theme-border border hover:theme-surface-hover"
              }`}
            >
              Me
            </button>
            {activeFilter !== "all" && (
              <button
                onClick={() => {
                  setActiveFilter("all");
                  setShowSearch(false);
                  setSearchResults([]);
                  setSearchQuery("");
                }}
                className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-[12px] sm:text-[13px] theme-text-muted hover:theme-text-secondary transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Write notes"
            className="w-full bg-transparent text-[22px] sm:text-[28px] theme-text-placeholder font-serif resize-none outline-none leading-relaxed"
            style={{ fontWeight: 400, minHeight: "200px" }}
          />
          {uploading && (
            <div className="mt-8 sm:mt-12 animate-fade-in-up">
              <div className="theme-surface rounded-4xl theme-border border p-6 sm:p-8 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                    <svg className="w-4 h-4 theme-accent animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-[13px] font-semibold theme-text-secondary uppercase tracking-wider">Uploading &amp; Transcribing</h3>
                    <p className="text-[12px] theme-text-muted">This may take a while for large files...</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {uploadResult && !uploading && (
            <div className="mt-8 sm:mt-12 animate-fade-in-up">
              <div className="theme-surface rounded-4xl theme-border border p-6 sm:p-8 transition-colors">
                {uploadResult.error ? (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-[13px] font-semibold text-red-400 uppercase tracking-wider mb-1">Upload Failed</h3>
                      <p className="text-[14px] text-red-400/80">{uploadResult.error}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                        <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </div>
                      <h3 className="text-[13px] font-semibold theme-text-secondary uppercase tracking-wider">Upload Complete</h3>
                    </div>
                    {uploadResult.filename && (
                      <p className="text-[12px] theme-text-muted mb-2">{uploadResult.filename} &middot; {uploadResult.duration_seconds?.toFixed(1)}s &middot; {uploadResult.segment_count} segments</p>
                    )}
                    {uploadResult.analysis?.summary && (
                      <p className="text-[14px] theme-text-secondary leading-relaxed mb-4">{uploadResult.analysis.summary}</p>
                    )}
                    {uploadResult.transcript?.length > 0 && (
                      <div className="mt-4 max-h-[200px] overflow-y-auto space-y-1.5">
                        {uploadResult.transcript.slice(0, 10).map((seg: any, i: number) => (
                          <div key={i} className="flex gap-2 text-[12px]">
                            <span className="font-mono theme-text-muted shrink-0">{fmtTime(seg.start)}</span>
                            <span className="theme-text-secondary">{seg.text}</span>
                          </div>
                        ))}
                        {uploadResult.transcript.length > 10 && (
                          <p className="text-[11px] theme-text-muted">+ {uploadResult.transcript.length - 10} more segments</p>
                        )}
                      </div>
                    )}
                  </>
                )}
                <button onClick={() => setUploadResult(null)} className="mt-4 text-[12px] theme-text-muted hover:theme-text-secondary">Dismiss</button>
              </div>
            </div>
          )}
          {analysis && !analysis.error && analysis.summary && (
            <div className="mt-8 sm:mt-12 animate-fade-in-up">
              <div className="theme-surface rounded-4xl theme-border border p-6 sm:p-8 transition-colors">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                    <svg className="w-4 h-4 theme-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <h3 className="text-[13px] font-semibold theme-text-secondary uppercase tracking-wider">AI Summary</h3>
                </div>
                <p className="text-[14px] sm:text-[15px] theme-text-secondary leading-relaxed mb-6">{analysis.summary}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  {analysis.decisions?.length > 0 && (
                    <div>
                      <h4 className="text-[11px] font-semibold theme-text-muted uppercase tracking-wider mb-2">Decisions</h4>
                      <ul className="space-y-1.5">
                        {analysis.decisions.map((d: string, i: number) => (
                          <li key={i} className="flex gap-2 text-[13px] theme-text-secondary">
                            <span className="theme-accent shrink-0">&#10003;</span><span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.action_items?.length > 0 && (
                    <div>
                      <h4 className="text-[11px] font-semibold theme-text-muted uppercase tracking-wider mb-2">Action Items</h4>
                      <ul className="space-y-1.5">
                        {analysis.action_items.map((a: string, i: number) => (
                          <li key={i} className="flex gap-2 text-[13px] theme-text-secondary">
                            <span className="theme-accent shrink-0">&#8594;</span><span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.questions?.length > 0 && (
                    <div>
                      <h4 className="text-[11px] font-semibold theme-text-muted uppercase tracking-wider mb-2">Questions</h4>
                      <ul className="space-y-1.5">
                        {analysis.questions.map((q: string, i: number) => (
                          <li key={i} className="flex gap-2 text-[13px] theme-text-secondary">
                            <span className="theme-warning shrink-0">?</span><span>{q}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.risks?.length > 0 && (
                    <div>
                      <h4 className="text-[11px] font-semibold theme-text-muted uppercase tracking-wider mb-2">Risks</h4>
                      <ul className="space-y-1.5">
                        {analysis.risks.map((r: string, i: number) => (
                          <li key={i} className="flex gap-2 text-[13px] theme-text-secondary">
                            <span className="theme-error shrink-0">&#9888;</span><span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.follow_ups?.length > 0 && (
                    <div>
                      <h4 className="text-[11px] font-semibold theme-text-muted uppercase tracking-wider mb-2">Follow-ups</h4>
                      <ul className="space-y-1.5">
                        {analysis.follow_ups.map((f: string, i: number) => (
                          <li key={i} className="flex gap-2 text-[13px] theme-text-secondary">
                            <span className="theme-accent-secondary shrink-0">&#8618;</span><span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {segments.length > 0 && !isRecording && (
            <div className="mt-6 sm:mt-8 animate-fade-in-up">
              <h3 className="text-[11px] font-semibold theme-text-muted uppercase tracking-wider mb-4">Transcript</h3>
              <div className="space-y-2">
                {segments.map((seg, i) => (
                  <div key={i} className="flex gap-2 sm:gap-3 py-2 px-3 sm:px-4 rounded-xl hover:theme-surface transition-colors">
                    <span className="font-mono text-[11px] theme-text-muted pt-0.5 w-10 sm:w-12 shrink-0 tabular-nums select-none">
                      {fmtTime(seg.start)}
                    </span>
                    <div className="flex-1 min-w-0">
                      {seg.speaker && (
                        <span className="theme-accent text-[11px] font-semibold font-mono mr-2">{seg.speaker}</span>
                      )}
                      <span className="text-[13px] sm:text-[14px] theme-text-secondary leading-relaxed">{seg.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="lg:ml-[240px]">
          <MeetingHistory />
        </div>
      )}

      {/* Floating Bar */}
      {!isRecording && !showRecording && (
        <div className="fixed bottom-6 sm:bottom-8 left-0 right-0 z-50 flex justify-center pointer-events-none px-4">
          <div className="pointer-events-auto theme-bg theme-border border rounded-[28px] sm:rounded-[32px] shadow-2xl overflow-visible">
            <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2">
              <div className="relative">
                <button
                  onClick={handleStart}
                  disabled={isLoading}
                  className="h-[48px] sm:h-[54px] px-4 sm:px-5 rounded-[24px] sm:rounded-[28px] theme-surface theme-border border flex items-center gap-2 sm:gap-3 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
                >
                  <div className="flex items-center gap-0.5 sm:gap-1">
                    <span className="w-1 h-2.5 sm:h-3 rounded-full theme-accent-bg animate-pulse" />
                    <span className="w-1 h-3 sm:h-4 rounded-full theme-accent-bg animate-pulse" style={{ animationDelay: "0.15s" }} />
                    <span className="w-1 h-2 sm:h-2.5 rounded-full theme-accent-bg animate-pulse" style={{ animationDelay: "0.3s" }} />
                  </div>
                  <span className="text-[12px] sm:text-[13px] font-medium theme-text-secondary">Record</span>
                </button>
              </div>
              {/* Audio Source Selector */}
              <div className="flex items-center gap-1 theme-surface theme-border border rounded-full px-1 py-1">
                <button
                  onClick={() => setAudioSource("mic")}
                  className={`px-2 sm:px-3 py-1.5 rounded-full text-[11px] sm:text-[12px] transition-colors ${
                    audioSource === "mic" ? "theme-accent-bg text-white" : "theme-text-muted hover:theme-surface-hover"
                  }`}
                  title="Microphone only"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                </button>
                <button
                  onClick={() => setAudioSource("system")}
                  className={`px-2 sm:px-3 py-1.5 rounded-full text-[11px] sm:text-[12px] transition-colors ${
                    audioSource === "system" ? "theme-accent-bg text-white" : "theme-text-muted hover:theme-surface-hover"
                  }`}
                  title="System audio (WASAPI)"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                  </svg>
                </button>
                <button
                  onClick={() => setAudioSource("both")}
                  className={`px-2 sm:px-3 py-1.5 rounded-full text-[11px] sm:text-[12px] transition-colors ${
                    audioSource === "both" ? "theme-accent-bg text-white" : "theme-text-muted hover:theme-surface-hover"
                  }`}
                  title="Microphone + System audio"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                  </svg>
                </button>
              </div>
              {/* Search Bar */}
              <div className="relative">
                <form onSubmit={handleSearchSubmit} className="flex items-center">
                  <div className="h-[40px] sm:h-[54px] w-[180px] sm:w-[480px] rounded-[20px] sm:rounded-[28px] theme-surface theme-border border items-center px-3 sm:px-5 flex gap-2">
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => searchResults.length > 0 && setShowSearch(true)}
                      placeholder="Ask anything"
                      className="flex-1 bg-transparent text-[12px] sm:text-[14px] theme-text outline-none placeholder:theme-text-muted min-w-0"
                    />
                    {searchQuery.trim() && (
                      <button
                        type="submit"
                        disabled={isSearching}
                        className="shrink-0 p-1 sm:p-1.5 rounded-full theme-accent-bg text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                        title="Search"
                      >
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                      </button>
                    )}
                    {!searchQuery.trim() && (
                      <button
                        type="button"
                        onClick={handleWhatDidIMiss}
                        disabled={isSearching}
                        className="shrink-0 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full theme-bg theme-border border text-[10px] sm:text-[12px] font-medium theme-text-secondary hover:theme-surface-hover transition-colors disabled:opacity-50"
                      >
                        {isSearching ? "..." : "What did I miss"}
                      </button>
                    )}
                  </div>
                </form>
                {/* Search Results Dropdown */}
                {showSearch && searchResults.length > 0 && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 theme-surface theme-border border rounded-2xl shadow-xl max-h-[300px] overflow-y-auto">
                    {searchResults.map((result: any) => (
                      <button
                        key={result.id}
                        onClick={() => {
                          setView("history");
                          setShowSearch(false);
                          setSearchQuery("");
                        }}
                        className="w-full px-4 py-3 text-left hover:theme-surface-hover transition-colors border-b theme-border last:border-b-0 first:rounded-t-2xl last:rounded-b-2xl"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[13px] font-medium theme-text truncate">{result.title || "Untitled"}</span>
                          <span className="text-[11px] theme-text-muted shrink-0">{result.segment_count} segs</span>
                        </div>
                        {result.matched_segments?.slice(0, 2).map((seg: any, i: number) => (
                          <p key={i} className="text-[12px] theme-text-secondary truncate">&quot;{seg.text}&quot;</p>
                        ))}
                      </button>
                    ))}
                  </div>
                )}
                {showSearch && searchResults.length === 0 && !isSearching && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 theme-surface theme-border border rounded-2xl shadow-xl px-4 py-3">
                    <p className="text-[12px] theme-text-muted text-center">No results found</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recording Modal */}
      {showRecording && (isRecording || status === "stopping") && !recordingMinimized && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-[690px] max-h-[85vh] rounded-[24px] sm:rounded-[28px] theme-surface theme-border border overflow-hidden animate-fade-in-up">
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full theme-recording-bg animate-pulse" />
                <span className="text-[12px] font-medium theme-recording uppercase tracking-wider">Recording</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setRecordingMinimized(true)}
                  className="p-2 rounded-xl theme-text-muted hover:theme-text hover:theme-surface-hover transition-colors"
                  title="Minimize"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {isRecording && (
                  <button
                    onClick={() => { if (!isRecording) setShowRecording(false); }}
                    className="p-2 rounded-xl theme-text-muted hover:theme-text hover:theme-surface-hover transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <div className="text-center py-3">
              <p className="text-[12px] sm:text-[13px] theme-text-muted">Always get consent when transcribing others.</p>
            </div>
            <div className="text-center py-4">
              <span className="text-[20px] sm:text-[22px] font-mono theme-text-secondary tabular-nums">{fmtTime(duration)}</span>
            </div>
            <div className="px-4 sm:px-6 py-4 max-h-[300px] overflow-y-auto space-y-2">
              {segments.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-[13px] sm:text-[14px] theme-text-muted">Waiting for speech...</p>
                </div>
              ) : (
                segments.map((seg, i) => (
                  <div key={i} className="flex justify-end animate-fade-in-up">
                    <div className="max-w-[80%] px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl theme-surface-secondary text-[14px] sm:text-[15px] theme-text leading-relaxed">
                      {seg.text}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mx-4 sm:mx-6 h-px theme-border" />
            <div className="flex items-center justify-between px-4 sm:px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="w-1 h-2.5 sm:h-3 rounded-full theme-accent-bg animate-pulse" />
                  <span className="w-1 h-3 sm:h-4 rounded-full theme-accent-bg animate-pulse" style={{ animationDelay: "0.15s" }} />
                  <span className="w-1 h-2 sm:h-2.5 rounded-full theme-accent-bg animate-pulse" style={{ animationDelay: "0.3s" }} />
                </div>
                <button
                  onClick={handleStop}
                  disabled={isLoading}
                  className="w-8 h-8 rounded-full theme-accent-bg flex items-center justify-center hover:scale-110 active:scale-95 transition-transform disabled:opacity-40"
                >
                  <div className="w-3 h-3 rounded-sm theme-bg" />
                </button>
              </div>
              <div className="text-[12px] theme-text-muted font-mono">{fmtTime(duration)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Minimized Recording Bar */}
      {showRecording && isRecording && recordingMinimized && (
        <div className="fixed bottom-6 sm:bottom-8 left-0 right-0 z-50 flex justify-center pointer-events-none px-4">
          <div className="pointer-events-auto theme-surface theme-border border rounded-[28px] sm:rounded-[32px] shadow-2xl px-4 sm:px-5 py-3 flex items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-1">
              <span className="w-1 h-2.5 sm:h-3 rounded-full theme-recording-bg animate-pulse" />
              <span className="w-1 h-3 sm:h-4 rounded-full theme-recording-bg animate-pulse" style={{ animationDelay: "0.15s" }} />
              <span className="w-1 h-2 sm:h-2.5 rounded-full theme-recording-bg animate-pulse" style={{ animationDelay: "0.3s" }} />
            </div>
            <span className="text-[13px] sm:text-[14px] font-mono theme-text tabular-nums">{fmtTime(duration)}</span>
            <span className="text-[12px] theme-text-muted">{segments.length} segments</span>
            <div className="w-px h-5 theme-border" />
            <button
              onClick={() => setRecordingMinimized(false)}
              className="p-1.5 rounded-lg theme-text-secondary hover:theme-surface-hover transition-colors"
              title="Expand"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
              </svg>
            </button>
            <button
              onClick={handleStop}
              disabled={isLoading}
              className="w-8 h-8 rounded-full theme-recording-bg flex items-center justify-center hover:scale-110 active:scale-95 transition-transform disabled:opacity-40"
            >
              <div className="w-3 h-3 rounded-sm bg-white" />
            </button>
          </div>
        </div>
      )}

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  );
}
