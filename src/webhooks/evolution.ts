import { processMessage } from '../services/commandRouter';

export const handleWebhook = async (data: any) => {
  // Evolution API sends messages in different event types
  // The most common is "messages.upsert"
  if (data.event !== 'messages.upsert') return;

  const message = data.data;
  if (!message) return;

  // Skip if it's from the bot itself
  if (message.key.fromMe) return;

  // Extract text content
  const textContent = 
    message.message?.conversation || 
    message.message?.extendedTextMessage?.text || 
    message.message?.imageMessage?.caption || 
    message.message?.videoMessage?.caption || 
    '';

  if (!textContent) return;

  const remoteJid = message.key.remoteJid;
  const participant = message.key.participant || remoteJid; // participant for groups, remoteJid for PV
  
  await processMessage({
    id: message.key.id,
    remoteJid,
    participant,
    pushName: message.pushName,
    text: textContent,
    quoted: message.message?.extendedTextMessage?.contextInfo?.quotedMessage,
    messageType: Object.keys(message.message || {})[0],
    raw: message // Pass full object for media access
  });
};
