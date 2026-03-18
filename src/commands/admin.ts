import { WhatsAppService } from '../services/whatsapp';
import { botTexts } from '../config/texts';

const whatsapp = new WhatsAppService();

export const handleAdminCommands = async (command: string, args: string[], msg: any) => {
  const isGroup = msg.remoteJid.endsWith('@g.us');
  if (!isGroup) return false;

  // Extraction of target from our updated webhook info
  const targetJid = msg.quotedParticipant || msg.mentionedJid?.[0];
  
  if (['promover', 'banir', 'remover', 'demitir', 'rebaixar'].includes(command)) {
      console.log(`[ADMIN COMMAND] ${command} | Target Found: ${targetJid}`);
  }

  // Helper for pretty mentions (just @number)
  const mention = (jid: string) => `@${jid.split('@')[0]}`;

  switch (command) {
    case 'promover':
      if (!targetJid) {
          await whatsapp.sendMessage(msg.remoteJid, "Pô, marca a pessoa (@pessoa) ou responde a mensagem de quem tu quer promover!");
          return true;
      }
      await whatsapp.groupUpdateParticipant(msg.remoteJid, 'promote', [targetJid]);
      await whatsapp.sendMessage(msg.remoteJid, `👑 Cargo de patrão agora pra você: ${mention(targetJid)}!`, [targetJid]);
      return true;

    case 'remover':
    case 'banir':
      if (!targetJid) {
          await whatsapp.sendMessage(msg.remoteJid, "Marca (@pessoa) ou responde a mensagem de quem tu quer varrer!");
          return true;
      }
      await whatsapp.groupUpdateParticipant(msg.remoteJid, 'remove', [targetJid]);
      await whatsapp.sendMessage(msg.remoteJid, `🧹 Varri o ${mention(targetJid)} daqui. Sem massagem!`, [targetJid]);
      return true;

    case 'demitir':
    case 'rebaixar':
      if (!targetJid) return true;
      await whatsapp.groupUpdateParticipant(msg.remoteJid, 'demote', [targetJid]);
      await whatsapp.sendMessage(msg.remoteJid, `📉 Perdeu o cargo, ${mention(targetJid)}! Volta pra base.`, [targetJid]);
      return true;

    case 'adv':
      if (!targetJid) return true;
      await whatsapp.sendMessage(msg.remoteJid, `⚠️ Atenção ${mention(targetJid)}, tu tomou uma advertência! Próxima é vala.`, [targetJid]);
      return true;

    default:
      return false;
  }
};
