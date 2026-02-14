import { generateICS } from './ics';

export interface DeteriorationData {
  email: string;
  mode: 'running' | 'walking' | 'cycling';
  scheduledTime: string;
  durationMinutes: number;
  locationName: string;
  initialScore: number;
  currentScore: number;
  alternative: { time: string; score: number } | null;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function ratingLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 65) return 'Good';
  if (score >= 45) return 'Fair';
  return 'Poor';
}

export async function sendDeteriorationEmail(data: DeteriorationData, apiKey: string): Promise<void> {
  const activity = data.mode === 'running' ? 'run' : data.mode === 'cycling' ? 'ride' : 'walk';
  const subject = `Weather alert: your ${activity} conditions have worsened`;

  let altSection = '';
  let attachments: { filename: string; content: string }[] = [];

  if (data.alternative) {
    const altTime = formatTime(data.alternative.time);
    altSection = `
<p><strong>Suggested alternative:</strong> ${altTime} — Score: ${data.alternative.score}/100 (${ratingLabel(data.alternative.score)})</p>
<p>An updated calendar invite is attached for the better time slot.</p>`;

    const ics = generateICS({
      title: `${data.mode === 'running' ? 'Run' : data.mode === 'cycling' ? 'Ride' : 'Walk'} — ${data.locationName}`,
      startTime: data.alternative.time,
      durationMinutes: data.durationMinutes,
      description: `Rescheduled: Score ${data.alternative.score}/100`,
      location: data.locationName,
    });
    attachments.push({
      filename: 'reschedule.ics',
      content: btoa(ics),
    });
  }

  const html = `
<div style="font-family: sans-serif; max-width: 500px;">
  <h2>Weather conditions have changed</h2>
  <p>Your scheduled ${activity} at <strong>${data.locationName}</strong> on <strong>${formatTime(data.scheduledTime)}</strong> has seen a weather change:</p>
  <table style="border-collapse: collapse; margin: 16px 0;">
    <tr>
      <td style="padding: 4px 12px; color: #666;">Original score</td>
      <td style="padding: 4px 12px; font-weight: bold;">${data.initialScore}/100 (${ratingLabel(data.initialScore)})</td>
    </tr>
    <tr>
      <td style="padding: 4px 12px; color: #666;">Current score</td>
      <td style="padding: 4px 12px; font-weight: bold; color: #e53e3e;">${data.currentScore}/100 (${ratingLabel(data.currentScore)})</td>
    </tr>
  </table>
  ${altSection}
  <p style="color: #666; font-size: 0.85em; margin-top: 24px;">— Run Planner</p>
</div>`;

  const payload: Record<string, any> = {
    from: 'Run Planner <onboarding@resend.dev>',
    to: [data.email],
    subject,
    html,
  };

  if (attachments.length > 0) {
    payload.attachments = attachments;
  }

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Resend API error: ${resp.status} ${text}`);
  }
}
