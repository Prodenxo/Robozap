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
        const statsCount = await prisma.groupMessage.count({ where: { userJid } });
        const user = await prisma.user.findUnique({ where: { jid: userJid } });
        
        const response = `${botTexts.user.meusdadosHeader}\n\n` +
          `👤 *Nome:* ${msg.pushName}\n` +
          `💬 *Mensagens:* ${statsCount}\n` +
          `⚠️ *Advertências:* ${user?.warnings || 0}\n` +
          `🎂 *Niver:* ${user?.birthday || 'Não cadastrado'}\n` +
          `📸 *IG:* ${user?.instagram || 'N/A'}\n` +
          `📍 *Local:* ${user?.location || 'N/A'}`;
        
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
      await prisma.user.update({ where: { jid: userJid }, data: { bio: args.join(' ') } });
      await whatsapp.sendMessage(msg.remoteJid, botTexts.user.bioSuccess);
      return true;

    case 'niver':
      if (args[0] === 'excluir' || command === 'niver.excluir') {
        await prisma.user.update({ where: { jid: userJid }, data: { birthday: null } });
        await whatsapp.sendMessage(msg.remoteJid, botTexts.user.niverExcluir);
      } else {
        const date = args[0];
        if (!/^\d{2}\/\d{2}$/.test(date)) {
          await whatsapp.sendMessage(msg.remoteJid, "Pô, manda DD/MM. Ex: .niver 15/08");
        } else {
          await prisma.user.update({ where: { jid: userJid }, data: { birthday: date } });
          await whatsapp.sendMessage(msg.remoteJid, `${botTexts.user.niverSuccess}${date}!`);
        }
      }
      return true;

    case 'ig':
      if (args.length === 0) {
        // List all IGs
        const users = await prisma.user.findMany({ where: { instagram: { not: null } }, select: { pushName: true, instagram: true } });
        const list = users.map(u => `📸 ${u.pushName}: @${u.instagram}`).join('\n');
        await whatsapp.sendMessage(msg.remoteJid, `📸 *Lista do Insta:*\n\n${list || 'Ninguém cadastrou nada ainda.'}`);
      } else {
        const ig = args[0].replace('@', '');
        await prisma.user.update({ where: { jid: userJid }, data: { instagram: ig } });
        await whatsapp.sendMessage(msg.remoteJid, `${botTexts.user.igSuccess}${ig}!`);
      }
      return true;

    case 'local':
      if (args.length === 0) {
        const users = await prisma.user.findMany({ where: { location: { not: null } }, select: { pushName: true, location: true } });
        const list = users.map(u => `📍 ${u.pushName}: ${u.location}`).join('\n');
        await whatsapp.sendMessage(msg.remoteJid, `📍 *Onde a rapaziada mora:*\n\n${list || 'Ninguém avisou.'}`);
      } else {
        const local = args.join(' ');
        await prisma.user.update({ where: { jid: userJid }, data: { location: local } });
        await whatsapp.sendMessage(msg.remoteJid, `${botTexts.user.localSuccess}${local}!`);
      }
      return true;

    case 'ignoreme':
      const mode = args[0] === 'on';
      await prisma.user.update({ where: { jid: userJid }, data: { ignoreMe: mode } });
      await whatsapp.sendMessage(msg.remoteJid, `${botTexts.user.ignoreMe}${mode ? 'ATIVADO 🛡️' : 'DESATIVADO 📢'}`);
      return true;

    default:
      return false;
  }
};
