import { useEffect, useRef } from "react";
import { useMeetingStore } from "../store/meetingStore";
import type { TranscriptSegment } from "../types/meeting";

const WS_URL = "ws://127.0.0.1:8765/ws";

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const { addSegment, setStatus, setError } = useMeetingStore();

  useEffect(() => {
    function connect() {
      const socket = new WebSocket(WS_URL);
      ws.current = socket;

      socket.onopen = () => {
        console.log("[WS] connected");
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
          // ignore malformed messages
        }
      };

      socket.onerror = () => {
        setError("WebSocket connection failed");
      };

      socket.onclose = () => {
        // auto-reconnect after 2s
        setTimeout(connect, 2000);
      };
    }

    connect();
    return () => {
      ws.current?.close();
    };
  }, []);
}