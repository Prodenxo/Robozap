import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

export class WhatsAppService {
  private baseUrl: string;
  private apiKey: string;
  private instance: string;

  constructor() {
    this.baseUrl = process.env.EVOLUTION_API_URL || '';
    this.apiKey = process.env.EVOLUTION_API_KEY || '';
    this.instance = process.env.EVOLUTION_INSTANCE_NAME || '';
  }

  async sendMessage(remoteJid: string, text: string) {
    try {
      await axios.post(
        `${this.baseUrl}/message/sendText/${this.instance}`,
        {
          number: remoteJid,
          options: {
            delay: 1200,
            presence: 'composing',
            linkPreview: false
          },
          textMessage: {
            text: text
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
      } else if (stickerData.message?.imageMessage?.url) {
        // If it's a message object from evolution, we can try to pass the media content
        // This depends on evolution API version, but usually we can send the messageId to convert
        stickerPayload.base64 = stickerData.message.imageMessage.url; // Or implementation-specific
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
      // For local files, we'd normally need to upload or use a base64 string
      // Evolution API supports sending base64 or a public URL.
      // Since this is local, we'll convert to base64.
      const mediaBuffer = fs.readFileSync(mediaPath);
      const base64 = mediaBuffer.toString('base64');
      const fileName = path.basename(mediaPath);
      const mimeType = type === 'audio' ? 'audio/mp4' : (type === 'image' ? 'image/jpeg' : 'video/mp4');

      await axios.post(
        `${this.baseUrl}/message/sendMedia/${this.instance}`,
        {
          number: remoteJid,
          mediaMessage: {
            mediatype: type,
            fileName: fileName,
            caption: type === 'audio' ? '' : 'Enviado por RoboZap',
            media: base64
          }
        },
        {
          headers: { 'apikey': this.apiKey }
        }
      );
    } catch (error: any) {
      console.error('Error sending media:', error.response?.data || error.message);
    }
  }

  // TODO: Add methods for sending images, stickers, etc.
}
