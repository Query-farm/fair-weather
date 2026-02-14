import { ScheduledRun } from './durable-objects/scheduled-run';
import { fetchForecast } from './lib/weather';
import { computeScoreForHour } from './lib/scoring';
import { generateICS } from './lib/ics';

export { ScheduledRun };

interface Env {
  SCHEDULED_RUN: DurableObjectNamespace;
  RESEND_API_KEY?: string;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // POST /api/schedule
    if (url.pathname === '/api/schedule' && request.method === 'POST') {
      return handleSchedule(request, env);
    }

    // GET /api/schedule/:id/ics
    const icsMatch = url.pathname.match(/^\/api\/schedule\/([^/]+)\/ics$/);
    if (icsMatch && request.method === 'GET') {
      return handleGetICS(icsMatch[1], env);
    }

    // GET /api/schedule/:id
    const statusMatch = url.pathname.match(/^\/api\/schedule\/([^/]+)$/);
    if (statusMatch && request.method === 'GET') {
      return handleGetStatus(statusMatch[1], env);
    }

    // Everything else → static assets
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleSchedule(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as {
      email: string;
      mode: 'running' | 'walking' | 'cycling';
      scheduledTime: string;
      durationMinutes: number;
      lat: number;
      lon: number;
      tz: string;
      locationName: string;
    };

    const { email, mode, scheduledTime, durationMinutes, lat, lon, tz, locationName } = body;

    if (!email || !scheduledTime || !lat || !lon || !tz) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Fetch forecast and compute initial score
    const forecast = await fetchForecast(lat, lon, tz, 2);
    const initialScore = computeScoreForHour(forecast, scheduledTime, mode);

    // Create DO instance
    const id = crypto.randomUUID();
    const doId = env.SCHEDULED_RUN.idFromName(id);
    const stub = env.SCHEDULED_RUN.get(doId);

    // Initialize the DO
    await stub.fetch(new Request('https://do/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        email,
        mode,
        scheduledTime,
        durationMinutes,
        lat,
        lon,
        tz,
        locationName,
        initialScore,
        resendApiKey: env.RESEND_API_KEY || '',
      }),
    }));

    return Response.json({ id, initialScore });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

async function handleGetICS(id: string, env: Env): Promise<Response> {
  try {
    const doId = env.SCHEDULED_RUN.idFromName(id);
    const stub = env.SCHEDULED_RUN.get(doId);
    const resp = await stub.fetch(new Request('https://do/status'));
    if (!resp.ok) return Response.json({ error: 'Event not found' }, { status: 404 });

    const event = await resp.json() as any;
    const ics = generateICS({
      title: `${event.mode === 'running' ? 'Run' : event.mode === 'cycling' ? 'Ride' : 'Walk'} — ${event.locationName}`,
      startTime: event.scheduledTime,
      durationMinutes: event.durationMinutes,
      description: `Score: ${event.initialScore}/100`,
      location: event.locationName,
    });

    return new Response(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="run-planner-${id.slice(0, 8)}.ics"`,
      },
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

async function handleGetStatus(id: string, env: Env): Promise<Response> {
  try {
    const doId = env.SCHEDULED_RUN.idFromName(id);
    const stub = env.SCHEDULED_RUN.get(doId);
    const resp = await stub.fetch(new Request('https://do/status'));
    if (!resp.ok) return Response.json({ error: 'Event not found' }, { status: 404 });
    const data = await resp.json();
    return Response.json(data);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
