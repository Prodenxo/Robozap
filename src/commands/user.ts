import { WhatsAppService } from '../services/whatsapp';
import { botTexts } from '../config/texts';
import { PrismaClient } from '@prisma/client';

const whatsapp = new WhatsAppService();
const prisma = new PrismaClient();

export const handleUserCommands = async (command: string, args: string[], msg: any) => {
  const userJid = msg.participant || msg.remoteJid;

  switch (command) {
    case 'vencimento':
      // Dummy check for expiration
      await whatsapp.sendMessage(msg.remoteJid, botTexts.general.vencimentoPlaceholder.replace('[status]', 'Ativa (VIP Infinito)'));
      return true;

    case 'meusdados':
      try {
        const stats = await prisma.stats.findMany({
          where: { userJid: userJid }
        });
        const totalMessages = stats.length;
        
        await whatsapp.sendMessage(msg.remoteJid, 
          `${botTexts.user.meusdadosHeader}\n\n` +
          `👤 *Nome:* ${msg.pushName}\n` +
          `📱 *JID:* ${userJid.split('@')[0]}\n` +
          `💬 *Mensagens enviadas:* ${totalMessages}\n` +
          `📅 *Assinatura:* Ativa`
        );
      } catch (error) {
        console.error('MeusDados Error:', error);
        await whatsapp.sendMessage(msg.remoteJid, botTexts.user.meusdadosNoData);
      }
      return true;

    case 'bio':
      if (args.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.user.bioNoText);
        return true;
      }
      const bio = args.join(' ');
      // Logic would update DB here
      await whatsapp.sendMessage(msg.remoteJid, botTexts.user.bioSuccess);
      return true;

    case 'niver':
      if (args.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.user.niverFormatError);
        return true;
      }
      const date = args[0];
      if (!/^\d{2}\/\d{2}$/.test(date)) {
          await whatsapp.sendMessage(msg.remoteJid, botTexts.user.niverFormatError);
          return true;
      }
      await whatsapp.sendMessage(msg.remoteJid, `${botTexts.user.niverSuccess}${date}!`);
      return true;

    default:
      return false;
  }
};
