/**
 * Signed file download (replaces S3 presigned GET). The token encodes the
 * storage key + expiry; we verify it, then stream the object from storage.
 */
import { NextResponse } from 'next/server';
import { getStorage } from '@nsights/shared';
import { verifyFileToken } from '@/server/signing';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const key = verifyFileToken(token);
  if (!key) return NextResponse.json({ error: 'invalid_or_expired' }, { status: 403 });

  const storage = getStorage();
  if (!(await storage.exists(key))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const bytes = await storage.get(key);
  const filename = key.split('/').pop() ?? 'download';
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
