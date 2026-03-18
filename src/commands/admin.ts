import { WhatsAppService } from '../services/whatsapp';
import { botTexts } from '../config/texts';
import { PrismaClient } from '@prisma/client';

const whatsapp = new WhatsAppService();
const prisma = new PrismaClient();

export const handleAdminCommands = async (command: string, args: string[], msg: any) => {
  const isGroup = msg.remoteJid.endsWith('@g.us');
  if (!isGroup) return false;

  const quotedJid = msg.raw?.message?.extendedTextMessage?.contextInfo?.participant;
  const targetJid = quotedJid || args[0]?.replace(/[^0-9]/g, '') + '@s.whatsapp.net';

  switch (command) {
    case 'promover':
      if (!quotedJid) {
          await whatsapp.sendMessage(msg.remoteJid, "Pô, responde a mensagem da pessoa que tu quer promover!");
          return true;
      }
      await whatsapp.groupUpdateParticipant(msg.remoteJid, 'promote', [quotedJid]);
      await whatsapp.sendMessage(msg.remoteJid, `👑 Cargo de patrão agora pra você: @${quotedJid.split('@')[0]}!`);
      return true;

    case 'remover':
    case 'banir':
      if (!quotedJid) {
          await whatsapp.sendMessage(msg.remoteJid, "Responde a mensagem de quem tu quer varrer!");
          return true;
      }
      await whatsapp.groupUpdateParticipant(msg.remoteJid, 'remove', [quotedJid]);
      await whatsapp.sendMessage(msg.remoteJid, `🧹 Varri o @${quotedJid.split('@')[0]} daqui. Sem massagem!`);
      return true;

    case 'demitir':
    case 'rebaixar':
      if (!quotedJid) return true;
      await whatsapp.groupUpdateParticipant(msg.remoteJid, 'demote', [quotedJid]);
      await whatsapp.sendMessage(msg.remoteJid, `📉 Perdeu o cargo, @${quotedJid.split('@')[0]}! Volta pra base.`);
      return true;

    case 'adv':
      if (!quotedJid) return true;
      await whatsapp.sendMessage(msg.remoteJid, `⚠️ Atenção @${quotedJid.split('@')[0]}, tu tomou uma advertência! Próxima é vala.`);
      return true;

    default:
      return false;
  }
};
