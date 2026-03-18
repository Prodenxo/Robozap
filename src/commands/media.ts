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
      const isImage = msg.messageType === 'imageMessage';
      const isQuotedImage = msg.raw?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
      
      if (isImage || isQuotedImage) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.media.figStart);
        try {
          await whatsapp.sendSticker(msg.remoteJid, msg.raw);
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
