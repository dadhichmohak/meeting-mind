import { useEffect, useRef } from "react";
import { useMeetingStore } from "../store/meetingStore";
import type { TranscriptSegment } from "../types/meeting";

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { addSegment, setStatus, setError, status } = useMeetingStore();

  useEffect(() => {
    let alive = true;

    function connect() {
      if (!alive) return;

      // Use current host so Vite proxy handles routing
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${proto}//${window.location.host}/ws`;

      const socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        console.log("[WS] connected");
        setError(null);
      };

      socket.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "transcript") {
            addSegment(msg.data as TranscriptSegment);
          } else if (msg.type === "status") {
            if (msg.status === "recording") setStatus("recording");
            if (msg.status === "stopped") setStatus("idle");
          }
        } catch {
          // ignore
        }
      };

      socket.onerror = () => {
        console.warn("[WS] error — will reconnect");
      };

      socket.onclose = () => {
        if (alive) {
          reconnectTimer.current = setTimeout(connect, 2000);
        }
      };
    }

    connect();

    return () => {
      alive = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, []);
}