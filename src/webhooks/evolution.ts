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
  const senderName = message.pushName || 'Usuário';

  // --- SUPER SCANNER DE CONTEXTO (Evolution v2) ---
  const context = 
    msgContent.extendedTextMessage?.contextInfo || 
    msgContent.imageMessage?.contextInfo || 
    msgContent.videoMessage?.contextInfo || 
    msgContent.stickerMessage?.contextInfo ||
    message.messageContextInfo;

  // Busca o alvo em vários lugares diferentes para evitar 'undefined'
  const quotedParticipant = 
    context?.participant || 
    context?.quotedMessage?.key?.participant || 
    (remoteJid.endsWith('@s.whatsapp.net') ? remoteJid : undefined);

  const mentionedJid = context?.mentionedJid || [];

  // LOG DE DEPURAÇÃO CORRIGIDO
  console.log(`[WEBHOOK] Mensagem de: ${senderName} (${remoteJid})`);
  console.log(`[TARGET IDENTIFIER] Quoted: ${quotedParticipant} | Mentions: ${mentionedJid.join(', ')}`);

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
