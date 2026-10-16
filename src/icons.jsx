// Interface icons: the Flow Cabin pixel set (pixel-icon-bitmaps.mjs), one 12 × 12
// glyph per meaning. Loading spins (busy only); Refresh re-reads; Reset puts a timer back.
import { PIXEL_ICONS as P } from './pixel-icons';

export const Album = P.album, ArrowUpRight = P['arrow-up-right'], BookOpen = P['book-open'], ChevronLeft = P['chevron-left'];
export const ChevronRight = P['chevron-right'], Grid3X3 = P.grid, Library = P.crate, Music2 = P.note;
export const Plus = P.plus, Search = P.search, Sparkles = P.sparkles, Trash2 = P.trash;
export const Wand2 = P.sliders, Pause = P.pause, Play = P.play, Shuffle = P.shuffle, X = P.close;
export const Expand = P.expand, Contract = P.contract, Settings = P.cog, Minus = P.minus;
export const External = P.external, Download = P.download, Check = P.check, Up = P['chevron-up'];
export const Down = P['chevron-down'], Loading = P.refresh, Refresh = P.refresh, Reset = P.reset, Clock = P.clock, ChartBar = P.chart, SpeakerWave = P['speaker-wave'];
export const SpeakerOff = P['speaker-off'], Forward = P.forward, EyeSlash = P['eye-off'], Eye = P.eye, Pencil = P.pencil;
export const ListBullet = P.list, Heart = P.heart, FolderOpen = P.folder, Computer = P.computer;
export const QueueList = P.queue, Link = P.link, DocumentArrow = P['document-up'], ArrowLeft = P['arrow-left'];
export const Study = P.study;

// Deck glyphs (play modes, pocket keys, vinyl) and the small status glyphs.
export * from './pixel-icons';
