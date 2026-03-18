import { WhatsAppService } from '../services/whatsapp';
import { prisma } from '../services/database';
import { botTexts } from '../config/texts';

const whatsapp = new WhatsAppService();

export const handleSocialCommands = async (command: string, args: string[], msg: any) => {
  const userJid = msg.participant;

  switch (command) {
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
