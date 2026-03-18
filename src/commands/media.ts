import { WhatsAppService } from '../services/whatsapp';
import { MediaService } from '../services/media';
import { botTexts } from '../config/texts';
import ytdl from '@distube/ytdl-core';
import path from 'path';
import fs from 'fs';

const whatsapp = new WhatsAppService();
const media = new MediaService();

export const handleMediaCommands = async (command: string, args: string[], msg: any) => {
  switch (command) {
    case 'fig':
    case 'sticker':
      const msgContent = msg.raw?.message || {};
      const quotedContent = msg.raw?.message?.extendedTextMessage?.contextInfo?.quotedMessage || {};
      
      const hasImage = msgContent.imageMessage || quotedContent.imageMessage;
      
      if (hasImage) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.media.figStart);
        try {
          // If it's a quoted image, we might need the quoted message itself or just its content
          // Evolution API sendSticker usually handles the message object or a URL/Base64.
          // Let's pass the relevant part.
          const stickerSource = msgContent.imageMessage ? msg.raw : { message: quotedContent };
          await whatsapp.sendSticker(msg.remoteJid, stickerSource);
        } catch (error) {
          console.error('Sticker Error:', error);
          await whatsapp.sendMessage(msg.remoteJid, botTexts.media.figErrorGeneric);
        }
      } else {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.media.figErrorNoImage);
      }
      return true;

    case 'musica':
    case 'tocar':
      if (args.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.media.musicaNoText);
        return true;
      }
      const query = args.join(' ');
      
      try {
        let url = query;
        if (!ytdl.validateURL(query)) {
          url = await media.searchYouTube(query) || '';
        }

        if (!url) {
          await whatsapp.sendMessage(msg.remoteJid, botTexts.media.musicaErrorNotFound);
          return true;
        }

        // Change extension to .mp3 because yt-dlp will save it as mp3
        const tempPath = path.join(__dirname, `../../temp_${Date.now()}.mp3`);
        
        await whatsapp.sendMessage(msg.remoteJid, botTexts.media.musicaSearch.replace('$query', query));

        await media.downloadMusic(url, tempPath);
        
        await whatsapp.sendMedia(msg.remoteJid, tempPath, 'audio');
        
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (error) {
        console.error('Music Error:', error);
        await whatsapp.sendMessage(msg.remoteJid, botTexts.media.musicaErrorGeneric);
      }
      return true;

    default:
      return false;
  }
};
