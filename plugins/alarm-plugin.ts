import { registerPlugin } from "@capacitor/core";

export interface AlarmPlugin {
  showFullScreenAlarm(options: { title: string; body: string }): Promise<void>;
  scheduleFullScreenExact(options: { id: number; at: number; title: string; body: string }): Promise<{ scheduled: boolean }>;
  cancelScheduled(options: { id: number }): Promise<{ canceled: boolean }>;
}

export const AlarmPlugin = registerPlugin<AlarmPlugin>("AlarmPlugin");
