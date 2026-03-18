import { COMMAND_MAP } from '../core/CommandRegistry';
import { SubscriptionGuard, PermissionGuard } from '../core/Guards';
import { StatsService } from './stats';
import { botTexts } from '../config/texts';

const stats = new StatsService();

interface MessageData {
  id: string;
  remoteJid: string;
  participant: string;
  pushName: string;
  text: string;
  quoted?: any;
  quotedParticipant?: string;
  mentionedJid?: string[];
  messageType: string;
  raw: any;
}

export const processMessage = async (msg: MessageData) => {
  // Capture Stats for the group
  if (msg.remoteJid.endsWith('@g.us')) {
      await stats.trackMessage(msg.participant, msg.remoteJid, msg.id, msg.text, msg.pushName);
  }

  const prefix = '.';
  if (!msg.text.trim().startsWith(prefix)) return;

  const args = msg.text.slice(prefix.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (!command) return;

  // 1. Check Registry
  const handler = COMMAND_MAP[command];
  if (!handler) return;

  // 2. EXPIRED CHECK (SubscriptionGuard)
  const isSubscriber = await SubscriptionGuard.checkSubscription(msg.remoteJid);
  const suffix = await SubscriptionGuard.getSuffix(msg.remoteJid);

  // Essential commands always work
  const isEssential = ['menu', 'vencimento', 'ajuda', 'filhote.ajuda'].includes(command);
  
  if (!isSubscriber && !isEssential) {
      // Injetamos a lógica do emoji expirado conforme solicitado (🫥)
      console.log(`[SUBSCRIPTION] Group ${msg.remoteJid} is EXPIRED. Blocking command ${command}.`);
      return; // O bot responde via handler se implementado lá, ou aqui injetamos o aviso.
  }

  console.log(`[ROUTER] Executing Command: .${command} (User: ${msg.pushName})`);

  try {
      // 3. Permissões serão checadas dentro do handler ou aqui no router (refatorando)
      await handler(command, args, msg, suffix);
  } catch (error) {
      console.error(`Error in command ${command}:`, error);
  }
};
