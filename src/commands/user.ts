import { WhatsAppService } from '../services/whatsapp';
import { botTexts } from '../config/texts';
import { prisma } from '../services/database';

const whatsapp = new WhatsAppService();

export const handleUserCommands = async (command: string, args: string[], msg: any) => {
  const userJid = msg.participant || msg.remoteJid;
  const isADM = msg.remoteJid.endsWith('@g.us');

  switch (command) {
    case 'vencimento':
      await whatsapp.sendMessage(msg.remoteJid, botTexts.general.vencimentoAtiva);
      return true;

    case 'meusdados':
    case 'dados':
    case 'perfil':
      try {
        const statsCount = await (prisma as any).messageLog.count({ where: { userJid } });
        const participant = await (prisma as any).groupParticipant.findFirst({ 
          where: { userJid, group: { jid: msg.remoteJid } } 
        });

        if (!participant) {
            await whatsapp.sendMessage(msg.remoteJid, "Ainda não tenho dados seus registrados neste grupo! Manda umas mensagens pra eu te conhecer.");
            return true;
        }

        const response = 
          `👤 *PERFIL FILHOTE* 👤\n\n` +
          `💌 *Total de Mensagens:* ${statsCount}\n` +
          `🖋️ *Bio:* ${participant.bioText || 'Sem bio!'}\n` +
          `⚠️ *Advertências:* ${participant.warningsCount || 0}\n` +
          `🎂 *Niver:* ${participant.birthday || 'Não cadastrado'}\n` +
          `📸 *IG:* ${participant.instagram ? '@' + participant.instagram : 'Não cadastrou'}\n` +
          `📍 *Local:* ${participant.location || 'Não disse'}`;
        
        await whatsapp.sendMessage(msg.remoteJid, response);
      } catch (e) {
        console.error(e);
      }
      return true;

    case 'bio':
    case 'niver':
    case 'ig':
    case 'meuig':
    case 'local':
    case 'ignoreme':
      try {
        const group = await (prisma as any).group.findUnique({ where: { jid: msg.remoteJid } });
        if (!group) return true;

        const data: any = {};
        if (command === 'bio') data.bioText = args.join(' ');
        if (command === 'niver') {
          if (!/^\d{2}\/\d{2}$/.test(args[0])) {
            await whatsapp.sendMessage(msg.remoteJid, "Formato errado! Tenta DD/MM.");
            return true;
          }
          data.birthday = args[0];
        }
        if (command === 'ig' || command === 'meuig') data.instagram = args[0]?.replace('@', '');
        if (command === 'local') data.location = args.join(' ');
        if (command === 'ignoreme') data.ignoreMentions = args[0] === 'on';

        await (prisma as any).groupParticipant.upsert({
          where: { groupId_userJid: { groupId: group.id, userJid } },
          update: data,
          create: { 
            group: { connect: { id: group.id } }, 
            user: { connect: { jid: userJid } }, 
            ...data 
          }
        });

        const successMsgs: Record<string, string> = {
          bio: "Bio atualizada com sucesso! ✅",
          niver: `Aniversário salvo: ${data.birthday}! 🎂`,
          ig: `Insta salvo: @${data.instagram}! 📸`,
          meuig: `Insta salvo: @${data.instagram}! 📸`,
          local: `Localização salva: ${data.location}! 📍`,
          ignoreme: `IgnoreMe ${data.ignoreMentions ? 'ATIVADO 🛡️' : 'DESATIVADO 📢'}`
        };
        await whatsapp.sendMessage(msg.remoteJid, successMsgs[command]);
      } catch (e) {
        console.error(`Error in ${command}:`, e);
      }
      return true;

    case 'iglist':
      const participantsIg = await (prisma as any).groupParticipant.findMany({ 
        where: { group: { jid: msg.remoteJid }, instagram: { not: null } },
        include: { user: true }
      });
      const igText = participantsIg.map((p: any) => `📸 @${p.instagram} (${p.user?.pushName || p.userJid.split('@')[0]})`).join('\n');
      await whatsapp.sendMessage(msg.remoteJid, `📸 *INSTAGRAMS DA TROPA:*\n\n${igText || 'Ninguém cadastrou ainda.'}`);
      return true;

    case 'locallist':
      const participantsLoc = await (prisma as any).groupParticipant.findMany({ 
        where: { group: { jid: msg.remoteJid }, location: { not: null } },
        include: { user: true }
      });
      const locText = participantsLoc.map((p: any) => `📍 ${p.location} (${p.user?.pushName || p.userJid.split('@')[0]})`).join('\n');
      await whatsapp.sendMessage(msg.remoteJid, `📍 *ONDE A RAPAZIADA MORA:*\n\n${locText || 'Ninguém avisou ainda.'}`);
      return true;

    default:
      return false;
  }
};
