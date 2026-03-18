import { WhatsAppService } from '../services/whatsapp';
import { botTexts } from '../config/texts';

export const handleGeneralCommands = async (command: string, args: string[], msg: any) => {
  const whatsapp = new WhatsAppService();

  switch (command) {
    case 'menu':
      await whatsapp.sendMessage(msg.remoteJid, botTexts.general.menu);
      return true;

    case 'vencimento':
      await whatsapp.sendMessage(msg.remoteJid, botTexts.general.vencimentoPlaceholder);
      return true;

    case 'teste':
    case 'oi':
    case 'fala':
    case 'salve':
      const responses = botTexts.general.testReplies;
      const randomMsg = responses[Math.floor(Math.random() * responses.length)];
      await whatsapp.sendMessage(msg.remoteJid, randomMsg);
      return true;

    default:
      return false;
  }
};
