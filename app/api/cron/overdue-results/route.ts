import {scanOverdueActions} from '@/src/serverless/interactions';
import {cronSecret} from '@/src/serverless/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  if (request.headers.get('authorization') !== `Bearer ${cronSecret()}`) {
    return new Response('Unauthorized', {status: 401});
  }
  const count = await scanOverdueActions();
  return Response.json({ok: true, escalatedMatches: count});
}
