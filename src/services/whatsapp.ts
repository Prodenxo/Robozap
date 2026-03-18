import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const cleanValue = (val: string | undefined) => val?.replace(/['"]+/g, '').trim() || '';

export class WhatsAppService {
  private baseUrl: string;
  private apiKey: string;
  private instance: string;

  constructor() {
    this.baseUrl = cleanValue(process.env.EVOLUTION_API_URL);
    this.apiKey = cleanValue(process.env.EVOLUTION_API_KEY);
    this.instance = cleanValue(process.env.EVOLUTION_INSTANCE_NAME);
  }

  private get headers() {
    return { 'apikey': this.apiKey };
  }

  async sendMessage(remoteJid: string, text: string, mentions: string[] = []) {
    try {
      await axios.post(`${this.baseUrl}/message/sendText/${this.instance}`, {
        number: remoteJid,
        text: text,
        mentions: mentions,
        options: { 
            delay: 1200, 
            presence: 'composing', 
            linkPreview: false,
            mentions: mentions
        }
      }, { headers: this.headers });
    } catch (error: any) {
      console.error('Error sending message:', error.response?.data || error.message);
    }
  }

  // --- ADMIN ACTIONS (RETORNANDO O NÚMERO REAL) ---
  async groupUpdateParticipant(groupJid: string, action: 'add' | 'remove' | 'promote' | 'demote', participants: string[]) {
    try {
      const response = await axios.post(`${this.baseUrl}/group/updateParticipant/${this.instance}`, {
        groupJid: groupJid,
        action: action,
        participants: participants
      }, { headers: this.headers });

      // O "Pulo do Gato": Pegar o phone_number que o WhatsApp resolveu
      const resData = response.data?.updateParticipants?.[0];
      const realNumber = resData?.content?.attrs?.phone_number || resData?.jid || participants[0];
      
      console.log(`[EVOLUTION RESOLVED] LID: ${participants[0]} -> Real: ${realNumber}`);
      return realNumber;
    } catch (error: any) {
      console.error(`[EVOLUTION ERROR] ${action}:`, error.response?.data || error.message);
      return participants[0];
    }
  }

  async sendSticker(remoteJid: string, stickerData: any) {
    try {
      // If it's a URL or base64 from a previous step, send as is.
      // Evolution API accepts URL or base64.
      const sticker = typeof stickerData === 'string' ? stickerData : (stickerData.message?.imageMessage?.url || stickerData);

      await axios.post(`${this.baseUrl}/message/sendSticker/${this.instance}`, {
        number: remoteJid,
        sticker: sticker
      }, { headers: this.headers });
    } catch (error: any) {
      console.error('Error sending sticker:', error.response?.data || error.message);
    }
  }

  async deleteMessage(remoteJid: string, messageId: string) {
    try {
      await axios.post(`${this.baseUrl}/message/deleteMessage/${this.instance}`, {
        number: remoteJid,
        messageId: messageId
      }, { headers: this.headers });
    } catch (error: any) {
      console.error('Error deleting message:', error.response?.data || error.message);
    }
  }

  async sendMedia(remoteJid: string, mediaPath: string, type: 'audio' | 'video' | 'image') {
    try {
      const mediaBuffer = fs.readFileSync(mediaPath);
      const base64 = mediaBuffer.toString('base64');
      await axios.post(`${this.baseUrl}/message/sendMedia/${this.instance}`, {
        number: remoteJid,
        mediatype: type,
        mimetype: type === 'audio' ? 'audio/mpeg' : (type === 'image' ? 'image/jpeg' : 'video/mp4'),
        caption: type === 'audio' ? '' : 'Enviado por RoboZap',
        media: base64,
        fileName: path.basename(mediaPath)
      }, { headers: this.headers });
    } catch (error: any) {
      console.error('Error sending media:', error.response?.data || error.message);
    }
  }
}
