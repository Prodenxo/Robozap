import fs from 'fs';
import path from 'path';

const MAP_FILE = path.join(process.cwd(), 'lid_map.json');

export class LidMapService {
  private static cache: Record<string, string> | null = null;

  private static loadMap(): Record<string, string> {
    if (this.cache) {
      return this.cache;
    }
    try {
      if (fs.existsSync(MAP_FILE)) {
        this.cache = JSON.parse(fs.readFileSync(MAP_FILE, 'utf-8'));
        return this.cache!;
      }
    } catch (e) {
      console.error('[LID MAP] Error loading map:', e);
    }
    this.cache = {};
    return this.cache;
  }

  private static saveMap(map: Record<string, string>) {
    try {
      this.cache = map;
      fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2), 'utf-8');
    } catch (e) {
      console.error('[LID MAP] Error saving map:', e);
    }
  }

  static getFullMap(): Record<string, string> {
    return this.loadMap();
  }

  static get(lid: string): string | null {
    if (!lid || !lid.includes('@lid')) return null;
    const map = this.loadMap();
    return map[lid] || null;
  }

  static getLid(realJid: string): string | null {
    if (!realJid || !realJid.includes('@s.whatsapp.net')) return null;
    const map = this.loadMap();
    for (const [lid, mappedRealJid] of Object.entries(map)) {
      if (mappedRealJid === realJid) {
        return lid;
      }
    }
    return null;
  }


  static set(lid: string, realJid: string) {
    if (!lid || !lid.includes('@lid') || !realJid || !realJid.includes('@s.whatsapp.net')) return;
    const map = this.loadMap();
    if (map[lid] === realJid) return; // já mapeado para o mesmo valor
    map[lid] = realJid;
    this.saveMap(map);
    console.log(`[LID MAP] Mapeado com sucesso: ${lid} -> ${realJid}`);
  }
}
