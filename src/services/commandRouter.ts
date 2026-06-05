import { COMMAND_MAP } from '../core/CommandRegistry';
import { SubscriptionGuard, PermissionGuard } from '../core/Guards';
import { prisma } from './database';
import { StatsService } from './stats';
import { botTexts } from '../config/texts';
import { WhatsAppService } from './whatsapp';

const stats = new StatsService();
const whatsapp = new WhatsAppService();

const processedMessageIds = new Map<string, number>();
const MESSAGE_DEDUPE_MS = 90_000;

function isDuplicateCommandMessage (messageId: string): boolean {
  const now = Date.now();
  const seenAt = processedMessageIds.get(messageId);
  if (seenAt && now - seenAt < MESSAGE_DEDUPE_MS) return true;
  processedMessageIds.set(messageId, now);
  return false;
}

interface MessageData {
  id: string;
  remoteJid: string;
  participant: string;
  pushName: string;
  text: string;
  quoted?: any;
  quotedId?: string;
  quotedParticipant?: string;
  mentionedJid?: string[];
  messageType: string;
  raw: any;
}

export const processMessage = async (msg: MessageData) => {
  // Resolve LID (ID gigante) para JID real
  msg.participant = await whatsapp.resolveJid(msg.participant);
  if (msg.quotedParticipant) {
    msg.quotedParticipant = await whatsapp.resolveJid(msg.quotedParticipant);
  }
  if (msg.mentionedJid && msg.mentionedJid.length > 0) {
    msg.mentionedJid = await Promise.all(
      msg.mentionedJid.map(async (jid) => await whatsapp.resolveJid(jid))
    );
  }

  // Capture Stats for the group
  if (msg.remoteJid.endsWith('@g.us')) {
      await stats.trackMessage(msg.participant, msg.remoteJid, msg.id, msg.text, msg.pushName);
  }

  const prefix = '.';
  if (!msg.text.trim().startsWith(prefix)) return;

  const args = msg.text.slice(prefix.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (!command) return;

  // 1.1. Guard do Modo Admin (Restringir bot apenas para administradores)
  const isGroup = msg.remoteJid.endsWith('@g.us');
  if (isGroup) {
    const group = await prisma.group.findUnique({
      where: { jid: msg.remoteJid }
    });
    if (group) {
      let currentSettings = group.settings ? (typeof group.settings === 'string' ? JSON.parse(group.settings) : group.settings) : {};
      if (currentSettings && currentSettings.adminMode === true) {
        const isEssential = ['menu', 'vencimento', 'ajuda', 'filhote.ajuda'].includes(command);
        if (!isEssential) {
          const hasPermission = await PermissionGuard.canExecute(msg.participant, msg.remoteJid, PermissionGuard.ROLES.ADM);
          if (!hasPermission) {
            console.log(`[ROUTER] Modo Admin ativo. Ignorando comando .${command} de não-admin: ${msg.participant}`);
            await whatsapp.sendMessage(msg.remoteJid, "⚠️ *Modo Admin Ativo:* Apenas administradores do grupo podem usar este bot no momento.");
            return;
          }
        }
      }
    }
  }

  if (isDuplicateCommandMessage(msg.id)) {
    console.log(`[ROUTER] Mensagem duplicada ignorada: ${msg.id}`);
    return;
  }

  // 1. Check Registry
  const handler = COMMAND_MAP[command];
  if (!handler) return;

  // 2. EXPIRED CHECK (SubscriptionGuard)
  const isSubscriber = await SubscriptionGuard.checkSubscription(msg.remoteJid);
  const suffix = await SubscriptionGuard.getSuffix(msg.remoteJid);

  // Essential commands always work
  const isEssential = ['menu', 'vencimento', 'ajuda', 'filhote.ajuda'].includes(command);
  
  if (!isSubscriber && !isEssential) {
      console.log(`[SUBSCRIPTION] ❌ Comando BLOQUEADO. Grupo ${msg.remoteJid} está EXPIRADO.`);
      await whatsapp.sendMessage(
        msg.remoteJid,
        botTexts.general.vencimentoExpirada + (suffix || ' 🫥')
      );
      return;
  }

  console.log(`[ROUTER] Executing Command: .${command} (User: ${msg.pushName})`);

  try {
      await handler(command, args, msg, suffix);
  } catch (error) {
      console.error(`Error in command ${command}:`, error);
      await whatsapp.sendMessage(
        msg.remoteJid,
        '💀 *Deu ruim aqui no sistema.* Tenta de novo em 1 minuto.'
      );
  }
};
