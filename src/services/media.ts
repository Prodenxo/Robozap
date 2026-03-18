import ytdl from '@distube/ytdl-core';
import ytSearch from 'yt-search';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';

export class MediaService {
  async searchYouTube(query: string): Promise<string | null> {
    const results = await ytSearch(query);
    return results.videos.length > 0 ? results.videos[0].url : null;
  }

  async downloadMusic(url: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // High quality options but more prone to detection
        const stream = ytdl(url, {
          quality: 'highestaudio',
          filter: 'audioonly',
        });

        // WRAP IN TRY/CATCH AND EMIT ERROR TO PREVENT CRASH
        stream.on('error', (err) => {
           console.error('[YTDL ERROR]:', err.message);
           reject(new Error('YouTube blocked this download. Try another link or search.'));
        });

        ffmpeg(stream)
          .audioBitrate(128)
          .toFormat('mp4')
          .on('end', () => resolve())
          .on('error', (err) => {
            console.error('[FFMPEG ERROR]:', err);
            reject(err);
          })
          .save(outputPath);
      } catch (error) {
        console.error('[MEDIA SERVICE FATAL]:', error);
        reject(error);
      }
    });
  }
}
