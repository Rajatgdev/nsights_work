/**
 * PDF renderer service (Railway) — replaces the AWS Lambda in the spec.
 * Launches headless Chromium, loads /render/deck/:id?token= on the web app,
 * and returns the PDF bytes. The web app invokes this over the private Railway
 * network (PDF_RENDERER_URL).
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { chromium, type Browser } from 'playwright-core';

const app = new Hono();
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const PORT = Number(process.env.PORT ?? 8080);

let browser: Browser | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browser;
}

app.get('/health', (c) => c.json({ ok: true }));

// POST /render  { presentationId, token }  → application/pdf
app.post('/render', async (c) => {
  const { presentationId, token } = await c.req.json<{
    presentationId: string;
    token: string;
  }>();
  if (!presentationId || !token) return c.json({ error: 'bad_request' }, 400);

  const url = `${APP_URL}/render/deck/${presentationId}?token=${encodeURIComponent(token)}`;
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    const pdf = await page.pdf({
      width: '1280px',
      height: '720px',
      printBackground: true,
      pageRanges: '', // all pages
    });
    return new Response(new Uint8Array(pdf), {
      headers: { 'Content-Type': 'application/pdf' },
    });
  } finally {
    await page.close();
  }
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`nSights pdf-renderer on :${info.port} (app: ${APP_URL})`);
});

async function shutdown() {
  await browser?.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
