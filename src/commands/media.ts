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
      const hasSticker = msgContent.stickerMessage || quotedContent.stickerMessage;
      
      if (hasImage || hasSticker) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.media.figStart);
        try {
          // If it's a quoted media
          const stickerSource = msgContent.imageMessage || msgContent.stickerMessage ? msg.raw : { message: quotedContent };
          const buffer = await whatsapp.downloadMedia(stickerSource);
          if (buffer) {
            await whatsapp.sendSticker(msg.remoteJid, buffer);
          } else {
            throw new Error('Failed to download media');
          }
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
      const musicQuery = args.join(' ');
      
      try {
        let url = musicQuery;
        if (!ytdl.validateURL(musicQuery)) {
          url = await media.searchYouTube(musicQuery) || '';
        }

        if (!url) {
          await whatsapp.sendMessage(msg.remoteJid, botTexts.media.musicaErrorNotFound);
          return true;
        }

        const tempPath = path.join(__dirname, `../../temp_${Date.now()}.mp3`);
        await whatsapp.sendMessage(msg.remoteJid, botTexts.media.musicaSearch.replace('$query', musicQuery));
        await media.downloadMusic(url, tempPath);
        await whatsapp.sendMedia(msg.remoteJid, tempPath, 'audio');
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (error) {
        console.error('Music Error:', error);
        await whatsapp.sendMessage(msg.remoteJid, botTexts.media.musicaErrorGeneric);
      }
      return true;

    case 'ig':
    case 'igdl':
    case 'instadl':
    case 'fb':
    case 'fbdl':
    case 'tiktok':
    case 'tkdl':
    case 'yt':
    case 'ytdl':
      if (args.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, "❓ *CADÊ O LINK?* Manda o link do vídeo pra eu baixar.");
        return true;
      }
      const videoUrl = args[0];
      try {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.media.downloadStart);
        const tempVideoPath = path.join(__dirname, `../../temp_video_${Date.now()}.mp4`);
        await media.downloadVideo(videoUrl, tempVideoPath);
        await whatsapp.sendMedia(msg.remoteJid, tempVideoPath, 'video');
        if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
      } catch (error) {
        console.error('Video Download Error:', error);
        await whatsapp.sendMessage(msg.remoteJid, botTexts.media.downloadErrorGeneric);
      }
      return true;

    default:
      return false;
  }
}
