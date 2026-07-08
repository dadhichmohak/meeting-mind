import { create } from "zustand";

interface Preferences {
  groqApiKey: string;
  transcriptionLang: string;
  summaryLang: string;
  useWasapi: boolean;
  sttEngine: string;

  setGroqApiKey: (key: string) => void;
  setTranscriptionLang: (lang: string) => void;
  setSummaryLang: (lang: string) => void;
  setUseWasapi: (v: boolean) => void;
  setSttEngine: (engine: string) => void;
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
    const { groqApiKey, transcriptionLang, summaryLang, useWasapi, sttEngine } = state as any;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ groqApiKey, transcriptionLang, summaryLang, useWasapi, sttEngine }));
  } catch { /* silently fail */ }
}

const saved = load();

export const usePreferences = create<Preferences>((set, get) => ({
  groqApiKey: saved.groqApiKey || "",
  transcriptionLang: saved.transcriptionLang || "en",
  summaryLang: saved.summaryLang || "en",
  useWasapi: saved.useWasapi ?? true,
  sttEngine: saved.sttEngine || "groq",

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
  setSttEngine: (sttEngine) => {
    set({ sttEngine });
    save({ ...get(), sttEngine });
  },
}));
