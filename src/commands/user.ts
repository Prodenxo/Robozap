import { WhatsAppService } from '../services/whatsapp';
import { botTexts } from '../config/texts';
import { PrismaClient } from '@prisma/client';

const whatsapp = new WhatsAppService();
const prisma = new PrismaClient();

export const handleUserCommands = async (command: string, args: string[], msg: any) => {
  const userJid = msg.participant || msg.remoteJid;
  const isADM = msg.remoteJid.endsWith('@g.us');

  switch (command) {
    case 'vencimento':
      await whatsapp.sendMessage(msg.remoteJid, botTexts.general.vencimentoAtiva);
      return true;

    case 'meusdados':
    case 'dados':
      try {
        const statsCount = await prisma.messageLog.count({ where: { userJid } });
        const participant = await prisma.groupParticipant.findFirst({ 
          where: { userJid, group: { jid: msg.remoteJid } } 
        });
        
        const response = `${botTexts.user.meusdadosHeader}\n\n` +
          `👤 *Nome:* ${msg.pushName}\n` +
          `💬 *Mensagens:* ${statsCount}\n` +
          `⚠️ *Advertências:* ${participant?.warningsCount || 0}\n` +
          `🎂 *Niver:* ${participant?.birthday || 'Não cadastrado'}\n` +
          `📸 *IG:* ${participant?.instagram || 'N/A'}\n` +
          `📍 *Local:* ${participant?.location || 'N/A'}`;
        
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
      await prisma.groupParticipant.updateMany({ 
        where: { userJid, group: { jid: msg.remoteJid } }, 
        data: { bioText: args.join(' ') } 
      });
      await whatsapp.sendMessage(msg.remoteJid, botTexts.user.bioSuccess);
      return true;

    case 'niver':
      if (args[0] === 'excluir' || (command as string) === 'niver.excluir') {
        await prisma.groupParticipant.updateMany({ 
          where: { userJid, group: { jid: msg.remoteJid } }, 
          data: { birthday: null } 
        });
        await whatsapp.sendMessage(msg.remoteJid, botTexts.user.niverExcluir);
      } else {
        const date = args[0];
        if (!/^\d{2}\/\d{2}$/.test(date)) {
          await whatsapp.sendMessage(msg.remoteJid, "Pô, manda DD/MM. Ex: .niver 15/08");
        } else {
          await prisma.groupParticipant.updateMany({ 
            where: { userJid, group: { jid: msg.remoteJid } }, 
            data: { birthday: date } 
          });
          await whatsapp.sendMessage(msg.remoteJid, `${botTexts.user.niverSuccess}${date}!`);
        }
      }
      return true;

    case 'ig':
      if (args.length === 0) {
        // List all IGs in this group
        const participants = await prisma.groupParticipant.findMany({ 
          where: { group: { jid: msg.remoteJid }, instagram: { not: null } }, 
          select: { user: { select: { pushName: true } }, instagram: true } 
        });
        const list = participants.map(p => `📸 ${p.user.pushName || 'Desconhecido'}: @${p.instagram}`).join('\n');
        await whatsapp.sendMessage(msg.remoteJid, `📸 *Lista do Insta:*\n\n${list || 'Ninguém cadastrou nada ainda.'}`);
      } else {
        const ig = args[0].replace('@', '');
        await prisma.groupParticipant.updateMany({ 
          where: { userJid, group: { jid: msg.remoteJid } }, 
          data: { instagram: ig } 
        });
        await whatsapp.sendMessage(msg.remoteJid, `${botTexts.user.igSuccess}${ig}!`);
      }
      return true;

    case 'local':
      if (args.length === 0) {
        const participants = await prisma.groupParticipant.findMany({ 
          where: { group: { jid: msg.remoteJid }, location: { not: null } }, 
          select: { user: { select: { pushName: true } }, location: true } 
        });
        const list = participants.map(p => `📍 ${p.user.pushName || 'Desconhecido'}: ${p.location}`).join('\n');
        await whatsapp.sendMessage(msg.remoteJid, `📍 *Onde a rapaziada mora:*\n\n${list || 'Ninguém avisou.'}`);
      } else {
        const local = args.join(' ');
        await prisma.groupParticipant.updateMany({ 
          where: { userJid, group: { jid: msg.remoteJid } }, 
          data: { location: local } 
        });
        await whatsapp.sendMessage(msg.remoteJid, `${botTexts.user.localSuccess}${local}!`);
      }
      return true;

    case 'ignoreme':
      const mode = args[0] === 'on';
      await prisma.groupParticipant.updateMany({ 
        where: { userJid, group: { jid: msg.remoteJid } }, 
        data: { ignoreMentions: mode } 
      });
      await whatsapp.sendMessage(msg.remoteJid, `${botTexts.user.ignoreMe}${mode ? 'ATIVADO 🛡️' : 'DESATIVADO 📢'}`);
      return true;

    default:
      return false;
  }
};
