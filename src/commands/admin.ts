import { WhatsAppService } from '../services/whatsapp';
import { botTexts } from '../config/texts';
import { prisma } from '../services/database';
import { PermissionGuard } from '../core/Guards';
import { LidMapService } from '../services/lidMap';

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
  
  if (['promover', 'banir', 'remover', 'demitir', 'rebaixar', 'adv', 'ban', 'desban', 'desbanir'].includes(command)) {
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
    case 'ban': {
      const fs = require('fs');
      const path = require('path');

      // 1. Enviar figurinha de ban se existir
      const stickerPath = path.join(process.cwd(), 'assets', 'ban_sticker.png');
      if (fs.existsSync(stickerPath)) {
        try {
          await whatsapp.sendSticker(msg.remoteJid, fs.readFileSync(stickerPath));
        } catch (e) {
          console.error('[BAN] Erro ao enviar figurinha:', e);
        }
      }

      // 2. Enviar áudio de ban se existir
      const audioPath = path.join(process.cwd(), 'assets', 'ban_audio.mp3');
      if (fs.existsSync(audioPath)) {
        try {
          await whatsapp.sendMedia(msg.remoteJid, audioPath, 'audio');
        } catch (e) {
          console.error('[BAN] Erro ao enviar áudio:', e);
        }
      }

      // 3. Pequeno delay para garantir o envio das mídias antes do ban
      await new Promise(resolve => setTimeout(resolve, 2000));

      const resolvedBan = await whatsapp.groupUpdateParticipant(msg.remoteJid, 'remove', [targetJid!]);
      const mentionTextBan = await getMentionText(resolvedBan);
      await whatsapp.sendMessage(msg.remoteJid, `🧹 Varri o ${mentionTextBan} daqui. Sem massagem!`, [resolvedBan]);
      return true;
    }

    case 'desban':
    case 'desbanir':
      const resolvedAdd = await whatsapp.groupUpdateParticipant(msg.remoteJid, 'add', [targetJid!]);
      if (resolvedAdd.startsWith('invite:')) {
        const inviteCode = resolvedAdd.split(':')[1];
        const mentionTextAdd = await getMentionText(targetJid!);
        await whatsapp.sendMessage(msg.remoteJid, `⚠️ Não consegui adicionar ${mentionTextAdd} diretamente devido às configurações de privacidade dele ou por ter sido removido recentemente.\n\nEnvia o convite no privado dele ou manda ele entrar por aqui: https://chat.whatsapp.com/invite/${inviteCode}`, [targetJid!]);
      } else {
        const mentionTextAdd = await getMentionText(resolvedAdd);
        await whatsapp.sendMessage(msg.remoteJid, `✅ Trouxe o ${mentionTextAdd} de volta pro jogo!`, [resolvedAdd]);
      }
      return true;

    case 'demitir':
    case 'rebaixar':
      const resolvedDemote = await whatsapp.groupUpdateParticipant(msg.remoteJid, 'demote', [targetJid!]);
      const mentionTextDemote = await getMentionText(resolvedDemote);
      await whatsapp.sendMessage(msg.remoteJid, `📉 Perdeu o cargo, ${mentionTextDemote}! Volta pra base.`, [resolvedDemote]);
      return true;

    case 'apagar':
    case 'limpar': {
      const messageId = msg.quotedId;
      if (!messageId) {
        await whatsapp.sendMessage(msg.remoteJid, "Pô, responde a mensagem que tu quer apagar!");
        return true;
      }
      const botJid = await whatsapp.getBotJid();
      const participantJid = msg.quotedParticipant;
      const fromMe = participantJid === botJid || !participantJid;
      
      await whatsapp.deleteMessage(msg.remoteJid, messageId, fromMe, participantJid);
      return true;
    }

    case 'abrir': {
      const success = await whatsapp.updateGroupSetting(msg.remoteJid, 'not_announcement');
      if (success) {
        await whatsapp.sendMessage(msg.remoteJid, "🔓 *Grupo aberto!* Agora todos os membros podem enviar mensagens.");
      } else {
        await whatsapp.sendMessage(msg.remoteJid, "❌ Falha ao tentar abrir o grupo. Certifique-se de que o bot é administrador.");
      }
      return true;
    }

    case 'fechar': {
      const success = await whatsapp.updateGroupSetting(msg.remoteJid, 'announcement');
      if (success) {
        await whatsapp.sendMessage(msg.remoteJid, "🔒 *Grupo fechado!* Apenas administradores podem enviar mensagens agora.");
      } else {
        await whatsapp.sendMessage(msg.remoteJid, "❌ Falha ao tentar fechar o grupo. Certifique-se de que o bot é administrador.");
      }
      return true;
    }

    case 'modoadmin': {
      const mode = args[0]?.toLowerCase();
      const group = await (prisma as any).group.findUnique({
        where: { jid: msg.remoteJid }
      });
      if (!group) {
        await whatsapp.sendMessage(msg.remoteJid, "❌ Grupo não inicializado no banco de dados.");
        return true;
      }

      let currentSettings = group.settings ? (typeof group.settings === 'string' ? JSON.parse(group.settings) : group.settings) : {};
      if (typeof currentSettings !== 'object') currentSettings = {};

      if (['ligar', 'on', 'ativar', 'ativa'].includes(mode)) {
        currentSettings.adminMode = true;
        await (prisma as any).group.update({
          where: { id: group.id },
          data: { settings: currentSettings }
        });
        await whatsapp.sendMessage(msg.remoteJid, "🔒 *Modo Admin ativado!* Agora apenas administradores do grupo podem usar os comandos do bot.");
      } else if (['desligar', 'off', 'desativar', 'desativa'].includes(mode)) {
        currentSettings.adminMode = false;
        await (prisma as any).group.update({
          where: { id: group.id },
          data: { settings: currentSettings }
        });
        await whatsapp.sendMessage(msg.remoteJid, "🔓 *Modo Admin desativado!* Todos os membros podem usar os comandos novamente.");
      } else {
        const status = currentSettings.adminMode ? 'ativado' : 'desativado';
        await whatsapp.sendMessage(msg.remoteJid, `ℹ️ O Modo Admin está atualmente *${status}*.\n\nUse:\n.modoadmin ligar\n.modoadmin desligar`);
      }
      return true;
    }

    case 'ativos': {
      const group = await (prisma as any).group.findUnique({
        where: { jid: msg.remoteJid }
      });
      if (!group) {
        await whatsapp.sendMessage(msg.remoteJid, "❌ Grupo não inicializado no banco.");
        return true;
      }

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Buscar todos os logs de mensagens agrupados
      const rawParticipants = await (prisma as any).messageLog.groupBy({
        by: ['userJid'],
        where: {
          groupId: group.id,
          createdAt: { gte: sevenDaysAgo }
        },
        _count: {
          messageId: true
        }
      });

      // Consolida JIDs reais e LIDs
      const combinedMap = new Map<string, number>();
      for (const p of rawParticipants) {
        let canonicalJid = p.userJid;
        if (p.userJid.endsWith('@lid')) {
          const real = LidMapService.get(p.userJid);
          if (real) {
            canonicalJid = real;
          }
        }
        const count = p._count.messageId;
        combinedMap.set(canonicalJid, (combinedMap.get(canonicalJid) || 0) + count);
      }

      // Converte para array, ordena por contagem e pega os 10 primeiros
      const sortedParticipants = Array.from(combinedMap.entries())
        .map(([userJid, count]) => ({ userJid, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      if (sortedParticipants.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, "📈 Nenhuma atividade registrada no grupo nos últimos 7 dias.");
        return true;
      }

      const list = sortedParticipants.map(p => p.userJid);
      let text = `🏆 *RANKING DE ATIVIDADE - TOP 10 (ÚLTIMOS 7 DIAS)* 🏆\n\n`;
      
      sortedParticipants.forEach((p, idx) => {
        const number = p.userJid.split('@')[0];
        text += `${idx + 1}º. @${number} — *${p.count} mensagens*\n`;
      });

      await whatsapp.sendMessage(msg.remoteJid, text, list);
      return true;
    }

    case 'inativos':
    case 'desocupados':
    case 'passivos': {
      await whatsapp.syncGroupParticipants(msg.remoteJid);
      const group = await (prisma as any).group.findUnique({
        where: { jid: msg.remoteJid }
      });
      if (!group) {
        await whatsapp.sendMessage(msg.remoteJid, "❌ Grupo não inicializado no banco.");
        return true;
      }

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const allParticipants = await (prisma as any).groupParticipant.findMany({
        where: { groupId: group.id },
        select: { userJid: true }
      });

      // Agrupa logs de mensagens ativos nos últimos 7 dias
      const activeLogs = await (prisma as any).messageLog.groupBy({
        by: ['userJid'],
        where: {
          groupId: group.id,
          createdAt: { gte: sevenDaysAgo }
        },
        _count: {
          messageId: true
        }
      });

      // Consolidar contagens por JID canônico
      const countMap = new Map<string, number>();
      for (const log of activeLogs) {
        let canonicalJid = log.userJid;
        if (log.userJid.endsWith('@lid')) {
          const real = LidMapService.get(log.userJid);
          if (real) {
            canonicalJid = real;
          }
        }
        const count = log._count.messageId;
        countMap.set(canonicalJid, (countMap.get(canonicalJid) || 0) + count);
      }

      // Filtrar membros com menos de 50 mensagens
      const inactiveUsers: { userJid: string, count: number }[] = [];
      for (const p of allParticipants) {
        let canonicalJid = p.userJid;
        if (p.userJid.endsWith('@lid')) {
          const real = LidMapService.get(p.userJid);
          if (real) {
            canonicalJid = real;
          }
        }

        // Evitar duplicatas de participantes
        if (inactiveUsers.some(u => u.userJid === canonicalJid)) {
          continue;
        }

        const count = countMap.get(canonicalJid) || 0;
        if (count < 50) {
          inactiveUsers.push({ userJid: canonicalJid, count });
        }
      }

      // Ordenar os inativos por quantidade de mensagens crescente
      inactiveUsers.sort((a, b) => a.count - b.count);

      if (inactiveUsers.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, "🎉 *Nenhum inativo!* Todos os membros enviaram 50 ou mais mensagens nos últimos 7 dias.");
        return true;
      }

      const displayLimit = 30;
      const displayUsers = inactiveUsers.slice(0, displayLimit);
      const list = displayUsers.map(u => u.userJid);

      let text = `👻 *MEMBROS INATIVOS (< 50 MENSAGENS HÁ 7 DIAS)* 👻\n`;
      text += `Total de inativos: ${inactiveUsers.length} membros.\n\n`;

      displayUsers.forEach((u, idx) => {
        const number = u.userJid.split('@')[0];
        text += `${idx + 1}. @${number} — *${u.count} mensagens*\n`;
      });

      if (inactiveUsers.length > displayLimit) {
        text += `\n...e mais ${inactiveUsers.length - displayLimit} membros inativos.`;
      }

      await whatsapp.sendMessage(msg.remoteJid, text, list);
      return true;
    }

    case 'mensagens': {
      const user = targetJid || msg.participant;
      const group = await (prisma as any).group.findUnique({
        where: { jid: msg.remoteJid }
      });
      if (!group) {
        await whatsapp.sendMessage(msg.remoteJid, "❌ Grupo não inicializado no banco.");
        return true;
      }
      
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const count = await (prisma as any).messageLog.count({
        where: {
          groupId: group.id,
          userJid: user,
          createdAt: { gte: sevenDaysAgo }
        }
      });
      
      const number = user.split('@')[0];
      await whatsapp.sendMessage(msg.remoteJid, `📊 @${number} enviou *${count} mensagens* nos últimos 7 dias neste grupo.`, [user]);
      return true;
    }

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
              const fs = require('fs');
              const path = require('path');

              // 1. Enviar figurinha de ban se existir
              const stickerPath = path.join(process.cwd(), 'assets', 'ban_sticker.png');
              if (fs.existsSync(stickerPath)) {
                try {
                  await whatsapp.sendSticker(msg.remoteJid, fs.readFileSync(stickerPath));
                } catch (e) {}
              }

              // 2. Enviar áudio de ban se existir
              const audioPath = path.join(process.cwd(), 'assets', 'ban_audio.mp3');
              if (fs.existsSync(audioPath)) {
                try {
                  await whatsapp.sendMedia(msg.remoteJid, audioPath, 'audio');
                } catch (e) {}
              }

              // 3. Pequeno delay para garantir o envio antes da remoção
              await new Promise(resolve => setTimeout(resolve, 2000));

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

    case 'admins':
    case 'adms': {
      await whatsapp.syncGroupParticipants(msg.remoteJid);
      const participants: any[] = await (prisma as any).groupParticipant.findMany({ 
        where: { 
          group: { jid: msg.remoteJid },
          roleCode: { in: [1, 3] } // 1=Dono, 3=ADM
        },
        select: { userJid: true }
      });
      
      const list = await Promise.all(
        participants.map(async (u: any) => await whatsapp.resolveJid(u.userJid))
      );
      
      const adminMentions = list.map(jid => `@${jid.split('@')[0]}`).join(' ');
      const text = `👑 *OS CHEFES DO MORRO (ADMINS)* 👑\n\n${adminMentions}`;
      
      await whatsapp.sendMessage(msg.remoteJid, text, list);
      return true;
    }

    default:
      return false;
  }
};
