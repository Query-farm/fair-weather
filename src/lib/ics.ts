export interface ICSEvent {
  title: string;
  startTime: string; // ISO 8601
  durationMinutes: number;
  description?: string;
  location?: string;
}

function formatICSDate(iso: string): string {
  // Convert to YYYYMMDDTHHMMSSZ (UTC)
  const d = new Date(iso);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function addMinutes(iso: string, minutes: number): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

export function generateICS(event: ICSEvent): string {
  const uid = crypto.randomUUID() + '@run-planner';
  const dtStart = formatICSDate(event.startTime);
  const dtEnd = formatICSDate(addMinutes(event.startTime, event.durationMinutes));
  const now = formatICSDate(new Date().toISOString());
  const description = (event.description || '').replace(/\n/g, '\\n');
  const location = event.location || '';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Run Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Starting soon',
    'END:VALARM',
    'BEGIN:VALARM',
    `TRIGGER:PT${event.durationMinutes}M`,
    'ACTION:DISPLAY',
    `DESCRIPTION:Time to finish your ${event.title.toLowerCase()}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
