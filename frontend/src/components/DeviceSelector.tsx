import { useMeetingStore } from "../store/meetingStore";

function AppIcon({ name }: { name: string }) {
  const n = name.toLowerCase();
  if (n.includes("chrome") || n.includes("brave") || n.includes("firefox") || n.includes("edge") || n.includes("opera"))
    return <span title="Browser">🌐</span>;
  if (n.includes("zoom") || n.includes("teams") || n.includes("discord") || n.includes("skype") || n.includes("meet"))
    return <span title="Meeting">📹</span>;
  if (n.includes("spotify") || n.includes("music") || n.includes("vlc") || n.includes("media") || n.includes("itunes"))
    return <span title="Music">🎵</span>;
  if (n.includes("steam") || n.includes("game"))
    return <span title="Game">🎮</span>;
  return <span title="App">🔊</span>;
}

export function DeviceSelector() {
  const {
    devices,
    audioApps,
    selectedMicDevice,
    selectedLoopbackDevice,
    useWasapi,
    setSelectedMic,
    setSelectedLoopback,
    setUseWasapi,
    status,
  } = useMeetingStore();
  const disabled = status === "recording" || status === "loading";

  const inputDevices = devices.filter((d) => d.inputs > 0);
  const appsWithVolume = audioApps.filter((a) => a.volume > 0 || a.peak > 0);

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {/* Mic selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted font-mono whitespace-nowrap">🎤 Mic</label>
        <select
          disabled={disabled}
          value={selectedMicDevice ?? ""}
          onChange={(e) =>
            setSelectedMic(e.target.value === "" ? null : Number(e.target.value))
          }
          className="bg-panel border border-border rounded px-3 py-1.5 text-xs text-white font-mono
                     focus:outline-none focus:border-accent disabled:opacity-40 w-48 truncate"
        >
          <option value="">Default mic</option>
          {inputDevices.map((d) => (
            <option key={d.index} value={d.index}>
              [{d.index}] {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* App audio toggle */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted font-mono whitespace-nowrap">🔊 App Audio</label>
        <button
          disabled={disabled}
          onClick={() => setUseWasapi(!useWasapi)}
          className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
            useWasapi
              ? "bg-accent text-white"
              : "bg-panel border border-border text-muted hover:text-white"
          } disabled:opacity-40`}
        >
          {useWasapi ? "ON" : "OFF"}
        </button>
      </div>

      {/* Active audio apps */}
      {useWasapi && appsWithVolume.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted font-mono">Capturing:</span>
          {appsWithVolume.map((app) => (
            <span
              key={app.pid}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-panel border border-border text-xs text-white"
              title={`PID: ${app.pid} | Volume: ${Math.round(app.volume * 100)}%`}
            >
              <AppIcon name={app.name} />
              <span className="truncate max-w-[100px]">{app.name}</span>
              {app.muted ? (
                <span className="text-yellow-400">🔇</span>
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
              )}
            </span>
          ))}
        </div>
      )}

      {useWasapi && appsWithVolume.length === 0 && (
        <span className="text-xs text-muted font-mono italic">
          Play audio in any app to detect it
        </span>
      )}

      {!useWasapi && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted font-mono whitespace-nowrap">System Audio</label>
          <select
            disabled={disabled}
            value={selectedLoopbackDevice ?? ""}
            onChange={(e) =>
              setSelectedLoopback(e.target.value === "" ? null : Number(e.target.value))
            }
            className="bg-panel border border-border rounded px-3 py-1.5 text-xs text-white font-mono
                       focus:outline-none focus:border-accent disabled:opacity-40 w-48 truncate"
          >
            <option value="">None</option>
            {devices
              .filter((d) => d.outputs > 0)
              .map((d) => (
                <option key={d.index} value={d.index}>
                  [{d.index}] {d.name}
                </option>
              ))}
          </select>
        </div>
      )}
    </div>
  );
}
