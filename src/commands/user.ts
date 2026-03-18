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
      if (args.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, "Solta tua bio aí depois do .bio");
        return true;
      }
      const bioContent = args.join(' ');
      await (prisma as any).groupParticipant.upsert({
        where: { groupId_userJid: { groupId: msg.remoteJid, userJid } }, // Note: assuming groupId is the CID for upsert link
        update: { bioText: bioContent },
        create: { 
            group: { connect: { jid: msg.remoteJid } },
            user: { connect: { jid: userJid } },
            bioText: bioContent 
        }
      });
      await whatsapp.sendMessage(msg.remoteJid, "Bio atualizada com sucesso! ✅");
      return true;

    case 'niver':
      if (args.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, "Manda a data (DD/MM). Ex: .niver 10/05");
      } else {
        const date = args[0];
        if (!/^\d{2}\/\d{2}$/.test(date)) {
          await whatsapp.sendMessage(msg.remoteJid, "Formato errado! Tenta DD/MM.");
        } else {
          await (prisma as any).groupParticipant.upsert({
            where: { groupId_userJid: { groupId: msg.remoteJid, userJid } },
            update: { birthday: date },
            create: { group: { connect: { jid: msg.remoteJid } }, user: { connect: { jid: userJid } }, birthday: date }
          });
          await whatsapp.sendMessage(msg.remoteJid, `Aniversário salvo: ${date}! 🎂`);
        }
      }
      return true;

    case 'ig':
      if (args.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, "Manda seu @ do Insta depois do .ig");
      } else {
        const ig = args[0].replace('@', '');
        await (prisma as any).groupParticipant.upsert({
          where: { groupId_userJid: { groupId: msg.remoteJid, userJid } },
          update: { instagram: ig },
          create: { group: { connect: { jid: msg.remoteJid } }, user: { connect: { jid: userJid } }, instagram: ig }
        });
        await whatsapp.sendMessage(msg.remoteJid, `Insta salvo: @${ig}! 📸`);
      }
      return true;

    case 'local':
      if (args.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, "Onde tu mora? Escreve depois do .local");
      } else {
        const loc = args.join(' ');
        await (prisma as any).groupParticipant.upsert({
          where: { groupId_userJid: { groupId: msg.remoteJid, userJid } },
          update: { location: loc },
          create: { group: { connect: { jid: msg.remoteJid } }, user: { connect: { jid: userJid } }, location: loc }
        });
        await whatsapp.sendMessage(msg.remoteJid, `Localização salva: ${loc}! 📍`);
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

    case 'ignoreme':
      const mode = args[0] === 'on';
      await (prisma as any).groupParticipant.upsert({
        where: { groupId_userJid: { groupId: msg.remoteJid, userJid } },
        update: { ignoreMentions: mode },
        create: { group: { connect: { jid: msg.remoteJid } }, user: { connect: { jid: userJid } }, ignoreMentions: mode }
      });
      await whatsapp.sendMessage(msg.remoteJid, `IgnoreMe ${mode ? 'ATIVADO 🛡️' : 'DESATIVADO 📢'}`);
      return true;

    default:
      return false;
  }
};
