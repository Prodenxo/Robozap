import { WhatsAppService } from '../services/whatsapp';
import { botTexts } from '../config/texts';
import { PrismaClient } from '@prisma/client';

const whatsapp = new WhatsAppService();
const prisma = new PrismaClient();

export const handleAdminCommands = async (command: string, args: string[], msg: any) => {
  const isGroup = msg.remoteJid.endsWith('@g.us');
  if (!isGroup) return false;

  const targetJid = msg.quotedParticipant || msg.mentionedJid?.[0];
  
  if (['promover', 'banir', 'remover', 'demitir', 'rebaixar', 'adv'].includes(command)) {
      if (!targetJid) {
          await whatsapp.sendMessage(msg.remoteJid, "Pô, marca a pessoa (@pessoa) ou responde a mensagem de quem tu quer mexer!");
          return true;
      }
  }

  // FUNÇÃO DE MARCAÇÃO BONITA (Nome em vez de ID)
  const getMentionText = async (jid: string) => {
      const user = await prisma.user.findUnique({ where: { jid } });
      const identifier = user?.pushName || jid.split('@')[0];
      return `@${identifier}`;
  };

  switch (command) {
    case 'promover':
      const resolvedPromote = await whatsapp.groupUpdateParticipant(msg.remoteJid, 'promote', [targetJid]);
      const mentionTextPromote = await getMentionText(resolvedPromote);
      await whatsapp.sendMessage(msg.remoteJid, `👑 Cargo de patrão agora pra você: ${mentionTextPromote}!`, [resolvedPromote]);
      return true;

    case 'remover':
    case 'banir':
      const resolvedBan = await whatsapp.groupUpdateParticipant(msg.remoteJid, 'remove', [targetJid]);
      const mentionTextBan = await getMentionText(resolvedBan);
      await whatsapp.sendMessage(msg.remoteJid, `🧹 Varri o ${mentionTextBan} daqui. Sem massagem!`, [resolvedBan]);
      return true;

    case 'demitir':
    case 'rebaixar':
      const resolvedDemote = await whatsapp.groupUpdateParticipant(msg.remoteJid, 'demote', [targetJid]);
      const mentionTextDemote = await getMentionText(resolvedDemote);
      await whatsapp.sendMessage(msg.remoteJid, `📉 Perdeu o cargo, ${mentionTextDemote}! Volta pra base.`, [resolvedDemote]);
      return true;

    case 'adv':
      const mentionTextAdv = await getMentionText(targetJid);
      await whatsapp.sendMessage(msg.remoteJid, `⚠️ Atenção ${mentionTextAdv}, tu tomou uma advertência! Próxima é vala.`, [targetJid]);
      return true;

    default:
      return false;
  }
};
