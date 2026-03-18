import { WhatsAppService } from '../services/whatsapp';
import { getAIResponse } from '../services/ai';
import { botTexts } from '../config/texts';
import { PrismaClient } from '@prisma/client';

const whatsapp = new WhatsAppService();
const prisma = new PrismaClient();

export const handleAICommands = async (command: string, args: string[], msg: any) => {
  switch (command) {
    case 'filhote':
    case 'chat':
    case 'ia':
      if (args.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.ai.filhoteNoText);
        return true;
      }
      const prompt = args.join(' ');
      const response = await getAIResponse(prompt, botTexts.identity.systemPrompt);
      await whatsapp.sendMessage(msg.remoteJid, response);
      return true;

    case 'resumir':
    case 'resumo':
      await whatsapp.sendMessage(msg.remoteJid, botTexts.ai.summarizeStart);
      try {
        // Fetch recent messages logically from the database for this group
        const stats = await prisma.stats.findMany({
          where: { groupJid: msg.remoteJid },
          orderBy: { createdAt: 'desc' },
          take: 30, // Last 30 messages
          select: { text: true, userJid: true }
        });

        if (stats.length === 0) {
          await whatsapp.sendMessage(msg.remoteJid, botTexts.ai.errorNoMessages);
          return true;
        }

        const chatContext = stats.reverse().map(s => `${s.userJid.split('@')[0]}: ${s.text}`).join('\n');
        const summary = await getAIResponse(
            `Resuma de forma engraçada, sarcástica e curta as seguintes mensagens de um grupo: \n\n${chatContext}`, 
            botTexts.identity.summaryPrompt
        );
        
        await whatsapp.sendMessage(msg.remoteJid, `📝 *Resumão da Resenha* 📝\n\n${summary}`);
      } catch (error) {
        console.error('Summarize Error:', error);
        await whatsapp.sendMessage(msg.remoteJid, botTexts.ai.errorGeneric);
      }
      return true;

    default:
      return false;
  }
};
