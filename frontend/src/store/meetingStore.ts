import { create } from "zustand";
import type { TranscriptSegment, AudioDevice, AppStatus } from "../types/meeting";

export interface AudioApp {
  pid: number;
  name: string;
  volume: number;
  muted: boolean;
  peak: number;
}

interface MeetingStore {
  status: AppStatus;
  meetingId: string | null;
  segments: TranscriptSegment[];
  devices: AudioDevice[];
  audioApps: AudioApp[];
  selectedMicDevice: number | null;
  selectedLoopbackDevice: number | null;
  useWasapi: boolean;
  duration: number;
  error: string | null;
  language: string;
  summarizationLanguage: string;

  setStatus: (s: AppStatus) => void;
  setMeetingId: (id: string | null) => void;
  addSegment: (seg: TranscriptSegment) => void;
  setDevices: (d: AudioDevice[]) => void;
  setAudioApps: (a: AudioApp[]) => void;
  setSelectedMic: (i: number | null) => void;
  setSelectedLoopback: (i: number | null) => void;
  setUseWasapi: (b: boolean) => void;
  setDuration: (d: number) => void;
  setError: (e: string | null) => void;
  setLanguage: (l: string) => void;
  setSummarizationLanguage: (l: string) => void;
  reset: () => void;
}

export const LANGUAGES = [
  { code: "auto", label: "Auto-detect" },
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "hi-en", label: "Hinglish" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
  { code: "ru", label: "Russian" },
];

export const useMeetingStore = create<MeetingStore>((set) => ({
  status: "idle",
  meetingId: null,
  segments: [],
  devices: [],
  audioApps: [],
  selectedMicDevice: null,
  selectedLoopbackDevice: null,
  useWasapi: true,
  duration: 0,
  error: null,
  language: "en",
  summarizationLanguage: "en",

  setStatus: (status) => set({ status }),
  setMeetingId: (meetingId) => set({ meetingId }),
  addSegment: (seg) => set((s) => ({ segments: [...s.segments, seg] })),
  setDevices: (devices) => set({ devices }),
  setAudioApps: (audioApps) => set({ audioApps }),
  setSelectedMic: (selectedMicDevice) => set({ selectedMicDevice }),
  setSelectedLoopback: (selectedLoopbackDevice) => set({ selectedLoopbackDevice }),
  setUseWasapi: (useWasapi) => set({ useWasapi }),
  setDuration: (duration) => set({ duration }),
  setError: (error) => set({ error }),
  setLanguage: (language) => set({ language }),
  setSummarizationLanguage: (summarizationLanguage) => set({ summarizationLanguage }),
  reset: () =>
    set({ status: "idle", meetingId: null, segments: [], duration: 0, error: null }),
}));
