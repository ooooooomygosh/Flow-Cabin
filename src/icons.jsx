import React from 'react';
import {
  AcademicCapIcon, AdjustmentsHorizontalIcon, ArrowDownTrayIcon, ArrowLeftIcon, ArrowPathIcon, ArrowTopRightOnSquareIcon,
  ArrowUpRightIcon, ArrowUturnLeftIcon, ArrowsPointingInIcon, ArrowsPointingOutIcon, ArrowsRightLeftIcon, BookOpenIcon, BuildingLibraryIcon,
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
// Loading spins (busy only); Refresh re-reads; Reset puts a timer back.
export const Down = icon(ChevronDownIcon), Loading = icon(ArrowPathIcon), Refresh = icon(ArrowPathIcon), Reset = icon(ArrowUturnLeftIcon), Clock = icon(ClockIcon), ChartBar = icon(ChartBarIcon), SpeakerWave = icon(SpeakerWaveIcon);
export const SpeakerOff = icon(SpeakerXMarkIcon), Forward = icon(ForwardIcon), EyeSlash = icon(EyeSlashIcon), Eye = icon(EyeIcon), Pencil = icon(PencilSquareIcon);
export const ListBullet = icon(ListBulletIcon), Heart = icon(HeartIcon), FolderOpen = icon(FolderOpenIcon), Computer = icon(ComputerDesktopIcon);
export const QueueList = icon(QueueListIcon), Link = icon(LinkIcon), DocumentArrow = icon(DocumentArrowUpIcon), ArrowLeft = icon(ArrowLeftIcon);
export const Study = icon(AcademicCapIcon);

// Pixel glyphs live in their own module so small windows (mini player) take them without Heroicons.
export * from './pixel-icons';
