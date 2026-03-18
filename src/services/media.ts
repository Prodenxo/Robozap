import ytSearch from 'yt-search';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class MediaService {
  async searchYouTube(query: string): Promise<string | null> {
    const results = await ytSearch(query);
    return results.videos.length > 0 ? results.videos[0].url : null;
  }

  async downloadMusic(url: string, outputPath: string): Promise<void> {
    try {
      console.log(`[YT-DLP] Starting download for: ${url}`);
      
      // Fast, high-quality audio extraction with yt-dlp
      // Using -f 'ba' for best audio and --extract-audio
      const command = `yt-dlp -f 'ba' -x --audio-format mp3 --audio-quality 0 "${url}" -o "${outputPath}" --ffmpeg-location /usr/bin/ffmpeg --no-playlist`;
      
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr && !stderr.includes('[debug]')) {
          console.warn('[YT-DLP WARNING]:', stderr);
      }
      
      console.log(`[YT-DLP] Download finished successfully: ${outputPath}`);
    } catch (error) {
      console.error('[YT-DLP FATAL ERROR]:', error);
      throw new Error('Não consegui baixar essa música agora. YouTube tá de marcação!');
    }
  }
}
