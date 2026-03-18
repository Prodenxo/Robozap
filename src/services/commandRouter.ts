import { handleGeneralCommands } from '../commands/general';
import { handleAICommands } from '../commands/ai';
import { handleUserCommands } from '../commands/user';
import { handleAdminCommands } from '../commands/admin';
import { handleFunCommands } from '../commands/fun';
import { handleSocialCommands } from '../commands/social';
import { handleMediaCommands } from '../commands/media';
import { StatsService } from './stats';

const stats = new StatsService();

interface MessageData {
  id: string;
  remoteJid: string;
  participant: string;
  pushName: string;
  text: string;
  quoted?: any;
  quotedParticipant?: string; // ADDED
  mentionedJid?: string[];   // ADDED
  messageType: string;
  raw: any;
}

export const processMessage = async (msg: MessageData) => {
  // Always track stats if it's a group
  if (msg.remoteJid.endsWith('@g.us')) {
    await stats.trackMessage(msg.participant, msg.remoteJid, msg.id, msg.text);
  }

  const prefix = '.';
  if (!msg.text.startsWith(prefix)) return;

  const args = msg.text.slice(prefix.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (!command) return;

  console.log(`[COMMAND] ${msg.pushName} (${msg.remoteJid}): ${command}`);

  // Route to handlers
  try {
    const handlers = [
      handleGeneralCommands,
      handleAICommands,
      handleUserCommands,
      handleAdminCommands,
      handleFunCommands,
      handleSocialCommands,
      handleMediaCommands
    ];

    for (const handler of handlers) {
      const handled = await handler(command, args, msg);
      if (handled) return;
    }

  } catch (error) {
    console.error(`Error processing command ${command}:`, error);
  }
};
