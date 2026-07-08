import { useCallback, useEffect, useRef } from "react";
import { useMeetingStore } from "../store/meetingStore";
import { usePreferences } from "../store/usePreferences";
import { apiUrl } from "../config";

export function useMeeting() {
  const store = useMeetingStore();
  const prefs = usePreferences();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/meetings/devices"));
      const d = await r.json();
      store.setDevices(d.devices);
      if (d.apps) store.setAudioApps(d.apps);
    } catch {
      store.setError("Cannot reach backend");
    }
  }, []);

  const refreshApps = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/meetings/devices"));
      const d = await r.json();
      if (d.apps) store.setAudioApps(d.apps);
    } catch { /* silently fail */ }
  }, []);

  const startMeeting = useCallback(async (overrides?: { enable_loopback?: boolean; use_wasapi?: boolean; mic_device?: number; title?: string }) => {
    store.setStatus("loading");
    store.setError(null);
    try {
      const enableLoopback = overrides?.enable_loopback ?? prefs.useWasapi;
      const body = {
        title: overrides?.title || undefined,
        mic_device: overrides?.mic_device ?? store.selectedMicDevice,
        loopback_device: store.selectedLoopbackDevice,
        enable_loopback: enableLoopback,
        use_wasapi: overrides?.use_wasapi ?? prefs.useWasapi,
        model_size: "base",
        language: prefs.transcriptionLang,
        summary_language: prefs.summaryLang,
        groq_api_key: prefs.groqApiKey || undefined,
      };
      const r = await fetch(apiUrl("/meetings/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.error) {
        if (d.error === "Meeting already active") {
          await fetch(apiUrl("/meetings/reset"), { method: "POST" });
          const r2 = await fetch(apiUrl("/meetings/start"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
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
      appsTimerRef.current = setInterval(refreshApps, 2000);
    } catch {
      store.setError("Failed to start meeting");
      store.setStatus("error");
    }
  }, [store.selectedMicDevice, store.selectedLoopbackDevice, prefs]);

  const stopMeeting = useCallback(async () => {
    store.setStatus("stopping");
    if (timerRef.current) clearInterval(timerRef.current);
    if (appsTimerRef.current) clearInterval(appsTimerRef.current);
    try {
      const r = await fetch(apiUrl("/meetings/stop"), { method: "POST" });
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
