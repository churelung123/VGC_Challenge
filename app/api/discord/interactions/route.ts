import {after} from 'next/server';
import {verifyKey} from 'discord-interactions';
import {discordPublicKey} from '@/src/serverless/env';
import {initialResponse, processInteraction, handleAutocompleteResponse} from '@/src/serverless/interactions';
import type {DiscordInteraction} from '@/src/serverless/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  
  // Đọc body dạng raw buffer để tránh bị lệch ký tự/encoding
  const buffer = await request.clone().arrayBuffer();
  const body = Buffer.from(buffer).toString('utf-8');

  if (!signature || !timestamp || !await verifyKey(body, signature, timestamp, discordPublicKey())) {
    return new Response('Invalid request signature', {status: 401});
  }

  const interaction = JSON.parse(body) as DiscordInteraction;
  if (interaction.type === 1) return Response.json({type: 1});
  if (interaction.type === 4) return Response.json(await handleAutocompleteResponse(interaction));

  const response = initialResponse(interaction);
  after(() => processInteraction(interaction));
  return Response.json(response);
}

export function GET(): Response {
  return Response.json({ok: true, service: 'Ryusei Bot Discord Interactions'});
}