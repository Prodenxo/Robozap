import { WhatsAppService } from '../services/whatsapp';
import { botTexts } from '../config/texts';
import { prisma } from '../services/database';
import { PermissionGuard } from '../core/Guards';
import { LidMapService } from '../services/lidMap';
import { decryptMediaLocally } from './media';

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
      // Sincroniza participantes para popular o mapa LID→JID real
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

      const fullLidMap = LidMapService.getFullMap();

      // Função para obter JID canônico (sempre prefere o JID real)
      const getCanonical = (jid: string): string => {
        if (jid.endsWith('@lid')) {
          return fullLidMap[jid] || jid;
        }
        return jid;
      };

      // Consolida usando o mapa completo
      const consolidatedMap = new Map<string, number>();
      for (const p of rawParticipants) {
        const canonical = getCanonical(p.userJid);
        const count = p._count.messageId;
        consolidatedMap.set(canonical, (consolidatedMap.get(canonical) || 0) + count);
      }

      // Buscar participantes atuais do grupo para garantir que só mostramos quem está no grupo
      const allParticipants = await (prisma as any).groupParticipant.findMany({
        where: { groupId: group.id },
        select: { userJid: true }
      });

      const activeMemberJids = new Set<string>();
      for (const p of allParticipants) {
        activeMemberJids.add(getCanonical(p.userJid));
      }

      const botJid = await whatsapp.getBotJid();
      const canonicalBotJid = getCanonical(botJid);

      // Converte para array, filtra por membros atuais e remove o bot, ordena por contagem e pega os 10 primeiros
      const sortedParticipants = Array.from(consolidatedMap.entries())
        .map(([userJid, count]) => ({ userJid, count }))
        .filter(p => activeMemberJids.has(p.userJid) && p.userJid !== canonicalBotJid)
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

      // Buscar participantes COM roleCode para filtrar admins
      const allParticipants = await (prisma as any).groupParticipant.findMany({
        where: { groupId: group.id },
        select: { userJid: true, roleCode: true }
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

      const fullLidMap = LidMapService.getFullMap();

      // Função para obter JID canônico (sempre prefere o JID real)
      const getCanonical = (jid: string): string => {
        if (jid.endsWith('@lid')) {
          return fullLidMap[jid] || jid;
        }
        return jid;
      };

      // Consolidar contagens por JID canônico (junta LID + JID real)
      const countMap = new Map<string, number>();
      for (const log of activeLogs) {
        const canonicalJid = getCanonical(log.userJid);
        const count = log._count.messageId;
        countMap.set(canonicalJid, (countMap.get(canonicalJid) || 0) + count);
      }

      const botJid = await whatsapp.getBotJid();
      const canonicalBotJid = getCanonical(botJid);

      // Filtrar membros com menos de 50 mensagens (excluindo bot e admins)
      const inactiveUsers: { userJid: string, count: number }[] = [];
      const seenCanonical = new Set<string>();

      for (const p of allParticipants) {
        const canonicalJid = getCanonical(p.userJid);

        // Excluir o bot
        if (canonicalJid === canonicalBotJid) continue;

        // Excluir admins e donos (roleCode: 1=Dono, 2=ADM_Confiavel, 3=ADM)
        if (p.roleCode <= 3) continue;

        // Evitar duplicatas de participantes
        if (seenCanonical.has(canonicalJid)) continue;
        seenCanonical.add(canonicalJid);

        // Obter contagem consolidada
        const count = countMap.get(canonicalJid) || 0;

        if (count < 50) {
          inactiveUsers.push({ userJid: canonicalJid, count });
        }
      }

      // Ordenar os inativos por quantidade de mensagens crescente
      inactiveUsers.sort((a, b) => a.count - b.count);

      if (inactiveUsers.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, "🎉 *Nenhum inativo!* Todos os membros (não-admin) enviaram 50 ou mais mensagens nos últimos 7 dias.");
        return true;
      }

      const displayLimit = 30;
      const displayUsers = inactiveUsers.slice(0, displayLimit);
      const list = displayUsers.map(u => u.userJid);

      let text = `👻 *MEMBROS INATIVOS (< 50 MENSAGENS HÁ 7 DIAS)* 👻\n`;
      text += `Total de inativos: ${inactiveUsers.length} membros.\n`;
      text += `_(Admins e donos são excluídos da lista)_\n\n`;

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

    case 'zerar':
    case 'zerar.logs':
    case 'limpar.logs': {
      const group = await (prisma as any).group.findUnique({
        where: { jid: msg.remoteJid }
      });
      if (!group) {
        await whatsapp.sendMessage(msg.remoteJid, "❌ Grupo não inicializado no banco.");
        return true;
      }

      await (prisma as any).messageLog.deleteMany({
        where: { groupId: group.id }
      });

      await (prisma as any).groupParticipant.updateMany({
        where: { groupId: group.id },
        data: { messagesSent: 0 }
      });

      await whatsapp.sendMessage(msg.remoteJid, "🧹 *Logs de mensagens zerados com sucesso para este grupo!*");
      return true;
    }

    case 'alertaprog':
    case 'alerta.programado': {
      const group = await (prisma as any).group.findUnique({
        where: { jid: msg.remoteJid }
      });
      if (!group) {
        await whatsapp.sendMessage(msg.remoteJid, "❌ Grupo não inicializado no banco.");
        return true;
      }

      let currentSettings = group.settings ? (typeof group.settings === 'string' ? JSON.parse(group.settings) : group.settings) : {};
      if (typeof currentSettings !== 'object') currentSettings = {};

      const option = args[0]?.toLowerCase();

      // Se não passou argumentos, exibe o status atual
      if (!option) {
        const alert = (currentSettings as any).scheduledAlert;
        if (!alert || !alert.active) {
          await whatsapp.sendMessage(msg.remoteJid, "ℹ️ *Alerta programado está desativado.* \n\nUse: `.alertaprog <tempo> <mensagem>` para configurar um novo alerta.\nExemplos de tempo: `30m` (30 minutos), `2h` (2 horas), `10s` (10 segundos).");
          return true;
        }

        let intervalMs = Number(alert.intervalMs);
        if (isNaN(intervalMs) || intervalMs <= 0) {
          const intervalHours = Number(alert.intervalHours);
          if (!isNaN(intervalHours) && intervalHours > 0) {
            intervalMs = intervalHours * 60 * 60 * 1000;
          }
        }

        const next = new Date(new Date(alert.lastSent || 0).getTime() + intervalMs);
        const mediaStatus = alert.mediaBase64 ? "Sim 📸" : "Não";
        const intervalLabel = alert.intervalText || `${alert.intervalHours} horas`;

        await whatsapp.sendMessage(
          msg.remoteJid,
          `⚙️ *STATUS DO ALERTA PROGRAMADO* ⚙️\n\n` +
          `• *Status*: Ativo ✅\n` +
          `• *Intervalo*: A cada ${intervalLabel}\n` +
          `• *Mídia/Foto*: ${mediaStatus}\n` +
          `• *Próximo envio*: ${next.toLocaleString('pt-BR')}\n` +
          `• *Mensagem*:\n"${alert.text}"\n\n` +
          `Para desativar, use: \`.alertaprog off\``
        );
        return true;
      }

      // Desativar o alerta
      if (['off', 'desativar', 'parar', 'cancelar'].includes(option)) {
        if (!(currentSettings as any).scheduledAlert) {
          (currentSettings as any).scheduledAlert = {};
        }
        (currentSettings as any).scheduledAlert.active = false;

        await (prisma as any).group.update({
          where: { id: group.id },
          data: { settings: currentSettings }
        });

        await whatsapp.sendMessage(msg.remoteJid, "🔒 *Alerta programado desativado com sucesso!*");
        return true;
      }

      // Configurar novo alerta com tempo flexível (ex: 30m, 2h, 10s)
      const timeMatch = option.match(/^(\d+)(h|m|s)?$/i);
      if (!timeMatch) {
        await whatsapp.sendMessage(msg.remoteJid, "❌ Formato de tempo inválido. Use números seguidos de h (horas), m (minutos) ou s (segundos).\n\nExemplos:\n• `.alertaprog 30m Bora!` (30 minutos)\n• `.alertaprog 2h Bora!` (2 horas)\n• `.alertaprog 15s Bora!` (15 segundos)");
        return true;
      }

      const timeValue = Number(timeMatch[1]);
      const timeUnit = (timeMatch[2] || 'h').toLowerCase();

      let intervalMs = 0;
      let intervalText = '';
      if (timeUnit === 'h') {
        intervalMs = timeValue * 60 * 60 * 1000;
        intervalText = `${timeValue} hora(s)`;
      } else if (timeUnit === 'm') {
        intervalMs = timeValue * 60 * 1000;
        intervalText = `${timeValue} minuto(s)`;
      } else if (timeUnit === 's') {
        intervalMs = timeValue * 1000;
        intervalText = `${timeValue} segundo(s)`;
      }

      const textMessage = args.slice(1).join(' ').trim();
      if (!textMessage) {
        await whatsapp.sendMessage(msg.remoteJid, `❌ Por favor, digite a mensagem do alerta.\nExemplo: \`.alertaprog ${option} Bora reagir!\``);
        return true;
      }

      // Verificar se há foto ou vídeo anexado
      const msgContent = msg.raw?.message || {};
      const quotedContent = msg.quoted || {};

      const findMedia = (m: any): any => {
          if (!m || typeof m !== 'object') return null;
          if ((m.url || m.directPath) && m.mediaKey) return m;
          for (const key in m) {
              const res = findMedia(m[key]);
              if (res) return res;
          }
          return null;
      };

      const mediaContent = findMedia(msgContent);
      const quotedMediaContent = findMedia(quotedContent);
      const targetMedia = quotedMediaContent || mediaContent;

      let mediaBase64: string | null = null;
      let mediaType: string | null = null;

      if (targetMedia) {
        const mime = targetMedia.mimetype || '';
        if (mime.startsWith('image/')) mediaType = 'image';
        else if (mime.startsWith('video/')) mediaType = 'video';
        else if (mime.startsWith('audio/')) mediaType = 'audio';

        if (mediaType) {
          await whatsapp.sendMessage(msg.remoteJid, "📸 *Fazendo download e salvando a mídia para o agendamento...*");
          mediaBase64 = await decryptMediaLocally(targetMedia);
          if (!mediaBase64) {
            const isQuoted = !!quotedMediaContent;
            const targetMessageId = isQuoted ? msg.quotedId : msg.id;
            if (targetMessageId) {
              mediaBase64 = await whatsapp.getBase64FromMessage({ id: targetMessageId });
            }
          }
        }
      }

      (currentSettings as any).scheduledAlert = {
        intervalMs,
        intervalText,
        text: textMessage,
        mediaBase64,
        mediaType,
        lastSent: new Date().toISOString(), // Começa a contar a partir de agora
        active: true
      };

      await (prisma as any).group.update({
        where: { id: group.id },
        data: { settings: currentSettings }
      });

      const mediaDetail = mediaBase64 ? " com imagem/vídeo" : "";
      await whatsapp.sendMessage(
        msg.remoteJid,
        `✅ *Alerta programado ativo!*\n\n` +
        `• O robô enviará a mensagem${mediaDetail} a cada *${intervalText}* marcando todos silenciosamente.\n` +
        `• Primeiro envio agendado para daqui a *${intervalText}*.`
      );
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
      
      const msgContent = msg.raw?.message || {};
      const quotedContent = msg.quoted || {};

      const findMedia = (m: any): any => {
          if (!m || typeof m !== 'object') return null;
          if ((m.url || m.directPath) && m.mediaKey) return m;
          for (const key in m) {
              const res = findMedia(m[key]);
              if (res) return res;
          }
          return null;
      };

      const mediaContent = findMedia(msgContent);
      const quotedMediaContent = findMedia(quotedContent);
      const targetMedia = quotedMediaContent || mediaContent;

      if (targetMedia) {
        const mime = targetMedia.mimetype || '';
        const isImage = mime.startsWith('image/');
        const isVideo = mime.startsWith('video/');
        const isAudio = mime.startsWith('audio/');
        
        let type: 'image' | 'video' | 'audio' = 'image';
        if (isVideo) type = 'video';
        if (isAudio) type = 'audio';

        // Tentar descriptografar localmente
        let base64 = await decryptMediaLocally(targetMedia);
        if (!base64) {
          const isQuoted = !!quotedMediaContent;
          const targetMessageId = isQuoted ? msg.quotedId : msg.id;
          if (targetMessageId) {
            base64 = await whatsapp.getBase64FromMessage({ id: targetMessageId });
          }
        }

        if (base64) {
          await whatsapp.sendMedia(
            msg.remoteJid,
            base64,
            type,
            undefined, // quotedMsgId
            text,      // caption
            list       // mentions
          );
          return true;
        }
      }

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

    case 'boasvindas':
    case 'welcome': {
      const group = await (prisma as any).group.findUnique({
        where: { jid: msg.remoteJid }
      });
      if (!group) {
        await whatsapp.sendMessage(msg.remoteJid, "❌ Grupo não inicializado no banco de dados.");
        return true;
      }

      let currentWelcome = group.welcomeConfig ? (typeof group.welcomeConfig === 'string' ? JSON.parse(group.welcomeConfig) : group.welcomeConfig) : {};
      if (typeof currentWelcome !== 'object' || currentWelcome === null) currentWelcome = {};

      const option = args[0]?.toLowerCase();

      // Se não passou argumentos, exibe o status atual e ajuda
      if (!option) {
        const active = currentWelcome.active !== false; // ativo por padrão
        const customMessage = currentWelcome.message;

        let statusText = `👋 *CONFIGURAÇÃO DE BOAS-VINDAS*\n\n`;
        statusText += `• *Status*: ${active ? 'Ativado ✅' : 'Desativado ❌'}\n`;
        statusText += `• *Tipo*: ${customMessage ? 'Personalizada ✍️' : 'Mensagem Padrão ⚙️'}\n\n`;

        if (customMessage) {
          statusText += `*Mensagem Atual*:\n${customMessage}\n\n`;
        } else {
          statusText += `*Mensagem Padrão*:\n👋 Bem-vindo ao [Nome do Grupo]...\n\n`;
        }

        statusText += `💡 *Como configurar:* \n`;
        statusText += `- \`.boasvindas <mensagem>\` -> Define uma mensagem personalizada.\n`;
        statusText += `- \`.boasvindas off\` -> Desativa as boas-vindas.\n`;
        statusText += `- \`.boasvindas on\` -> Ativa as boas-vindas.\n`;
        statusText += `- \`.boasvindas reset\` -> Volta para a mensagem padrão.\n\n`;
        statusText += `ℹ️ _Use \`{mencoes}\` no texto para marcar os novos membros e \`{grupo}\` para o nome do grupo._`;

        await whatsapp.sendMessage(msg.remoteJid, statusText);
        return true;
      }

      if (['off', 'desativar', 'desligar'].includes(option)) {
        currentWelcome.active = false;
        await (prisma as any).group.update({
          where: { id: group.id },
          data: { welcomeConfig: currentWelcome }
        });
        await whatsapp.sendMessage(msg.remoteJid, "🔒 *Boas-vindas desativadas com sucesso!* Nenhuma mensagem será enviada quando novos membros entrarem.");
        return true;
      }

      if (['on', 'ativar', 'ligar'].includes(option)) {
        currentWelcome.active = true;
        await (prisma as any).group.update({
          where: { id: group.id },
          data: { welcomeConfig: currentWelcome }
        });
        await whatsapp.sendMessage(msg.remoteJid, "✅ *Boas-vindas ativadas!*");
        return true;
      }

      if (['reset', 'padrao', 'restaurar', 'padrão'].includes(option)) {
        currentWelcome.active = true;
        currentWelcome.message = null;
        await (prisma as any).group.update({
          where: { id: group.id },
          data: { welcomeConfig: currentWelcome }
        });
        await whatsapp.sendMessage(msg.remoteJid, "🔄 *Mensagem de boas-vindas restaurada para o padrão!*");
        return true;
      }

      // Caso contrário, o usuário forneceu uma mensagem
      // Extraímos diretamente de msg.text para preservar a formatação original (quebras de linha, espaços etc)
      const rawText = msg.text.trim();
      const commandIndex = rawText.toLowerCase().indexOf(command.toLowerCase());
      let newMessage = '';
      if (commandIndex !== -1) {
        newMessage = rawText.slice(commandIndex + command.length).trim();
      } else {
        newMessage = args.join(' ').trim();
      }
      currentWelcome.active = true;
      currentWelcome.message = newMessage;

      await (prisma as any).group.update({
        where: { id: group.id },
        data: { welcomeConfig: currentWelcome }
      });

      await whatsapp.sendMessage(
        msg.remoteJid,
        `✅ *Mensagem de boas-vindas personalizada salva e ativada!*\n\n*Texto Salvo*:\n${newMessage}`
      );
      return true;
    }

    default:
      return false;
  }
};
