import { useCallback, useEffect, useRef } from "react";
import { useMeetingStore } from "../store/meetingStore";

const API = "http://127.0.0.1:8765";

export function useMeeting() {
  const store = useMeetingStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const r = await fetch(`${API}/meetings/devices`);
      const d = await r.json();
      store.setDevices(d.devices);
    } catch {
      store.setError("Cannot reach backend — is it running?");
    }
  }, []);

  const startMeeting = useCallback(async () => {
    store.setStatus("loading");
    store.setError(null);
    try {
      const r = await fetch(`${API}/meetings/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mic_device: store.selectedMicDevice,
          model_size: "base",
          language: "en",
          vad_enabled: true,
        }),
      });
      const d = await r.json();
      if (d.error) {
        store.setError(d.error);
        store.setStatus("error");
        return;
      }
      store.setMeetingId(d.meeting_id);
      store.setStatus("recording");

      timerRef.current = setInterval(() => {
        store.setDuration((useMeetingStore.getState().duration || 0) + 1);
      }, 1000);
    } catch {
      store.setError("Failed to start meeting");
      store.setStatus("error");
    }
  }, [store.selectedMicDevice]);

  const stopMeeting = useCallback(async () => {
    store.setStatus("stopping");
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const r = await fetch(`${API}/meetings/stop`, { method: "POST" });
      const result = await r.json();
      
      // Emit analysis event so LiveTranscript can pick it up
      if (result.analysis) {
        window.dispatchEvent(
          new CustomEvent("meeting-stopped", { detail: { analysis: result.analysis } })
        );
      }
      
      store.setStatus("idle");
      store.setDuration(0);
      return result;
    } catch {
      store.setError("Failed to stop meeting");
      store.setStatus("error");
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return { startMeeting, stopMeeting, fetchDevices };
}