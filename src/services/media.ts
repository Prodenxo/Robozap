import ytSearch from 'yt-search';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

export class MediaService {
  async searchYouTube(query: string): Promise<string | null> {
    const results = await ytSearch(query);
    return results.videos.length > 0 ? results.videos[0].url : null;
  }

  async downloadMusic(url: string, outputPath: string): Promise<void> {
    try {
      console.log(`[YT-DLP] Tentando burlar o YouTube para: ${url}`);
      
      // Comando ninja: --client-name android tenta fingir que é o app do celular
      // Adicionamos --no-check-certificates e um User-Agent comum
      const command = `yt-dlp \
        --client-name android \
        -f "ba" -x --audio-format mp3 --audio-quality 0 \
        --no-playlist \
        --no-check-certificates \
        --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
        "${url}" -o "${outputPath}"`;
      
      await execAsync(command);
      
      if (!fs.existsSync(outputPath)) {
          throw new Error('O arquivo não foi gerado. O YouTube provavelmente bloqueou.');
      }

      console.log(`[YT-DLP] Download finalizado!`);
    } catch (error: any) {
      console.error('[YT-DLP FATAL ERROR]:', error.message || error);
      throw new Error('O YouTube bloqueou o download por ser um servidor. Tente novamente ou use outro link.');
    }
  }
}
