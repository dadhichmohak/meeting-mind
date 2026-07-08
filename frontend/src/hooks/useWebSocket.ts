import { useEffect, useRef } from "react";
import { useMeetingStore } from "../store/meetingStore";
import type { TranscriptSegment } from "../types/meeting";

const INITIAL_DELAY = 1000;
const MAX_DELAY = 30000;

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(INITIAL_DELAY);
  const { addSegment, setStatus, setError, status } = useMeetingStore();

  useEffect(() => {
    let alive = true;

    function connect() {
      if (!alive) return;

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${proto}//${window.location.host}/ws`;

      const socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        console.log("[WS] connected");
        setError(null);
        delayRef.current = INITIAL_DELAY;
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
        console.warn("[WS] error");
      };

      socket.onclose = () => {
        if (alive) {
          console.log(`[WS] reconnecting in ${delayRef.current}ms`);
          reconnectTimer.current = setTimeout(connect, delayRef.current);
          delayRef.current = Math.min(delayRef.current * 2, MAX_DELAY);
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