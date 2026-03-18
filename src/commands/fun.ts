import { WhatsAppService } from '../services/whatsapp';
import { botTexts } from '../config/texts';
import { PrismaClient } from '@prisma/client';

const whatsapp = new WhatsAppService();
const prisma = new PrismaClient();

export const handleFunCommands = async (command: string, args: string[], msg: any) => {
  switch (command) {
    case 'chance':
      if (args.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.fun.chanceNoText);
        return true;
      }
      const percentage = Math.floor(Math.random() * 101);
      const text = args.join(' ');
      const response = `${botTexts.fun.chanceHeader}"${text}":\n🎯 *${percentage}%*!`;
      await whatsapp.sendMessage(msg.remoteJid, response);
      return true;

    case 'sortear':
      try {
        // Querying actual users from database who have messages in this group
        const groupUsers = await prisma.stats.findMany({
          where: { groupJid: msg.remoteJid },
          distinct: ['userJid'],
          select: { userJid: true }
        });

        if (groupUsers.length === 0) {
          // If no stats yet, let's just use the current sender as a fallback message
          await whatsapp.sendMessage(msg.remoteJid, "Ainda não tenho gente suficiente salva no meu banco pra sortear! Fala tu primeiro.");
          return true;
        }

        const quantity = Math.min(parseInt(args[0]) || 1, groupUsers.length);
        const shuffled = [...groupUsers].sort(() => 0.5 - Math.random());
        const chosen = shuffled.slice(0, quantity);
        
        const winnersText = chosen.map(u => `@${u.userJid.split('@')[0]}`).join(', ');
        await whatsapp.sendMessage(msg.remoteJid, `🎉 *Os sorteados da vez são*:\n\n${winnersText}`);
      } catch (error) {
        console.error('Sorteio Error:', error);
      }
      return true;

    case 'dado':
    case 'd6':
    case 'd20':
      const sides = command === 'dado' ? (parseInt(args[0]) || 6) : parseInt(command.slice(1));
      const result = Math.floor(Math.random() * sides) + 1;
      await whatsapp.sendMessage(msg.remoteJid, `🎲 Joguei o *d${sides}* aqui e caiu: *${result}*!`);
      return true;

    case 'moeda':
      const coin = Math.random() > 0.5 ? 'Cara' : 'Coroa';
      await whatsapp.sendMessage(msg.remoteJid, `🪙 Girei a moeda... caiu *${coin}*!`);
      return true;

    default:
      return false;
  }
};
