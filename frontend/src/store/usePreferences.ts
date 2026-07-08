import { create } from "zustand";

interface Preferences {
  groqApiKey: string;
  transcriptionLang: string;
  summaryLang: string;
  useWasapi: boolean;

  setGroqApiKey: (key: string) => void;
  setTranscriptionLang: (lang: string) => void;
  setSummaryLang: (lang: string) => void;
  setUseWasapi: (v: boolean) => void;
}

const STORAGE_KEY = "meeting-mind-prefs";

function load(): Partial<Preferences> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(state: Partial<Preferences>) {
  try {
    const { groqApiKey, transcriptionLang, summaryLang, useWasapi } = state as any;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ groqApiKey, transcriptionLang, summaryLang, useWasapi }));
  } catch { /* silently fail */ }
}

const saved = load();

export const usePreferences = create<Preferences>((set, get) => ({
  groqApiKey: saved.groqApiKey || "",
  transcriptionLang: saved.transcriptionLang || "en",
  summaryLang: saved.summaryLang || "en",
  useWasapi: saved.useWasapi ?? true,

  setGroqApiKey: (groqApiKey) => {
    set({ groqApiKey });
    save({ ...get(), groqApiKey });
  },
  setTranscriptionLang: (transcriptionLang) => {
    set({ transcriptionLang });
    save({ ...get(), transcriptionLang });
  },
  setSummaryLang: (summaryLang) => {
    set({ summaryLang });
    save({ ...get(), summaryLang });
  },
  setUseWasapi: (useWasapi) => {
    set({ useWasapi });
    save({ ...get(), useWasapi });
  },
}));
