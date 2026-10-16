import React from 'react';
import {
  AcademicCapIcon, AdjustmentsHorizontalIcon, ArrowDownTrayIcon, ArrowLeftIcon, ArrowPathIcon, ArrowTopRightOnSquareIcon,
  ArrowUpRightIcon, ArrowsPointingInIcon, ArrowsPointingOutIcon, ArrowsRightLeftIcon, BookOpenIcon, BuildingLibraryIcon,
  ChartBarIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon,
  ClockIcon, Cog6ToothIcon, ComputerDesktopIcon, DocumentArrowUpIcon, EyeIcon, EyeSlashIcon,
  FolderOpenIcon, ForwardIcon, HeartIcon, LinkIcon, ListBulletIcon, MagnifyingGlassIcon,
  MinusIcon, MusicalNoteIcon, PauseIcon, PencilSquareIcon, PlayIcon, PlusIcon,
  QueueListIcon, RectangleStackIcon, SparklesIcon, SpeakerWaveIcon, SpeakerXMarkIcon, Squares2X2Icon,
  TrashIcon, XMarkIcon,
} from '@heroicons/react/24/outline';

// All interface glyphs use the official Heroicons outline SVGs (MIT). Named imports keep the bundle
// to the icons actually used (a namespace import pulled in every Heroicon).
const icon = (Component) => function InterfaceIcon({ size = 20, strokeWidth = 1.7, style, ...props }) {
  return <Component aria-hidden="true" data-icon-library="heroicons" width={size} height={size} strokeWidth={strokeWidth} style={{ flexShrink: 0, ...style }} {...props}/>;
};
export const Album = icon(RectangleStackIcon), ArrowUpRight = icon(ArrowUpRightIcon), BookOpen = icon(BookOpenIcon), ChevronLeft = icon(ChevronLeftIcon);
export const ChevronRight = icon(ChevronRightIcon), Grid3X3 = icon(Squares2X2Icon), Library = icon(BuildingLibraryIcon), Music2 = icon(MusicalNoteIcon);
export const Plus = icon(PlusIcon), Search = icon(MagnifyingGlassIcon), Sparkles = icon(SparklesIcon), Trash2 = icon(TrashIcon);
export const Wand2 = icon(AdjustmentsHorizontalIcon), Pause = icon(PauseIcon), Play = icon(PlayIcon), Shuffle = icon(ArrowsRightLeftIcon), X = icon(XMarkIcon);
export const Expand = icon(ArrowsPointingOutIcon), Contract = icon(ArrowsPointingInIcon), Settings = icon(Cog6ToothIcon), Minus = icon(MinusIcon);
export const External = icon(ArrowTopRightOnSquareIcon), Download = icon(ArrowDownTrayIcon), Check = icon(CheckIcon), Up = icon(ChevronUpIcon);
export const Down = icon(ChevronDownIcon), Loading = icon(ArrowPathIcon), Clock = icon(ClockIcon), ChartBar = icon(ChartBarIcon), SpeakerWave = icon(SpeakerWaveIcon);
export const SpeakerOff = icon(SpeakerXMarkIcon), Forward = icon(ForwardIcon), EyeSlash = icon(EyeSlashIcon), Eye = icon(EyeIcon), Pencil = icon(PencilSquareIcon);
export const ListBullet = icon(ListBulletIcon), Heart = icon(HeartIcon), FolderOpen = icon(FolderOpenIcon), Computer = icon(ComputerDesktopIcon);
export const QueueList = icon(QueueListIcon), Link = icon(LinkIcon), DocumentArrow = icon(DocumentArrowUpIcon), ArrowLeft = icon(ArrowLeftIcon);
export const Bookmark = icon(AcademicCapIcon);

// Pixel glyphs for the deck's play modes, on pixelarticons' 24-unit grid
// (2 units per pixel; MIT, see public/licenses/pixelarticons-LICENSE.txt).
// Render at 24px so every pixel lands on whole screen pixels.
const pixelGlyph = (label, children) => function PixelGlyph({ size = 24, style, ...props }) {
  return <svg aria-hidden="true" data-icon={label} viewBox="0 0 24 24" width={size} height={size} shapeRendering="crispEdges" fill="currentColor" style={{ flexShrink: 0, ...style }} {...props}>{children}</svg>;
};
// Each "X" is one pixel (2 × 2 units).
const pixels = (rows) => rows.flatMap((row, y) => [...row].map((cell, x) => cell === 'X' ? <rect key={`${x}-${y}`} x={x * 2} y={y * 2} width="2" height="2"/> : null)).filter(Boolean);
// pixelarticons "repeat" and "repeat-1".
export const RepeatPixel = pixelGlyph('repeat', <><path d="M17 5h2v2h-2zM5 17h2v2H5zm6-14h2v6h-2zM9 1h2v8H9zm0 8h2v2H9zm10 8H9v2h10zM5 7H3v10h2z"/><path d="M13 15h-2v6h2zm2-2h-2v8h2zm0 8h-2v2h2zM5 5h10v2H5zm14 12h2V7h-2z"/></>);
export const RepeatOnePixel = pixelGlyph('repeat-one', <path d="M19 19H15V23H13V21H11V19H9V17H19V19ZM7 19H5V17H7V19ZM5 17H3L3 7H5L5 17ZM21 17H19V7H21V17ZM13 9L13 13L15 13V15L9 15V13H11V11H9V9H13ZM11 3H13V5H15V7L5 7V5L9 5V1L11 1V3ZM19 7L17 7V5L19 5V7Z"/>);
// Drawn for Flow Cabin in the same style: two crossing lines, solid arrowheads.
export const ShufflePixel = pixelGlyph('shuffle', pixels([
  '.........X..',
  '.........XX.',
  'XX......XXXX',
  '..X....X.XX.',
  '...X..X..X..',
  '....XX......',
  '....XX......',
  '...X..X..X..',
  '..X....X.XX.',
  'XX......XXXX',
  '.........XX.',
  '.........X..'
]));
// Pocket-player keys, same 12 × 12 pixel grid.
export const PlayPixel = pixelGlyph('play', pixels([
  '............', '...X........', '...XX.......', '...XXX......', '...XXXX.....', '...XXXXX....',
  '...XXXXX....', '...XXXX.....', '...XXX......', '...XX.......', '...X........', '............'
]));
export const PausePixel = pixelGlyph('pause', pixels([
  '............', '..XXX..XXX..', '..XXX..XXX..', '..XXX..XXX..', '..XXX..XXX..', '..XXX..XXX..',
  '..XXX..XXX..', '..XXX..XXX..', '..XXX..XXX..', '..XXX..XXX..', '..XXX..XXX..', '............'
]));
export const PreviousPixel = pixelGlyph('previous', pixels([
  '............', '............', '.XX....X...X', '.XX...XX..XX', '.XX..XXX.XXX', '.XX.XXXXXXXX',
  '.XX.XXXXXXXX', '.XX..XXX.XXX', '.XX...XX..XX', '.XX....X...X', '............', '............'
]));
export const NextPixel = pixelGlyph('next', pixels([
  '............', '............', 'X...X....XX.', 'XX..XX...XX.', 'XXX.XXX..XX.', 'XXXXXXXX.XX.',
  'XXXXXXXX.XX.', 'XXX.XXX..XX.', 'XX..XX...XX.', 'X...X....XX.', '............', '............'
]));
export const EjectPixel = pixelGlyph('eject', pixels([
  '............', '.....XX.....', '....XXXX....', '...XXXXXX...', '..XXXXXXXX..', '.XXXXXXXXXX.',
  '.XXXXXXXXXX.', '............', '.XXXXXXXXXX.', '.XXXXXXXXXX.', '............', '............'
]));

// The record glyph: a 12 × 12 pixel vinyl — outer rim, a half-tone groove and an accent label.
// Drawn on whole pixels only, so the rendered size snaps to a multiple of 12 (12 / 24 / 36 px).
const VINYL = [
  '....XXXX....', '..XX....XX..', '.X..gggg..X.', '.X.g....g.X.', 'X.g......g.X', 'X.g..LL..g.X',
  'X.g..LL..g.X', 'X.g......g.X', '.X.g....g.X.', '.X..gggg..X.', '..XX....XX..', '....XXXX....'
];
const VINYL_RIM = pixels(VINYL), VINYL_GROOVE = pixels(VINYL.map((row) => row.replace(/X/g, '.').replace(/g/g, 'X'))), VINYL_LABEL = pixels(VINYL.map((row) => row.replace(/[Xg]/g, '.').replace(/L/g, 'X')));
export function Disc3({ size = 24, style, ...props }) {
  const px = Math.max(12, Math.round(size / 12) * 12);
  return <svg aria-hidden="true" data-icon="vinyl" data-icon-library="pixel" viewBox="0 0 24 24" width={px} height={px} shapeRendering="crispEdges" style={{ flexShrink: 0, ...style }} {...props}>
    <g fill="currentColor">{VINYL_RIM}</g><g fill="currentColor" opacity=".5">{VINYL_GROOVE}</g><g fill="var(--px-accent, #e0ad69)">{VINYL_LABEL}</g>
  </svg>;
}
