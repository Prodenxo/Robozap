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
      console.log(`[YT-DLP] Tentando download com bypass: ${url}`);
      
      // O comando correto para fingir ser Android no yt-dlp é via --extractor-args
      const command = `yt-dlp \
        --extractor-args "youtube:player_client=android,web" \
        -f "ba" -x --audio-format mp3 --audio-quality 0 \
        --no-playlist \
        --no-check-certificates \
        "${url}" -o "${outputPath}"`;
      
      await execAsync(command);
      
      if (!fs.existsSync(outputPath)) {
          throw new Error('Arquivo não encontrado após o download.');
      }

      console.log(`[YT-DLP] Sucesso!`);
    } catch (error: any) {
      console.error('[YT-DLP ERROR]:', error.message || error);
      throw new Error('O YouTube bloqueou o download. Tente outro link ou tente mais tarde.');
    }
  }
}
