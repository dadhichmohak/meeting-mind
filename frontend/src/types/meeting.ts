export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
  speaker: string | null;
}

export interface AudioDevice {
  index: number;
  name: string;
  inputs: number;
  outputs: number;
  default_sr: number;
}

export interface MeetingStatus {
  active: boolean;
  meeting_id?: string;
  duration_seconds?: number;
  segment_count?: number;
}

export type AppStatus = "idle" | "loading" | "recording" | "stopping" | "error";