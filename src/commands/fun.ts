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
      const response = `${botTexts.fun.chanceHeader}"${text}":\n\n🎯 *${percentage}%*!`;
      await whatsapp.sendMessage(msg.remoteJid, response);
      return true;

    case 'sortear':
      let participants = ['@pessoa1', '@pessoa2', '@pessoa3', '@pessoa4']; // Dummy list
      let quantity = parseInt(args[0]) || 1;
      let winners: string[] = [];
      for (let i = 0; i < quantity; i++) {
        let winner = participants[Math.floor(Math.random() * participants.length)];
        winners.push(winner);
        participants = participants.filter(p => p !== winner);
        if (participants.length === 0) break;
      }
      const winnersText = winners.join(', ');
      await whatsapp.sendMessage(msg.remoteJid, `${botTexts.fun.sortearResult}*${winnersText}*!`);
      return true;

    case 'dado':
    case 'd6':
    case 'd20':
      const sides = command === 'dado' ? (parseInt(args[0]) || 6) : parseInt(command.slice(1));
      const result = Math.floor(Math.random() * sides) + 1;
      await whatsapp.sendMessage(msg.remoteJid, `${botTexts.fun.dadoResult.replace('$sides', sides.toString())}*${result}*!`);
      return true;

    case 'moeda':
      const coin = Math.random() > 0.5 ? 'Cara' : 'Coroa';
      await whatsapp.sendMessage(msg.remoteJid, `${botTexts.fun.moedaResult}*${coin}*!`);
      return true;

    default:
      return false;
  }
};
