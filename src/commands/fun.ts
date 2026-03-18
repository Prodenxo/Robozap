import { prisma } from '../services/database';
import { WhatsAppService } from '../services/whatsapp';
import { botTexts } from '../config/texts';

const whatsapp = new WhatsAppService();

export const handleFunCommands = async (command: string, args: string[], msg: any) => {
  switch (command) {
    case 'chance':
      if (args.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.fun.chanceNoText);
        return true;
      }
      const percentage = Math.floor(Math.random() * 101);
      const text = args.join(' ');
      
      // Optionally pick a random participant to "accuse" or "target"
      const allParts = await (prisma as any).groupParticipant.findMany({ where: { group: { jid: msg.remoteJid } } });
      const randomUser = allParts[Math.floor(Math.random() * allParts.length)];
      const mention = randomUser ? `@${randomUser.userJid.split('@')[0]}` : 'alguém';

      const response = `${botTexts.fun.chanceHeader}"${text}":\n🎯 *${percentage}%*! (Pelo que eu vi, o culpado é o ${mention})`;
      await whatsapp.sendMessage(msg.remoteJid, response, randomUser ? [randomUser.userJid] : []);
      return true;

    case 'sortear':
    case 'sorteio':
      try {
        const groupUsers = await (prisma as any).groupParticipant.findMany({
          where: { group: { jid: msg.remoteJid } },
          select: { userJid: true }
        });

        if (groupUsers.length === 0) {
          await whatsapp.sendMessage(msg.remoteJid, "Ainda não tenho gente cadastrada aqui pra sortear!");
          return true;
        }

        const quantity = Math.min(parseInt(args[0]) || 1, groupUsers.length);
        const shuffled = [...groupUsers].sort(() => 0.5 - Math.random());
        const chosen = shuffled.slice(0, quantity);
        const mentionList = chosen.map((u: any) => u.userJid);
        
        const winnersText = chosen.map((u: any) => `@${u.userJid.split('@')[0]}`).join(', ');
        await whatsapp.sendMessage(msg.remoteJid, `🎉 *OS SORTEADOS DO FILHOTE SÃO*:\n\n${winnersText}`, mentionList);
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
