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
      console.log(`[ADMIN COMMAND] ${command} | Target Found: ${targetJid}`);
  }

  // FUNÇÃO DE MARCAÇÃO BONITA (Nome em vez de ID)
  const getMention = async (jid: string) => {
      const user = await prisma.user.findUnique({ where: { jid } });
      const name = user?.pushName || jid.split('@')[0];
      return `@${name}`;
  };

  switch (command) {
    case 'promover':
      if (!targetJid) {
          await whatsapp.sendMessage(msg.remoteJid, "Pô, marca a pessoa (@pessoa) ou responde a mensagem de quem tu quer promover!");
          return true;
      }
      await whatsapp.groupUpdateParticipant(msg.remoteJid, 'promote', [targetJid]);
      const mentionPromote = await getMention(targetJid);
      await whatsapp.sendMessage(msg.remoteJid, `👑 Cargo de patrão agora pra você: ${mentionPromote}!`, [targetJid]);
      return true;

    case 'remover':
    case 'banir':
      if (!targetJid) {
          await whatsapp.sendMessage(msg.remoteJid, "Marca (@pessoa) ou responde a mensagem de quem tu quer varrer!");
          return true;
      }
      await whatsapp.groupUpdateParticipant(msg.remoteJid, 'remove', [targetJid]);
      const mentionBan = await getMention(targetJid);
      await whatsapp.sendMessage(msg.remoteJid, `🧹 Varri o ${mentionBan} daqui. Sem massagem!`, [targetJid]);
      return true;

    case 'demitir':
    case 'rebaixar':
      if (!targetJid) return true;
      await whatsapp.groupUpdateParticipant(msg.remoteJid, 'demote', [targetJid]);
      const mentionDemote = await getMention(targetJid);
      await whatsapp.sendMessage(msg.remoteJid, `📉 Perdeu o cargo, ${mentionDemote}! Volta pra base.`, [targetJid]);
      return true;

    case 'adv':
      if (!targetJid) return true;
      const mentionAdv = await getMention(targetJid);
      await whatsapp.sendMessage(msg.remoteJid, `⚠️ Atenção ${mentionAdv}, tu tomou uma advertência! Próxima é vala.`, [targetJid]);
      return true;

    default:
      return false;
  }
};
