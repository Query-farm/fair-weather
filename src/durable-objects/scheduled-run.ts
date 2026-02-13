import { DurableObject } from 'cloudflare:workers';
import { fetchForecast } from '../lib/weather';
import { computeScoreForHour, findBestAlternative } from '../lib/scoring';
import { sendDeteriorationEmail } from '../lib/email';
import type { Mode } from '../lib/scoring';

interface EventRow {
  id: string;
  email: string;
  mode: Mode;
  scheduled_time: string;
  duration_minutes: number;
  lat: number;
  lon: number;
  tz: string;
  location_name: string;
  initial_score: number;
  alert_sent: number; // 0 or 1
  resend_api_key: string;
}

interface Env {
  SCHEDULED_RUN: DurableObjectNamespace;
  RESEND_API_KEY?: string;
}

export class ScheduledRun extends DurableObject<Env> {
  private initialized = false;

  private ensureTable() {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS event (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        mode TEXT NOT NULL,
        scheduled_time TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        tz TEXT NOT NULL,
        location_name TEXT NOT NULL,
        initial_score REAL NOT NULL,
        alert_sent INTEGER NOT NULL DEFAULT 0,
        resend_api_key TEXT NOT NULL DEFAULT ''
      )
    `);
  }

  private getEvent(): EventRow | null {
    this.ensureTable();
    const cursor = this.ctx.storage.sql.exec('SELECT * FROM event LIMIT 1');
    const rows = [...cursor];
    if (rows.length === 0) return null;
    return rows[0] as unknown as EventRow;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/initialize' && request.method === 'POST') {
      return this.handleInitialize(request);
    }

    if (url.pathname === '/status' && request.method === 'GET') {
      return this.handleStatus();
    }

    return new Response('Not found', { status: 404 });
  }

  private async handleInitialize(request: Request): Promise<Response> {
    const body = await request.json() as {
      id: string;
      email: string;
      mode: Mode;
      scheduledTime: string;
      durationMinutes: number;
      lat: number;
      lon: number;
      tz: string;
      locationName: string;
      initialScore: number;
      resendApiKey: string;
    };

    this.ensureTable();

    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO event (id, email, mode, scheduled_time, duration_minutes, lat, lon, tz, location_name, initial_score, alert_sent, resend_api_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      body.id,
      body.email,
      body.mode,
      body.scheduledTime,
      body.durationMinutes,
      body.lat,
      body.lon,
      body.tz,
      body.locationName,
      body.initialScore,
      body.resendApiKey,
    );

    // Schedule first alarm: 1 hour from now or 2 hours before event, whichever is sooner
    const eventTime = new Date(body.scheduledTime).getTime();
    const oneHourFromNow = Date.now() + 60 * 60 * 1000;
    const twoHoursBefore = eventTime - 2 * 60 * 60 * 1000;
    const firstAlarm = Math.min(oneHourFromNow, Math.max(twoHoursBefore, Date.now() + 60 * 1000));

    await this.ctx.storage.setAlarm(firstAlarm);

    return Response.json({ ok: true });
  }

  private handleStatus(): Response {
    const event = this.getEvent();
    if (!event) return new Response('No event', { status: 404 });
    return Response.json({
      id: event.id,
      email: event.email,
      mode: event.mode,
      scheduledTime: event.scheduled_time,
      durationMinutes: event.duration_minutes,
      lat: event.lat,
      lon: event.lon,
      tz: event.tz,
      locationName: event.location_name,
      initialScore: event.initial_score,
      alertSent: event.alert_sent === 1,
    });
  }

  async alarm(): Promise<void> {
    const event = this.getEvent();
    if (!event) return;

    const eventTime = new Date(event.scheduled_time).getTime();
    const now = Date.now();

    // Event has passed — self-clean
    if (now > eventTime) {
      this.ctx.storage.sql.exec('DELETE FROM event');
      await this.ctx.storage.deleteAll();
      return;
    }

    // Fetch current forecast and compute score
    try {
      const forecast = await fetchForecast(event.lat, event.lon, event.tz, 2);
      const currentScore = computeScoreForHour(forecast, event.scheduled_time, event.mode as Mode);
      const scoreDrop = event.initial_score - currentScore;

      // Deterioration: 15+ point drop, alert not yet sent
      if (scoreDrop >= 15 && event.alert_sent === 0 && event.resend_api_key) {
        const alternative = findBestAlternative(forecast, event.scheduled_time, event.mode as Mode);

        await sendDeteriorationEmail({
          email: event.email,
          mode: event.mode as Mode,
          scheduledTime: event.scheduled_time,
          durationMinutes: event.duration_minutes,
          locationName: event.location_name,
          initialScore: event.initial_score,
          currentScore,
          alternative,
        }, event.resend_api_key);

        this.ctx.storage.sql.exec('UPDATE event SET alert_sent = 1');
      }
    } catch (e) {
      console.error('Alarm error:', e);
    }

    // Schedule next alarm in 30 minutes (if event hasn't passed)
    const nextAlarm = now + 30 * 60 * 1000;
    if (nextAlarm < eventTime) {
      await this.ctx.storage.setAlarm(nextAlarm);
    }
  }
}
