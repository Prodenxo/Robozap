import { processMessage } from '../services/commandRouter';

export const handleWebhook = async (data: any) => {
  if (data.event !== 'messages.upsert') return;

  const message = data.data;
  if (!message || message.key.fromMe) return;

  const msgContent = message.message || {};
  
  // Get text from anywhere
  const textContent = 
    msgContent.conversation || 
    msgContent.extendedTextMessage?.text || 
    msgContent.imageMessage?.caption || 
    msgContent.videoMessage?.caption || 
    '';

  if (!textContent) return;

  const remoteJid = message.key.remoteJid;
  const participant = message.key.participant || remoteJid;

  // EVOLUTION V2 Target extraction (Super deep search)
  // Quoted participant can be in several places depending on message type
  const context = 
    msgContent.extendedTextMessage?.contextInfo || 
    msgContent.imageMessage?.contextInfo || 
    msgContent.videoMessage?.contextInfo || 
    msgContent.stickerMessage?.contextInfo ||
    message.messageContextInfo; // Fallback for some v2 structures

  const quotedParticipant = context?.participant || context?.quotedMessage?.key?.participant;
  const mentionedJid = context?.mentionedJid || [];

  await processMessage({
    id: message.key.id,
    remoteJid,
    participant,
    pushName: message.pushName || 'Usuário',
    text: textContent,
    quoted: context?.quotedMessage,
    quotedParticipant, // THIS IS THE KEY
    mentionedJid,      // THIS IS THE KEY
    messageType: Object.keys(msgContent)[0],
    raw: message
  });
};
