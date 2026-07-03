import { useWebSocket } from "./hooks/useWebSocket";
import { Header } from "./components/Header";
import { Controls } from "./components/Controls";
import { LiveTranscript } from "./components/LiveTranscript";
import { StatusBar } from "./components/StatusBar";

export default function App() {
  useWebSocket(); // connect and keep alive

  return (
    <div className="h-screen flex flex-col bg-surface">
      <Header />
      <Controls />
      <LiveTranscript />
      <StatusBar />
    </div>
  );
}