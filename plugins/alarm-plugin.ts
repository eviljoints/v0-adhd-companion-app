import { registerPlugin } from "@capacitor/core";

export interface AlarmPlugin {
  showFullScreenAlarm(options: { title: string; body: string }): Promise<void>;
}

export const AlarmPlugin = registerPlugin<AlarmPlugin>("AlarmPlugin");
