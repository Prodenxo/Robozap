import { WhatsAppService } from '../services/whatsapp';
import { botTexts } from '../config/texts';
import { prisma } from '../services/database';
import { PermissionGuard } from '../core/Guards';

const whatsapp = new WhatsAppService();

export const handleAdminCommands = async (command: string, args: string[], msg: any) => {
  const isGroup = msg.remoteJid.endsWith('@g.us');
  if (!isGroup) return false;

  await whatsapp.syncGroupParticipants(msg.remoteJid);

  const hasPermission = await PermissionGuard.canExecute(msg.participant, msg.remoteJid, PermissionGuard.ROLES.ADM);
  if (!hasPermission) {
      await whatsapp.sendMessage(msg.remoteJid, botTexts.admin.noPerm);
      return true;
  }

  const rawTargetJid = msg.quotedParticipant || msg.mentionedJid?.[0];
  const targetJid = rawTargetJid ? await whatsapp.resolveJid(rawTargetJid) : null;
  
  if (['promover', 'banir', 'remover', 'demitir', 'rebaixar', 'adv'].includes(command)) {
      if (!targetJid) {
          await whatsapp.sendMessage(msg.remoteJid, "Pô, marca a pessoa (@pessoa) ou responde a mensagem de quem tu quer mexer!");
          return true;
      }
  }

  // FUNÇÃO DE MARCAÇÃO REAL (O WhatsApp só "pinta" de verde se for o número)
  const getMentionText = async (jid: string) => {
      const number = jid.split('@')[0];
      return `@${number}`;
  };

  switch (command) {
    case 'promover':
      const resolvedPromote = await whatsapp.groupUpdateParticipant(msg.remoteJid, 'promote', [targetJid!]);
      const mentionTextPromote = await getMentionText(resolvedPromote);
      await whatsapp.sendMessage(msg.remoteJid, `👑 Cargo de patrão agora pra você: ${mentionTextPromote}!`, [resolvedPromote]);
      return true;

    case 'remover':
    case 'banir':
      const resolvedBan = await whatsapp.groupUpdateParticipant(msg.remoteJid, 'remove', [targetJid!]);
      const mentionTextBan = await getMentionText(resolvedBan);
      await whatsapp.sendMessage(msg.remoteJid, `🧹 Varri o ${mentionTextBan} daqui. Sem massagem!`, [resolvedBan]);
      return true;

    case 'demitir':
    case 'rebaixar':
      const resolvedDemote = await whatsapp.groupUpdateParticipant(msg.remoteJid, 'demote', [targetJid!]);
      const mentionTextDemote = await getMentionText(resolvedDemote);
      await whatsapp.sendMessage(msg.remoteJid, `📉 Perdeu o cargo, ${mentionTextDemote}! Volta pra base.`, [resolvedDemote]);
      return true;

    case 'apagar':
    case 'limpar':
      const messageId = msg.quotedId;
      if (!messageId) {
        await whatsapp.sendMessage(msg.remoteJid, "Pô, responde a mensagem que tu quer apagar!");
        return true;
      }
      await whatsapp.deleteMessage(msg.remoteJid, messageId);
      return true;

    case 'todos':
    case 'marcar': {
      await whatsapp.syncGroupParticipants(msg.remoteJid);
      const participants: any[] = await (prisma as any).groupParticipant.findMany({ 
        where: { group: { jid: msg.remoteJid } },
        select: { userJid: true }
      });
      
      const list = await Promise.all(
        participants.map(async (u: any) => await whatsapp.resolveJid(u.userJid))
      );
      
      const text = `📢 *FILHOTE CHAMANDO A TROPA!* 📢\n\n${args.join(' ') || 'Bora reagir, bando de desocupado!'}`;
      
      await whatsapp.sendMessage(msg.remoteJid, text, list);
      return true;
    }

    case 'adv':
    case 'alertar':
    case 'avisar': {
      const mentionTextAdv = await getMentionText(targetJid!);
      
      // 1. Incrementamos as ADVs (tentamos pelo JID resolvido ou pelo original)
      await (prisma as any).groupParticipant.updateMany({
        where: { 
            OR: [{ userJid: targetJid! }, { userJid: rawTargetJid || undefined }],
            group: { jid: msg.remoteJid } 
        },
        data: { warningsCount: { increment: 1 } }
      });
      
      // 2. Buscamos o valor atualizado
      const part = await (prisma as any).groupParticipant.findFirst({
          where: { 
              OR: [{ userJid: targetJid! }, { userJid: rawTargetJid || undefined }],
              group: { jid: msg.remoteJid } 
          },
          select: { warningsCount: true }
      });

      const advCount = part?.warningsCount || 1;
      const mentionList = [targetJid].filter(Boolean) as string[];

      if (advCount >= 2) {
          await whatsapp.sendMessage(msg.remoteJid, `⚠️ ${mentionTextAdv} atingiu o limite de *2 advertências* e será removido. Vala! 🧹`, mentionList);
          
          setTimeout(async () => {
              await whatsapp.groupUpdateParticipant(msg.remoteJid, 'remove', [rawTargetJid || targetJid!]);
              await (prisma as any).groupParticipant.updateMany({
                  where: { OR: [{ userJid: targetJid! }, { userJid: rawTargetJid || undefined }], group: { jid: msg.remoteJid } },
                  data: { warningsCount: 0 }
              });
          }, 2000);
      } else {
          await whatsapp.sendMessage(msg.remoteJid, `⚠️ Atenção ${mentionTextAdv}, você tomou uma advertência! Agora você tem *${advCount}/2*. Se tomar mais uma, é ban!`, mentionList);
      }
      return true;
    }

    default:
      return false;
  }
};
