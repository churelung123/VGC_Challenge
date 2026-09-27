import { NextRequest } from 'next/server';
import { getCustomBackground } from '@/src/serverless/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await context.params;
    if (!userId) {
      return new Response('User ID missing', { status: 400 });
    }

    const bg = await getCustomBackground(userId);
    if (!bg || !bg.imageData) {
      return new Response('Background not found', { status: 404 });
    }

    const buffer = Buffer.from(bg.imageData, 'base64');
    return new Response(buffer, {
      headers: {
        'Content-Type': bg.mimeType || 'image/png',
        'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Error fetching custom background:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
