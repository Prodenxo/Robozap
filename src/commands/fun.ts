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
      const query = args.join(' ');
      
      const allParts = await (prisma as any).groupParticipant.findMany({ 
          where: { group: { jid: msg.remoteJid } },
          select: { userJid: true }
      });
      const luckyOne = allParts[Math.floor(Math.random() * allParts.length)];
      if (!luckyOne) return true;

      const name = await whatsapp.resolveName(luckyOne.userJid);
      const mentionJid = luckyOne.userJid;

      const response = `🎯 *CHANCE DE: ${query.toUpperCase()}*\n\n📈 Resultado: *${percentage}%*\n🕵️ Provável culpado: @${name}`;
      await whatsapp.sendMessage(msg.remoteJid, response, [mentionJid]);
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
        
        const winnersText = await Promise.all(chosen.map(async (u: any) => {
            const resolved = await whatsapp.resolveName(u.userJid);
            return `@${resolved}`;
        })).then(names => names.join(', '));

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

    case 'viadometro':
    case 'gadometro':
    case 'bafometro':
      const resultPercent = Math.floor(Math.random() * 101);
      let text = '';
      if (command === 'viadometro') text = botTexts.fun.viadometro.replace('#RESULT', resultPercent.toString());
      if (command === 'gadometro') text = botTexts.fun.gadometro.replace('#RESULT', resultPercent.toString());
      if (command === 'bafometro') text = botTexts.fun.bafometro.replace('#RESULT', resultPercent.toString());
      await whatsapp.sendMessage(msg.remoteJid, text);
      return true;

    case 'detector':
      const results = ['VERDADE ✅', 'MENTIRA ❌', 'TALVEZ... 🤔', 'KAÔ PURO 🤥', 'SINTO CHEIRO DE MENTIRA 👃'];
      const detectorResult = results[Math.floor(Math.random() * results.length)];
      await whatsapp.sendMessage(msg.remoteJid, botTexts.fun.detector.replace('#RESULT', detectorResult));
      return true;

    case 'casal':
      try {
        const group = await (prisma as any).group.findUnique({ where: { jid: msg.remoteJid } });
        if (!group) return true;

        let u1Data: { jid: string; display: string } | null = null;
        let u2Data: { jid: string; display: string } | null = null;

        const mentioned = msg.mentionedJid || [];
        if (mentioned.length >= 2) {
          const nameA = await whatsapp.resolveName(mentioned[0]);
          const nameB = await whatsapp.resolveName(mentioned[1]);
          u1Data = { jid: mentioned[0], display: `@${nameA}` };
          u2Data = { jid: mentioned[1], display: `@${nameB}` };
        } else {
          const allMembers = await (prisma as any).groupParticipant.findMany({ 
              where: { groupId: group.id },
              select: { userJid: true }
          });

          if (allMembers.length < 2) {
            await whatsapp.sendMessage(msg.remoteJid, "❌ *ERRO:* Não conheço gente suficiente nesse grupo ainda para formar um casal! Todo mundo precisa mandar pelo menos um 'oi' pro pai aqui registrar vocês.");
            return true;
          }

          const shuffled = allMembers.sort(() => 0.5 - Math.random());
          const name1 = await whatsapp.resolveName(shuffled[0].userJid);
          const name2 = await whatsapp.resolveName(shuffled[1].userJid);
          u1Data = { jid: shuffled[0].userJid, display: `@${name1}` };
          u2Data = { jid: shuffled[1].userJid, display: `@${name2}` };
        }

        if (u1Data && u2Data) {
          const casalText = botTexts.fun.casal
            .replace('#USER1', u1Data.display)
            .replace('#USER2', u2Data.display);
          await whatsapp.sendMessage(msg.remoteJid, casalText, [u1Data.jid, u2Data.jid]);
        }
      } catch (e) {
        console.error('Error in casal:', e);
      }
      return true;

    default:
      return false;
  }
}
