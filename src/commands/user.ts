import { PrismaClient } from '@prisma/client';
import { WhatsAppService } from '../services/whatsapp';
import { botTexts } from '../config/texts';

const prisma = new PrismaClient();
const whatsapp = new WhatsAppService();

export const handleUserCommands = async (command: string, args: string[], msg: any) => {
  const userJid = msg.participant;

  switch (command) {
    case 'meusdados':
    case 'dados':
      const userData = await prisma.user.findUnique({
        where: { jid: userJid }
      });
      if (!userData) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.user.meusdadosNoData);
        return true;
      }
      const statsText = `${botTexts.user.meusdadosHeader}
      
👤 *Nome:* ${msg.pushName}
📝 *Mensagens:* ${userData.messagesSent}
🎭 *Cargo:* ${userData.cargo === 2 ? 'Administrador' : 'Membro'}
📍 *Local:* ${userData.location || 'Não informado'}
🎂 *Aniversário:* ${userData.birthday || 'Não informado'}
      `;
      await whatsapp.sendMessage(msg.remoteJid, statsText);
      return true;

    case 'bio':
      const newBio = args.join(' ');
      if (!newBio) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.user.bioNoText);
        return true;
      }
      await prisma.user.update({
        where: { jid: userJid },
        data: { bio: newBio }
      });
      await whatsapp.sendMessage(msg.remoteJid, botTexts.user.bioSuccess);
      return true;

    case 'niver':
      const date = args[0];
      if (!date || !/^\d{2}\/\d{2}$/.test(date)) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.user.niverFormatError);
        return true;
      }
      await prisma.user.update({
        where: { jid: userJid },
        data: { birthday: date }
      });
      await whatsapp.sendMessage(msg.remoteJid, `${botTexts.user.niverSuccess}${date}!`);
      return true;

    default:
      return false;
  }
};
