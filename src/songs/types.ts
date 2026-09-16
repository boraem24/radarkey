export interface SongCandidate {
  id: string
  title: string
  artist: string
  album?: string
  year?: string
  source: 'itunes' | 'acrcloud' | 'musixmatch' | 'library' | 'cifraclub'
  sourceUrl?: string
  recognitionScore?: number
  matchCount?: number
}
export interface ChordSection {
  id: string
  name: string
  lines: string[][]
}
export interface SongChart {
  id: string
  song: SongCandidate
  name: string
  originalKey: number | null
  capo: number
  sections: ChordSection[]
  searchText: string
  sourceUrl?: string
  savedAt: number
}
export interface MusicCapabilities {
  recognition: boolean
  lyrics: boolean
  catalog: boolean
}
export interface ChartVersion {
  name: string
  url: string
}
