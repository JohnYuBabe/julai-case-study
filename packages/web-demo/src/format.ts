const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});

const timeFormat = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const fullFormat = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function sameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function formatDateTime(iso: string): string {
  return fullFormat.format(new Date(iso));
}

export function formatDateWithTime(iso: string): string {
  const date = new Date(iso);
  return `${dateFormat.format(date)} ${timeFormat.format(date)}`;
}

/** 「10月24日 周六 19:00–21:00」，跨天时两端都写日期。 */
export function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);

  if (sameDay(start, end)) {
    return `${dateFormat.format(start)} ${timeFormat.format(start)}–${timeFormat.format(end)}`;
  }

  return `${formatDateWithTime(startIso)} – ${formatDateWithTime(endIso)}`;
}
