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
          include: { user: true }
      });
      const luckyOne = allParts[Math.floor(Math.random() * allParts.length)];
      const name = luckyOne?.user?.pushName || luckyOne?.userJid.split('@')[0] || 'alguém';
      const mentionJid = luckyOne?.userJid;

      const response = `🎯 *CHANCE DE: ${query.toUpperCase()}*\n\n📈 Resultado: *${percentage}%*\n🕵️ Provável culpado: @${name}`;
      await whatsapp.sendMessage(msg.remoteJid, response, mentionJid ? [mentionJid] : []);
      return true;

    case 'sortear':
    case 'sorteio':
      try {
        const groupUsers = await (prisma as any).groupParticipant.findMany({
          where: { group: { jid: msg.remoteJid } },
          include: { user: true }
        });

        if (groupUsers.length === 0) {
          await whatsapp.sendMessage(msg.remoteJid, "Ainda não tenho gente cadastrada aqui pra sortear!");
          return true;
        }

        const quantity = Math.min(parseInt(args[0]) || 1, groupUsers.length);
        const shuffled = [...groupUsers].sort(() => 0.5 - Math.random());
        const chosen = shuffled.slice(0, quantity);
        const mentionList = chosen.map((u: any) => u.userJid);
        
        const winnersText = chosen.map((u: any) => `@${u.user?.pushName || u.userJid.split('@')[0]}`).join(', ');
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

        let user1: { jid: string; name: string } | null = null;
        let user2: { jid: string; name: string } | null = null;

        const mentioned = msg.mentionedJid || [];
        if (mentioned.length >= 2) {
          // Usar os mencionados diretamente
          const u1 = await (prisma as any).user.findUnique({ where: { jid: mentioned[0] } });
          const u2 = await (prisma as any).user.findUnique({ where: { jid: mentioned[1] } });
          user1 = { jid: mentioned[0], name: u1?.pushName || mentioned[0].split('@')[0] };
          user2 = { jid: mentioned[1], name: u2?.pushName || mentioned[1].split('@')[0] };
        } else {
          // Sortear do banco
          const allMembers = await (prisma as any).groupParticipant.findMany({ 
              where: { groupId: group.id },
              include: { user: true }
          });

          if (allMembers.length < 2) {
            await whatsapp.sendMessage(msg.remoteJid, "❌ *ERRO:* Não conheço gente suficiente nesse grupo ainda para formar um casal! Todo mundo precisa mandar pelo menos um 'oi' pro pai aqui registrar vocês.");
            return true;
          }

          const shuffled = allMembers.sort(() => 0.5 - Math.random());
          user1 = { jid: shuffled[0].userJid, name: shuffled[0].user?.pushName || shuffled[0].userJid.split('@')[0] };
          user2 = { jid: shuffled[1].userJid, name: shuffled[1].user?.pushName || shuffled[1].userJid.split('@')[0] };
        }

        if (user1 && user2) {
          const casalText = botTexts.fun.casal
            .replace('#USER1', user1.name)
            .replace('#USER2', user2.name);
          await whatsapp.sendMessage(msg.remoteJid, casalText, [user1.jid, user2.jid]);
        }
      } catch (e) {
        console.error('Error in casal:', e);
      }
      return true;

    default:
      return false;
  }
}
