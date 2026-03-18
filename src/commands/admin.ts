import { WhatsAppService } from '../services/whatsapp';
import { botTexts } from '../config/texts';
import { PrismaClient } from '@prisma/client';

const whatsapp = new WhatsAppService();
const prisma = new PrismaClient();

export const handleAdminCommands = async (command: string, args: string[], msg: any) => {
  const isGroup = msg.remoteJid.endsWith('@g.us');
  if (!isGroup) return false;

  // Evolution API v2 Context Info for mentions or replies
  const contextInfo = msg.raw?.message?.extendedTextMessage?.contextInfo || msg.raw?.message?.contextInfo;
  
  // Extract Target: Mentions or Reply
  const mentionedJid = contextInfo?.mentionedJid?.[0]; // First mentioned user (@user)
  const quotedJid = contextInfo?.participant; // Author of quoted message (Reply)
  
  const targetJid = quotedJid || mentionedJid;

  switch (command) {
    case 'promover':
      if (!targetJid) {
          await whatsapp.sendMessage(msg.remoteJid, "Pô, marca a pessoa ou responde a mensagem de quem tu quer promover!");
          return true;
      }
      await whatsapp.groupUpdateParticipant(msg.remoteJid, 'promote', [targetJid]);
      await whatsapp.sendMessage(msg.remoteJid, `👑 Cargo de patrão agora pra você: @${targetJid.split('@')[0]}!`);
      return true;

    case 'remover':
    case 'banir':
      if (!targetJid) {
          await whatsapp.sendMessage(msg.remoteJid, "Marca ou responde a mensagem de quem tu quer varrer!");
          return true;
      }
      await whatsapp.groupUpdateParticipant(msg.remoteJid, 'remove', [targetJid]);
      await whatsapp.sendMessage(msg.remoteJid, `🧹 Varri o @${targetJid.split('@')[0]} daqui. Sem massagem!`);
      return true;

    case 'demitir':
    case 'rebaixar':
      if (!targetJid) return true;
      await whatsapp.groupUpdateParticipant(msg.remoteJid, 'demote', [targetJid]);
      await whatsapp.sendMessage(msg.remoteJid, `📉 Perdeu o cargo, @${targetJid.split('@')[0]}! Volta pra base.`);
      return true;

    case 'adv':
      if (!targetJid) return true;
      await whatsapp.sendMessage(msg.remoteJid, `⚠️ Atenção @${targetJid.split('@')[0]}, tu tomou uma advertência! Próxima é vala.`);
      return true;

    default:
      return false;
  }
};
