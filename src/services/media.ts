import ffmpeg from 'fluent-ffmpeg';
import ytdl from '@distube/ytdl-core';
import ytSearch from 'yt-search';
import fs from 'fs';
import path from 'path';

export class MediaService {
  async searchYouTube(query: string): Promise<string | null> {
    const r = await ytSearch(query);
    const videos = r.videos;
    return videos.length > 0 ? videos[0].url : null;
  }

  async downloadMusic(url: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ytdl(url, { filter: 'audioonly' })
        .pipe(fs.createWriteStream(outputPath))
        .on('finish', resolve)
        .on('error', reject);
    });
  }

  // Placeholder for sticker logic as it requires complex conversion
  // usually done with sharp or ffmpeg to webp
  async createSticker(inputPath: string, outputPath: string) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-vcodec', 'libwebp',
          '-vf', 'scale=512:512:force_original_aspect_ratio=increase,fps=15,crop=512:512'
        ])
        .save(outputPath)
        .on('end', resolve)
        .on('error', reject);
    });
  }
}
