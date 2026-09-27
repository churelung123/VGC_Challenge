function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường ${name}.`);
  return value;
}

export function discordToken(): string {
  return required('DISCORD_TOKEN');
}

export function discordPublicKey(): string {
  return required('DISCORD_PUBLIC_KEY');
}

export function databaseUrl(): string {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.SUPABASE_POSTGRES_URL_NON_POOLING,
    process.env.SUPABASE_DATABASE_URL,
    process.env.SUPABASE_POSTGRES_URL,
    process.env.POSTGRES_URL,
  ];

  const valid = candidates.find(url => url && url.trim() && !url.includes('[SENSITIVE]'));
  if (!valid) {
    throw new Error('Biến môi trường DATABASE_URL đang bị dán nhãn "[SENSITIVE]". Vui lòng dán chuỗi kết nối Postgres (postgresql://...) vào file .env');
  }

  return valid;
}

export function cronSecret(): string {
  return required('CRON_SECRET');
}

export function agentRouterApiKey(): string {
  return process.env.AGENTROUTER_API_KEY?.trim() || 'sk-jehoVxkhHlkM17AdSNAmGgdvOp0PJ1JsDcXGiRz5MpIMAlwn';
}

export function agentRouterBaseUrl(): string {
  return process.env.AGENTROUTER_BASE_URL?.trim() || 'https://agentrouter.org/v1';
}

export function agentRouterModel(): string {
  return process.env.AGENTROUTER_MODEL?.trim() || 'claude-opus-4-6';
}

export function allowedAiUserIds(): string[] {
  const val = process.env.ALLOWED_AI_USER_IDS?.trim();
  if (!val) return [];
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

