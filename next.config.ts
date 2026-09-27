import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['discord.js', '@discordjs/ws', '@discordjs/voice'],
};

export default nextConfig;
