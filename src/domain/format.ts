export const MINUTE = 60_000;

export function fmtTime(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
    .format(ms)
    .replace(/\u202f/g, ' ');
}

export function fmtDay(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: tz,
  }).format(ms);
}

export function fmtDayTime(ms: number, tz: string): string {
  return `${fmtDay(ms, tz)}, ${fmtTime(ms, tz)}`;
}

export function fmtDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
