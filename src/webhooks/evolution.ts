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

  if (!textContent) return;

  const remoteJid = message.key.remoteJid;
  const participant = message.key.participant || remoteJid;
  const senderName = message.pushName || 'Usuário';

  // --- OMNI-SCANNER v3 ---
  // Procuramos 'contextInfo' em qualquer nível da mensagem
  const context = findField(message, 'contextInfo');
  
  // O alvo pode ser 'participant' (em respostas) ou 'mentionedJid' (em marcações)
  const quotedParticipant = context?.participant || context?.quotedMessage?.key?.participant;
  const mentionedJid = context?.mentionedJid || [];

  // LOG DE DEPURAÇÃO PARA MATAR A CHARADA
  console.log(`[WEBHOOK] ${senderName} mandou: ${textContent}`);
  console.log(`[RADAR] Alvo Encontrado: ${quotedParticipant || (mentionedJid.length > 0 ? mentionedJid[0] : 'NENHUM')}`);

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
