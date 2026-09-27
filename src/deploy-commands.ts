import {REST, Routes} from 'discord.js';
import {commandsJson} from './commands';
import {config} from './config';

async function main(): Promise<void> {
  const rest = new REST({version: '10'}).setToken(config.token);
  const forceGlobal = process.argv.includes('--global');
  if (config.guildId && !forceGlobal) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {body: commandsJson});
    console.log(`Deployed ${commandsJson.length} guild commands to ${config.guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), {body: commandsJson});
    console.log(`Deployed ${commandsJson.length} global commands.`);

    // Guild commands override global commands and remain registered separately.
    // Remove the test-guild copy after a global release so Discord does not show
    // old/global and new/guild command sets together.
    if (config.guildId) {
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {body: []});
      console.log(`Cleared guild commands from ${config.guildId}.`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});