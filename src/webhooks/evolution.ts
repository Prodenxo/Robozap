import { processMessage } from '../services/commandRouter';

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

  if (!textContent) return;

  const remoteJid = message.key.remoteJid;
  const participant = message.key.participant || remoteJid;

  // --- SUPER SCANNER DE CONTEXTO (Evolution v2) ---
  const context = 
    msgContent.extendedTextMessage?.contextInfo || 
    msgContent.imageMessage?.contextInfo || 
    msgContent.videoMessage?.contextInfo || 
    msgContent.stickerMessage?.contextInfo ||
    msgContent.documentWithCaptionMessage?.message?.documentMessage?.contextInfo ||
    message.messageContextInfo;

  // Busca o alvo em 4 lugares diferentes (Padrão v2, Padrão v1, Fallback, Mentions)
  const quotedParticipant = 
    context?.participant || 
    context?.quotedMessage?.key?.participant || 
    context?.remoteJid || // Caso de resposta em PV
    message.key.participant; // Último caso

  const mentionedJid = context?.mentionedJid || [];

  // MANDA PRO LOG O QUE ELE ACHOU
  console.log(`[WEBHOOK DEBUG] From: ${pushName} | Text: ${textContent}`);
  console.log(`[TARGET DEBUG] Quoted: ${quotedParticipant} | Mentions: ${mentionedJid.length}`);

  await processMessage({
    id: message.key.id,
    remoteJid,
    participant,
    pushName: message.pushName || 'Usuário',
    text: textContent,
    quoted: context?.quotedMessage,
    quotedParticipant: quotedParticipant, 
    mentionedJid: mentionedJid,
    messageType: Object.keys(msgContent)[0],
    raw: message
  });
};
