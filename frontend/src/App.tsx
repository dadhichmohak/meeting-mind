import { useState } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { Header } from "./components/Header";
import { Controls } from "./components/Controls";
import { LiveTranscript } from "./components/LiveTranscript";
import { MeetingHistory } from "./components/MeetingHistory";
import { AudioUpload } from "./components/AudioUpload";
import { StatusBar } from "./components/StatusBar";

type Tab = "live" | "history" | "upload";

export default function App() {
  useWebSocket();
  const [tab, setTab] = useState<Tab>("live");

  return (
    <div className="h-screen flex flex-col bg-surface">
      <Header />
      <div className="flex border-b border-border">
        {(["live", "history", "upload"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-6 py-2 text-sm font-medium transition-colors capitalize ${
              tab === t
                ? "text-white border-b-2 border-accent"
                : "text-muted hover:text-slate-300"
            }`}
          >
            {t === "live" ? "🎙 Live" : t === "history" ? "📋 History" : "⬆ Upload"}
          </button>
        ))}
      </div>
      {tab === "live" && (
        <>
          <Controls />
          <LiveTranscript />
        </>
      )}
      {tab === "history" && <MeetingHistory />}
      {tab === "upload" && <AudioUpload />}
      <StatusBar />
    </div>
  );
}