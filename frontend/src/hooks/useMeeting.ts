import { useCallback, useEffect, useRef } from "react";
import { useMeetingStore } from "../store/meetingStore";

const API = "http://127.0.0.1:8765";

export function useMeeting() {
  const store = useMeetingStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const r = await fetch(`${API}/meetings/devices`);
      const d = await r.json();
      store.setDevices(d.devices);
      if (d.apps) store.setAudioApps(d.apps);
    } catch {
      store.setError("Cannot reach backend — is it running?");
    }
  }, []);

  const refreshApps = useCallback(async () => {
    try {
      const r = await fetch(`${API}/meetings/devices`);
      const d = await r.json();
      if (d.apps) store.setAudioApps(d.apps);
    } catch {
      // silently fail
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
          loopback_device: store.selectedLoopbackDevice,
          enable_loopback: store.useWasapi,
          use_wasapi: store.useWasapi,
          model_size: "base",
          language: "en",
          vad_enabled: true,
        }),
      });
      const d = await r.json();
      if (d.error) {
        // If meeting already active, try to reset first
        if (d.error === "Meeting already active") {
          await fetch(`${API}/meetings/reset`, { method: "POST" });
          // Retry once
          const r2 = await fetch(`${API}/meetings/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mic_device: store.selectedMicDevice,
              loopback_device: store.selectedLoopbackDevice,
              enable_loopback: store.useWasapi,
              use_wasapi: store.useWasapi,
              model_size: "base",
              language: "en",
              vad_enabled: true,
            }),
          });
          const d2 = await r2.json();
          if (d2.error) {
            store.setError(d2.error);
            store.setStatus("error");
            return;
          }
          store.setMeetingId(d2.meeting_id);
          store.setStatus("recording");
        } else {
          store.setError(d.error);
          store.setStatus("error");
          return;
        }
      } else {
        store.setMeetingId(d.meeting_id);
        store.setStatus("recording");
      }

      timerRef.current = setInterval(() => {
        store.setDuration((useMeetingStore.getState().duration || 0) + 1);
      }, 1000);

      // Refresh app list every 2s while recording
      appsTimerRef.current = setInterval(refreshApps, 2000);
    } catch {
      store.setError("Failed to start meeting");
      store.setStatus("error");
    }
  }, [store.selectedMicDevice, store.selectedLoopbackDevice, store.useWasapi]);

  const stopMeeting = useCallback(async () => {
    store.setStatus("stopping");
    if (timerRef.current) clearInterval(timerRef.current);
    if (appsTimerRef.current) clearInterval(appsTimerRef.current);
    try {
      const r = await fetch(`${API}/meetings/stop`, { method: "POST" });
      const result = await r.json();
      
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
      if (appsTimerRef.current) clearInterval(appsTimerRef.current);
    };
  }, []);

  return { startMeeting, stopMeeting, fetchDevices };
}
