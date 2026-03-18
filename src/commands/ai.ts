import { getAIResponse } from '../services/ai';
import { WhatsAppService } from '../services/whatsapp';
import { botTexts } from '../config/texts';

const whatsapp = new WhatsAppService();

export const handleAICommands = async (command: string, args: string[], msg: any) => {
  switch (command) {
    case 'filhote':
      if (args.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.ai.filhoteNoText);
        return true;
      }
      const prompt = args.join(' ');
      const response = await getAIResponse(prompt, botTexts.identity.systemPrompt);
      await whatsapp.sendMessage(msg.remoteJid, response || '');
      return true;

    case 'resumir':
    case 'resume':
    case 'resumo':
      await whatsapp.sendMessage(msg.remoteJid, botTexts.ai.summarizeStart);
      // Simulating summarization via general AI response for now to keep it simple and free
      const summary = await getAIResponse("Resuma as últimas conversas desse grupo de forma curta e debochada.", botTexts.identity.systemPrompt);
      await whatsapp.sendMessage(msg.remoteJid, summary || '');
      return true;

    case 'ajuda':
    case 'filhote.ajuda':
      const q = args.join(' ');
      const help = await getAIResponse(`O usuário quer ajuda sobre o bot. Pergunta: ${q}`, "Seja prestativo mas mantenha o deboche de cria do RJ.");
      await whatsapp.sendMessage(msg.remoteJid, help || '');
      return true;

    default:
      return false;
  }
};
