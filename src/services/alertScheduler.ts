import { prisma } from './database';
import { WhatsAppService } from './whatsapp';
import { LidMapService } from './lidMap';

const whatsapp = new WhatsAppService();

export async function checkScheduledAlerts() {
  try {
    const now = new Date();
    // Buscar todos os grupos no banco
    const groups = await prisma.group.findMany();

    for (const group of groups) {
      let settings = group.settings;
      if (!settings) continue;
      
      // Garante que é um objeto
      if (typeof settings === 'string') {
        try {
          settings = JSON.parse(settings);
        } catch (e) {
          continue;
        }
      }

      const alert = (settings as any)?.scheduledAlert;
      if (!alert || !alert.active) continue;

      let intervalMs = Number(alert.intervalMs);
      if (isNaN(intervalMs) || intervalMs <= 0) {
        const intervalHours = Number(alert.intervalHours);
        if (!isNaN(intervalHours) && intervalHours > 0) {
          intervalMs = intervalHours * 60 * 60 * 1000;
        }
      }

      if (intervalMs <= 0) continue;

      const lastSent = alert.lastSent ? new Date(alert.lastSent) : new Date(0);
      const nextTrigger = lastSent.getTime() + intervalMs;

      if (now.getTime() >= nextTrigger) {
        console.log(`[SCHEDULER] Disparando alerta programado para o grupo ${group.jid}`);

        // Sincroniza participantes para marcar todo mundo silenciosamente
        await whatsapp.syncGroupParticipants(group.jid);
        const participants = await prisma.groupParticipant.findMany({
          where: { groupId: group.id },
          select: { userJid: true }
        });

        const list = await Promise.all(
          participants.map(async (u: any) => await whatsapp.resolveJid(u.userJid))
        );

        const text = alert.text || '📢 *Alerta Programado!*';

        if (alert.mediaBase64 && alert.mediaType) {
          await whatsapp.sendMedia(
            group.jid,
            alert.mediaBase64,
            alert.mediaType,
            undefined, // quotedMsgId
            text,
            list
          );
        } else {
          await whatsapp.sendMessage(group.jid, text, list);
        }

        // Atualiza o lastSent
        alert.lastSent = now.toISOString();
        
        await prisma.group.update({
          where: { id: group.id },
          data: { settings: settings as any }
        });
      }
    }
  } catch (error) {
    console.error('[SCHEDULER ERROR]:', error);
  }
}

export function startAlertScheduler() {
  console.log('[SCHEDULER] Inicializando agendador de alertas (intervalo: 10 segundos)...');
  // Roda o check a cada 10 segundos
  setInterval(checkScheduledAlerts, 10 * 1000);
}
