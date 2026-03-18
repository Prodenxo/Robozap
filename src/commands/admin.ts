import { WhatsAppService } from '../services/whatsapp';
import { PrismaClient } from '@prisma/client';
import { botTexts } from '../config/texts';

const prisma = new PrismaClient();
const whatsapp = new WhatsAppService();

export const handleAdminCommands = async (command: string, args: string[], msg: any) => {
  const mentionedJids = msg.quoted?.participant ? [msg.quoted.participant] : [];
  
  switch (command) {
    case 'remover':
      if (mentionedJids.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.admin.noMention);
        return true;
      }
      await whatsapp.sendMessage(msg.remoteJid, botTexts.admin.removerSuccess);
      return true;

    case 'ban':
    case 'banir':
      if (mentionedJids.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.admin.noMention);
        return true;
      }
      await whatsapp.sendMessage(msg.remoteJid, botTexts.admin.banSuccess);
      return true;

    case 'adv':
      if (mentionedJids.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.admin.noMention);
        return true;
      }
      const target = mentionedJids[0];
      const updatedUser = await prisma.user.update({
        where: { jid: target },
        data: { warnings: { increment: 1 } }
      });
      
      let advMsg = `${botTexts.admin.advSuccess}@${target.split('@')[0]} (${updatedUser.warnings}/3)`;
      if (updatedUser.warnings >= 3) {
        advMsg += `\n${botTexts.admin.advLimit}`;
      }
      await whatsapp.sendMessage(msg.remoteJid, advMsg);
      return true;

    case 'promover':
      if (mentionedJids.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.admin.noMention);
        return true;
      }
      await whatsapp.sendMessage(msg.remoteJid, `👑 Agora @${mentionedJids[0].split('@')[0]} é admin da firma!`);
      return true;

    default:
      return false;
  }
};
