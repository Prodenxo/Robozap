import { WhatsAppService } from '../services/whatsapp';
import { PrismaClient } from '@prisma/client';
import { botTexts } from '../config/texts';

const prisma = new PrismaClient();
const whatsapp = new WhatsAppService();

export const handleSocialCommands = async (command: string, args: string[], msg: any) => {
  const userJid = msg.participant;

  switch (command) {
    case 'ig':
      if (args.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.social.igList);
        return true;
      }
      const ig = args[0].replace('@', '');
      await prisma.user.update({
        where: { jid: userJid },
        data: { instagram: ig }
      });
      await whatsapp.sendMessage(msg.remoteJid, `${botTexts.social.igSuccess}${ig}!`);
      return true;

    case 'local':
      if (args.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.social.localList);
        return true;
      }
      const local = args.join(' ');
      await prisma.user.update({
        where: { jid: userJid },
        data: { location: local }
      });
      await whatsapp.sendMessage(msg.remoteJid, `${botTexts.social.localSuccess}${local}!`);
      return true;

    case 'radio':
      await whatsapp.sendMessage(msg.remoteJid, botTexts.social.radio);
      return true;

    case 'roles':
      await whatsapp.sendMessage(msg.remoteJid, botTexts.social.roles);
      return true;

    default:
      return false;
  }
};
