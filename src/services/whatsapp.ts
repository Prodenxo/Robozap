import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Helper to remove any potential quotes from env variables (common in Easypanel/Docker)
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

  async sendMessage(remoteJid: string, text: string) {
    try {
      await axios.post(
        `${this.baseUrl}/message/sendText/${this.instance}`,
        {
          number: remoteJid,
          text: text,
          options: {
            delay: 1200,
            presence: 'composing',
            linkPreview: false
          }
        },
        {
          headers: {
            'apikey': this.apiKey
          }
        }
      );
    } catch (error: any) {
      console.error('Error sending message:', error.response?.data || error.message);
    }
  }

  async sendSticker(remoteJid: string, stickerData: any) {
    try {
      let stickerPayload: any = { number: remoteJid };

      if (typeof stickerData === 'string') {
        stickerPayload.sticker = stickerData;
      } else {
        stickerPayload.sticker = stickerData;
      }

      await axios.post(
        `${this.baseUrl}/message/sendSticker/${this.instance}`,
        stickerPayload,
        {
          headers: { 'apikey': this.apiKey }
        }
      );
    } catch (error: any) {
      console.error('Error sending sticker:', error.response?.data || error.message);
    }
  }

  async sendMedia(remoteJid: string, mediaPath: string, type: 'audio' | 'video' | 'image') {
    try {
      const mediaBuffer = fs.readFileSync(mediaPath);
      const base64 = mediaBuffer.toString('base64');
      const fileName = path.basename(mediaPath);
      const mimeType = type === 'audio' ? 'audio/mpeg' : (type === 'image' ? 'image/jpeg' : 'video/mp4');

      await axios.post(
        `${this.baseUrl}/message/sendMedia/${this.instance}`,
        {
          number: remoteJid,
          mediatype: type,
          mimetype: mimeType,
          caption: type === 'audio' ? '' : 'Enviado por RoboZap',
          media: base64,
          fileName: fileName
        },
        {
          headers: { 'apikey': this.apiKey }
        }
      );
    } catch (error: any) {
      console.error('Error sending media:', error.response?.data || error.message);
    }
  }
}
