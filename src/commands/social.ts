import { WhatsAppService } from '../services/whatsapp';
import { prisma } from '../services/database';
import { botTexts } from '../config/texts';

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
      await (prisma as any).groupParticipant.updateMany({
        where: { userJid, group: { jid: msg.remoteJid } },
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
      await (prisma as any).groupParticipant.updateMany({
        where: { userJid, group: { jid: msg.remoteJid } },
        data: { location: local }
      });
      await whatsapp.sendMessage(msg.remoteJid, `${botTexts.social.localSuccess}${local}!`);
      return true;

    case 'radio':
    case 'playlist':
      await whatsapp.sendMessage(msg.remoteJid, botTexts.social.radio);
      return true;

    case 'vou':
    case 'role.vou':
      // Simplified presence logic
      await whatsapp.sendMessage(msg.remoteJid, botTexts.social.presenca + " (Em breve: integração com eventos)");
      return true;

    case 'vounao':
    case 'nvou':
    case 'role.nvou':
      await whatsapp.sendMessage(msg.remoteJid, botTexts.social.desistencia);
      return true;

    case 'roles':
    case 'resenha':
      await whatsapp.sendMessage(msg.remoteJid, botTexts.social.roles);
      return true;

    default:
      return false;
  }
};
