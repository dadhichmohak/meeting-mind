import { useMeetingStore } from "../store/meetingStore";

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function StatusBar() {
  const { status, duration, segments, error } = useMeetingStore();

  if (error) {
    return (
      <div className="px-6 py-2 bg-red-900/30 border-t border-red-800/40 text-red-400 text-xs font-mono">
        {error}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6 px-6 py-2 border-t border-border text-xs font-mono text-muted">
      <span>Status: <span className="text-white">{status}</span></span>
      {status === "recording" && (
        <>
          <span>Duration: <span className="text-white">{fmt(duration)}</span></span>
          <span>Segments: <span className="text-white">{segments.length}</span></span>
        </>
      )}
    </div>
  );
}