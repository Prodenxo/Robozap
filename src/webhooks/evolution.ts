import { processMessage } from '../services/commandRouter';

export const handleWebhook = async (data: any) => {
  if (data.event !== 'messages.upsert') return;

  const message = data.data;
  if (!message || message.key.fromMe) return;

  // Extract text content from various message types
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

  // ROBUST CONTEXT EXTRACTION
  const contextInfo = 
    msgContent.extendedTextMessage?.contextInfo || 
    msgContent.imageMessage?.contextInfo || 
    msgContent.videoMessage?.contextInfo ||
    msgContent.buttonsResponseMessage?.contextInfo ||
    message.messageContextInfo;

  await processMessage({
    id: message.key.id,
    remoteJid,
    participant,
    pushName: message.pushName || 'Usuário',
    text: textContent,
    quoted: contextInfo?.quotedMessage,
    quotedParticipant: contextInfo?.participant, // THE REAL TARGET FOR REPLIES
    mentionedJid: contextInfo?.mentionedJid || [], // TARGETS FOR MENTIONS
    messageType: Object.keys(msgContent)[0],
    raw: message
  });
};
