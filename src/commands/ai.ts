import { AIService } from '../services/ai';
import { WhatsAppService } from '../services/whatsapp';
import { botTexts } from '../config/texts';

const ai = new AIService();
const whatsapp = new WhatsAppService();

export const handleAICommands = async (command: string, args: string[], msg: any) => {
  switch (command) {
    case 'filhote':
      if (args.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.ai.filhoteNoText);
        return true;
      }
      const prompt = args.join(' ');
      const response = await ai.getMiltonResponse(prompt);
      await whatsapp.sendMessage(msg.remoteJid, response || '');
      return true;

    case 'resumir':
    case 'resume':
    case 'resumo':
      await whatsapp.sendMessage(msg.remoteJid, botTexts.ai.summarizeStart);
      const summary = await ai.summarizeGroup(msg.remoteJid);
      await whatsapp.sendMessage(msg.remoteJid, summary || '');
      return true;

    case 'ajuda':
    case 'filhote.ajuda':
      const q = args.join(' ');
      const help = await ai.getMiltonResponse(`O usuário quer ajuda sobre o bot. Pergunta: ${q}`, 'helpful but sarcastic as a RJ local');
      await whatsapp.sendMessage(msg.remoteJid, help || '');
      return true;

    default:
      return false;
  }
};
