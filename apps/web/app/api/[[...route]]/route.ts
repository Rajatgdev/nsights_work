import { handle } from 'hono/vercel';
import { app } from '@/server/app';

// Hono mounted inside Next.js (spec §2). One deploy, same origin.
export const runtime = 'nodejs';

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
