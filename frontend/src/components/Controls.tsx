import { useMeeting } from "../hooks/useMeeting";
import { useMeetingStore } from "../store/meetingStore";
import { DeviceSelector } from "./DeviceSelector";

export function Controls() {
  const { startMeeting, stopMeeting } = useMeeting();
  const { status, segments } = useMeetingStore();

  const isRecording = status === "recording";
  const isLoading = status === "loading" || status === "stopping";

  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border">
      <DeviceSelector />

      <div className="flex items-center gap-3">
        {!isRecording ? (
          <button
            onClick={startMeeting}
            disabled={isLoading}
            className="flex items-center gap-2 px-5 py-2 rounded-md bg-accent hover:bg-blue-500
                       text-white text-sm font-medium transition-colors disabled:opacity-40
                       disabled:cursor-not-allowed"
          >
            <span className="w-2 h-2 rounded-full bg-white" />
            {isLoading ? "Starting..." : "Start Recording"}
          </button>
        ) : (
          <button
            onClick={stopMeeting}
            disabled={isLoading}
            className="flex items-center gap-2 px-5 py-2 rounded-md bg-red-600 hover:bg-red-500
                       text-white text-sm font-medium transition-colors disabled:opacity-40"
          >
            <span className="w-2 h-2 rounded-sm bg-white" />
            {isLoading ? "Saving..." : "Stop & Save"}
          </button>
        )}
      </div>
    </div>
  );
}