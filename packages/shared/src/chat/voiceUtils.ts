/** Format milliseconds as m:ss for voice message UI (shared by customer + worker chat). */
export function formatAudioTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Parse duration stored in message body as plain milliseconds string. */
export function parseVoiceDurationMs(body: string | null | undefined): number {
  const t = (body ?? '').trim();
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    return n > 0 && n < 3600000 ? n : 0;
  }
  return 0;
}
