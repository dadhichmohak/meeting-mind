import { useMeetingStore } from "../store/meetingStore";

export function Header() {
  const { status, meetingId } = useMeetingStore();

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-border">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-xs font-bold text-white font-mono">
          M
        </div>
        <span className="font-semibold text-white tracking-wide">MeetingMind AI</span>
      </div>

      <div className="flex items-center gap-2 text-sm">
        {status === "recording" && (
          <>
            <span className="w-2 h-2 rounded-full bg-live animate-pulse" />
            <span className="text-live font-mono text-xs">LIVE</span>
            {meetingId && (
              <span className="text-muted font-mono text-xs ml-1">#{meetingId}</span>
            )}
          </>
        )}
        {status === "loading" && (
          <span className="text-muted text-xs font-mono">Starting...</span>
        )}
        {status === "stopping" && (
          <span className="text-muted text-xs font-mono">Saving...</span>
        )}
        {status === "idle" && (
          <span className="text-muted text-xs font-mono">Ready</span>
        )}
      </div>
    </header>
  );
}