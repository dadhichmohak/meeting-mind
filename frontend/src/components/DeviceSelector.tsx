import { useMeetingStore } from "../store/meetingStore";

export function DeviceSelector() {
  const { devices, selectedMicDevice, setSelectedMic, status } = useMeetingStore();
  const disabled = status === "recording" || status === "loading";

  const inputDevices = devices.filter((d) => d.inputs > 0);

  return (
    <div className="flex items-center gap-3">
      <label className="text-xs text-muted font-mono whitespace-nowrap">Mic Input</label>
      <select
        disabled={disabled}
        value={selectedMicDevice ?? ""}
        onChange={(e) =>
          setSelectedMic(e.target.value === "" ? null : Number(e.target.value))
        }
        className="bg-panel border border-border rounded px-3 py-1.5 text-xs text-white font-mono
                   focus:outline-none focus:border-accent disabled:opacity-40 w-64 truncate"
      >
        <option value="">Default microphone</option>
        {inputDevices.map((d) => (
          <option key={d.index} value={d.index}>
            [{d.index}] {d.name}
          </option>
        ))}
      </select>
    </div>
  );
}