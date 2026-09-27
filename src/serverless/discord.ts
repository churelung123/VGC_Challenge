import {discordToken} from './env';
import type {DiscordPayload} from './types';

const API = 'https://discord.com/api/v10';
const MANAGE_CHANNELS = 1n << 4n;
const ADD_REACTIONS = 1n << 6n;
const VIEW_CHANNEL = 1n << 10n;
const SEND_MESSAGES = 1n << 11n;
const EMBED_LINKS = 1n << 14n;
const ATTACH_FILES = 1n << 15n;
const READ_MESSAGE_HISTORY = 1n << 16n;
const TICKET_MEMBER_ALLOW = (
  ADD_REACTIONS | VIEW_CHANNEL | SEND_MESSAGES | EMBED_LINKS | ATTACH_FILES | READ_MESSAGE_HISTORY
).toString();
const TICKET_BOT_ALLOW = (BigInt(TICKET_MEMBER_ALLOW) | MANAGE_CHANNELS).toString();

export function ticketPermissionOverwrites(input: {
  guildId: string;
  participantIds: string[];
  moderatorRoleIds: string[];
  botUserId: string;
}) {
  const roleIds = [...new Set(input.moderatorRoleIds)].filter(id => id !== input.guildId);
  const participantIds = [...new Set(input.participantIds)].filter(id => id !== input.botUserId);
  return [
    {id: input.guildId, type: 0, allow: '0', deny: VIEW_CHANNEL.toString()},
    ...roleIds.map(id => ({id, type: 0, allow: TICKET_MEMBER_ALLOW, deny: '0'})),
    ...participantIds.map(id => ({id, type: 1, allow: TICKET_MEMBER_ALLOW, deny: '0'})),
    {id: input.botUserId, type: 1, allow: TICKET_BOT_ALLOW, deny: '0'},
  ];
}

export type DiscordFile = {
  name: string;
  data: Buffer | ArrayBuffer | Uint8Array;
  contentType?: string;
};

export async function discordRequest(
  path: string,
  init: RequestInit = {},
  useBotToken = true,
  files?: DiscordFile[]
): Promise<Record<string, unknown>> {
  let headers: Record<string, string> = {
    ...(useBotToken ? {Authorization: `Bot ${discordToken()}`} : {}),
    ...((init.headers as Record<string, string>) || {}),
  };

  let body = init.body;

  if (files && files.length > 0) {
    const formData = new FormData();
    if (typeof body === 'string') {
      formData.append('payload_json', body);
    }
    files.forEach((file, index) => {
      const blob = new Blob([file.data as unknown as BlobPart], { type: file.contentType || 'application/octet-stream' });
      formData.append(`files[${index}]`, blob, file.name);
    });
    delete headers['Content-Type'];
    body = formData;
  } else if (!headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API}${path}`, {
    ...init,
    cache: 'no-store',
    headers,
    body,
  });
  const text = await response.text();
  let responseBody: Record<string, unknown> = {};
  if (text) {
    try {
      responseBody = JSON.parse(text) as Record<string, unknown>;
    } catch {
      responseBody = {message: text};
    }
  }
  if (!response.ok) {
    const message = typeof responseBody.message === 'string' ? responseBody.message : `Discord HTTP ${response.status}`;
    throw new Error(message);
  }
  return responseBody;
}

export function editInteractionReply(
  applicationId: string,
  interactionToken: string,
  payload: DiscordPayload,
  files?: DiscordFile[]
) {
  return discordRequest(`/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, false, files);
}

export function deleteInteractionReply(applicationId: string, interactionToken: string) {
  return discordRequest(`/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
    method: 'DELETE',
  }, false);
}

export function createFollowupMessage(
  applicationId: string,
  interactionToken: string,
  payload: DiscordPayload,
  files?: DiscordFile[]
) {
  return discordRequest(`/webhooks/${applicationId}/${interactionToken}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, false, files);
}

export function editChannelMessage(
  channelId: string,
  messageId: string,
  payload: DiscordPayload,
  files?: DiscordFile[]
) {
  return discordRequest(`/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, true, files);
}

export function createMessage(
  channelId: string,
  payload: DiscordPayload,
  files?: DiscordFile[]
) {
  return discordRequest(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, true, files);
}

export async function createDMChannel(recipientId: string): Promise<{ id: string }> {
  const body = await discordRequest('/users/@me/channels', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: recipientId }),
  });
  return body as { id: string };
}

export async function createMatchChannel(input: {
  guildId: string;
  sourceChannelId: string;
  name: string;
  participantIds: string[];
  moderatorRoleIds: string[];
  botUserId: string;
  categoryId?: string;
}): Promise<string> {
  const permissionOverwrites = ticketPermissionOverwrites(input);

  if (input.categoryId) {
    try {
      const channel = await discordRequest(`/guilds/${input.guildId}/channels`, {
        method: 'POST',
        body: JSON.stringify({
          name: input.name.slice(0, 100),
          type: 0,
          topic: 'Private ranked match managed by Ryusei Bot',
          parent_id: input.categoryId,
          permission_overwrites: permissionOverwrites,
        }),
      });
      if (channel?.id) return String(channel.id);
    } catch (err) {
      console.warn(`[createMatchChannel] Failed creating channel under category ${input.categoryId}, creating at root instead:`, err);
    }
  }

  const channel = await discordRequest(`/guilds/${input.guildId}/channels`, {
    method: 'POST',
    body: JSON.stringify({
      name: input.name.slice(0, 100),
      type: 0,
      topic: 'Private ranked match managed by Ryusei Bot',
      permission_overwrites: permissionOverwrites,
    }),
  });
  if (!channel?.id) throw new Error('Discord không trả về ID của match channel.');
  return String(channel.id);
}

export function deleteChannel(channelId: string, reason: string) {
  return discordRequest(`/channels/${channelId}`, {
    method: 'DELETE',
    headers: {'X-Audit-Log-Reason': encodeURIComponent(reason)},
  });
}

export async function ensureMatchChannelOpen(channelId: string): Promise<void> {
  const channel = await discordRequest(`/channels/${channelId}`).catch(() => undefined);
  const metadata = channel?.thread_metadata;
  if (!metadata || typeof metadata !== 'object' || !('archived' in metadata) || !metadata.archived) return;
  await discordRequest(`/channels/${channelId}`, {
    method: 'PATCH', body: JSON.stringify({archived: false}),
  }).then(() => undefined).catch(() => undefined);
}

export function deferredMessage(ephemeral: boolean) {
  return {type: 5, data: ephemeral ? {flags: 64} : {}};
}

export function deferredUpdate() {
  return {type: 6};
}

export function addGuildMemberRole(guildId: string, userId: string, roleId: string) {
  return discordRequest(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {method: 'PUT'});
}

export function removeGuildMemberRole(guildId: string, userId: string, roleId: string) {
  return discordRequest(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {method: 'DELETE'});
}

export function modifyGuildMemberNickname(guildId: string, userId: string, nick: string) {
  return discordRequest(`/guilds/${guildId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ nick }),
  });
}

export function deleteChannelMessage(channelId: string, messageId: string) {
  return discordRequest(`/channels/${channelId}/messages/${messageId}`, {
    method: 'DELETE',
  });
}
