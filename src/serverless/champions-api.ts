export interface BattleRow {
  category: string;
  rank: number;
  name: string;
  percentage?: string;
  percentage_value?: number | null;
  stat_up?: string;
  stat_down?: string;
  hp_points?: number | string;
  attack_points?: number | string;
  defense_points?: number | string;
  sp_atk_points?: number | string;
  sp_def_points?: number | string;
  speed_points?: number | string;
}

export interface BattleDataResponse {
  pokemon?: string;
  showdownId?: string;
  format?: string;
  rows?: BattleRow[];
  error?: string;
}

export interface MetadataRow {
  title?: string;
  base_name?: string;
  saved_name?: string;
  types?: string;
  abilities?: string;
  image_path?: string;
  form?: string;
  hp?: number;
  atk?: number;
  def?: number;
  spa?: number;
  spd?: number;
  spe?: number;
  total?: number;
}

export interface MetadataResponse {
  pokemon?: string;
  source?: string;
  rows?: MetadataRow[];
  error?: string;
}

export async function fetchChampionsBattleData(showdownId: string, format: 'Doubles' | 'Singles'): Promise<BattleDataResponse | null> {
  try {
    const url = `https://championsbattledata.com/api/battle/${format}/${encodeURIComponent(showdownId)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.rows) {
      return data as BattleDataResponse;
    }
    return null;
  } catch (err) {
    console.error('Error fetching Champions battle data:', err);
    return null;
  }
}

export async function fetchChampionsMetadata(baseName: string): Promise<MetadataResponse | null> {
  try {
    const url = `https://championsbattledata.com/api/metadata/${encodeURIComponent(baseName.toLowerCase())}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.rows) {
      return data as MetadataResponse;
    }
    return null;
  } catch (err) {
    console.error('Error fetching Champions metadata:', err);
    return null;
  }
}
