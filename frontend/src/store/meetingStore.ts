import { create } from "zustand";
import type { TranscriptSegment, AudioDevice, AppStatus } from "../types/meeting";

interface MeetingStore {
  status: AppStatus;
  meetingId: string | null;
  segments: TranscriptSegment[];
  devices: AudioDevice[];
  selectedMicDevice: number | null;
  duration: number;
  error: string | null;

  setStatus: (s: AppStatus) => void;
  setMeetingId: (id: string | null) => void;
  addSegment: (seg: TranscriptSegment) => void;
  setDevices: (d: AudioDevice[]) => void;
  setSelectedMic: (i: number | null) => void;
  setDuration: (d: number) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

export const useMeetingStore = create<MeetingStore>((set) => ({
  status: "idle",
  meetingId: null,
  segments: [],
  devices: [],
  selectedMicDevice: null,
  duration: 0,
  error: null,

  setStatus: (status) => set({ status }),
  setMeetingId: (meetingId) => set({ meetingId }),
  addSegment: (seg) => set((s) => ({ segments: [...s.segments, seg] })),
  setDevices: (devices) => set({ devices }),
  setSelectedMic: (selectedMicDevice) => set({ selectedMicDevice }),
  setDuration: (duration) => set({ duration }),
  setError: (error) => set({ error }),
  reset: () =>
    set({ status: "idle", meetingId: null, segments: [], duration: 0, error: null }),
}));