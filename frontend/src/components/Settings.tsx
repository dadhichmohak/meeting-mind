import { useState } from "react";
import { usePreferences } from "../store/usePreferences";
import { LANGUAGES } from "../store/meetingStore";

interface SettingsProps {
  onClose: () => void;
}

export function Settings({ onClose }: SettingsProps) {
  const prefs = usePreferences();
  const [apiKey, setApiKey] = useState(prefs.groqApiKey);
  const [transLang, setTransLang] = useState(prefs.transcriptionLang);
  const [summLang, setSummLang] = useState(prefs.summaryLang);
  const [wasapi, setWasapi] = useState(prefs.useWasapi);
  const [showKey, setShowKey] = useState(false);

  const save = () => {
    prefs.setGroqApiKey(apiKey);
    prefs.setTranscriptionLang(transLang);
    prefs.setSummaryLang(summLang);
    prefs.setUseWasapi(wasapi);
    onClose();
  };

  const langs = LANGUAGES.filter(l => l.code !== "auto");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[480px] max-h-[80vh] rounded-[28px] theme-surface theme-border border overflow-hidden animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5">
          <h2 className="text-[18px] font-serif theme-text" style={{ fontWeight: 500 }}>Settings</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl theme-text-muted hover:theme-text hover:theme-surface-hover transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 pb-6 space-y-6 overflow-y-auto max-h-[calc(80vh-80px)]">
          {/* Groq API Key */}
          <div>
            <label className="text-[11px] font-semibold theme-text-muted uppercase tracking-wider block mb-2">
              Groq API Key
            </label>
            <p className="text-[12px] theme-text-muted mb-3">
              Get yours at{" "}
              <a href="https://console.groq.com/keys" target="_blank" rel="noopener" className="theme-accent hover:underline">
                console.groq.com/keys
              </a>
            </p>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="gsk_..."
                className="w-full bg-transparent border theme-border rounded-2xl px-4 py-3 pr-12 text-[14px] font-mono theme-text theme-text-placeholder focus:outline-none focus:border-accent transition-colors"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg theme-text-muted hover:theme-text hover:theme-surface-hover transition-colors"
              >
                {showKey ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Transcription Language */}
          <div>
            <label className="text-[11px] font-semibold theme-text-muted uppercase tracking-wider block mb-2">
              Transcription Language
            </label>
            <p className="text-[12px] theme-text-muted mb-3">
              Language used for speech-to-text conversion
            </p>
            <div className="grid grid-cols-2 gap-2">
              {langs.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setTransLang(l.code)}
                  className={`px-3 py-2 rounded-xl text-[13px] transition-all border ${
                    transLang === l.code
                      ? "theme-accent theme-border font-medium"
                      : "theme-text-secondary theme-border hover:theme-surface-hover"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary Language */}
          <div>
            <label className="text-[11px] font-semibold theme-text-muted uppercase tracking-wider block mb-2">
              Summary Language
            </label>
            <p className="text-[12px] theme-text-muted mb-3">
              Language for AI-generated summaries
            </p>
            <div className="grid grid-cols-2 gap-2">
              {langs.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setSummLang(l.code)}
                  className={`px-3 py-2 rounded-xl text-[13px] transition-all border ${
                    summLang === l.code
                      ? "theme-accent theme-border font-medium"
                      : "theme-text-secondary theme-border hover:theme-surface-hover"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* WASAPI */}
          <div>
            <label className="text-[11px] font-semibold theme-text-muted uppercase tracking-wider block mb-2">
              System Audio Capture
            </label>
            <p className="text-[12px] theme-text-muted mb-3">
              Capture system audio (e.g. Zoom, Teams) via WASAPI loopback
            </p>
            <button
              onClick={() => setWasapi(!wasapi)}
              className={`relative w-12 h-6 rounded-full transition-colors ${wasapi ? "theme-accent-bg" : "theme-border"}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full theme-surface transition-transform ${wasapi ? "translate-x-6" : ""}`} />
            </button>
          </div>

          {/* Save */}
          <button
            onClick={save}
            className="w-full py-3 rounded-2xl theme-accent-bg text-white text-[14px] font-semibold hover:opacity-90 transition-opacity"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
