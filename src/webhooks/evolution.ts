import { processMessage } from '../services/commandRouter';

// Função auxiliar para achar o JID em qualquer lugar da mensagem (OMNI-SCANNER)
const findField = (obj: any, fieldName: string): any => {
  if (!obj || typeof obj !== 'object') return null;
  if (obj[fieldName]) return obj[fieldName];
  for (const key in obj) {
    const res = findField(obj[key], fieldName);
    if (res) return res;
  }
  return null;
};

export const handleWebhook = async (data: any) => {
  if (data.event !== 'messages.upsert') return;

  const message = data.data;
  if (!message || message.key.fromMe) return;

  const msgContent = message.message || {};
  const textContent = 
    msgContent.conversation || 
    msgContent.extendedTextMessage?.text || 
    msgContent.imageMessage?.caption || 
    msgContent.videoMessage?.caption || 
    '';

  // --- FILTRO DE COMANDO ---
  // Só processamos e logamos se a mensagem começar com o ponto (.)
  if (!textContent.trim().startsWith('.')) return;

  const remoteJid = message.key.remoteJid;
  const participant = message.key.participant || remoteJid;
  const senderName = message.pushName || 'Usuário';

  // --- OMNI-SCANNER v3 ---
  const context = findField(message, 'contextInfo');
  const quotedParticipant = context?.participant || context?.quotedMessage?.key?.participant;
  const mentionedJid = context?.mentionedJid || [];

  // LOG SÓ PARA COMANDOS AGORA
  console.log(`[COMANDO RECEBIDO] ${senderName}: ${textContent}`);
  console.log(`[RADAR] Alvo: ${quotedParticipant || (mentionedJid.length > 0 ? mentionedJid[0] : 'NENHUM')}`);

  await processMessage({
    id: message.key.id,
    remoteJid,
    participant,
    pushName: senderName,
    text: textContent,
    quoted: context?.quotedMessage,
    quotedParticipant: quotedParticipant, 
    mentionedJid: mentionedJid,
    messageType: Object.keys(msgContent)[0],
    raw: message
  });
};
