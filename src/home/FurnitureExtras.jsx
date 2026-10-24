import React, { useEffect, useState } from 'react';
import { useStudy } from '../study/useStudy';
import { studyQueue } from '../study/study-model.mjs';
import { useLetters } from '../ai/useCabinLetters.js';
import { FRAME_PHOTO_EVENT, readFramePhoto } from './frame-photo.mjs';
import './home-tools.css';

// What some furniture shows on its own surface, so a glance at the room is
// enough: the bookshelf counts today's reviews, the mailbox its unopened
// letters, and the wall frame shows the picture the person chose.
export const FURNITURE_EXTRAS = Object.freeze({ books: StudyDue, mail: MailUnread, photo: FramePhoto });
export function FurnitureExtra({ item }) {
  const Extra = FURNITURE_EXTRAS[item.type];
  return Extra ? <Extra/> : null;
}

// Cards come due while the room is open: look again every minute.
function useMinute() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  return now;
}

// The furniture button carries its own name, so the badge is visual (title for
// hover); the same numbers are spoken inside the panels it opens.
function Badge({ count, label }) {
  if (!count) return null;
  return <span className="home-furniture-badge" aria-hidden="true" title={label}>{count > 99 ? '99+' : count}</span>;
}

function StudyDue() {
  const study = useStudy(), now = useMinute();
  if (!study) return null;
  const queue = studyQueue(study.state, '', now), count = queue.due + queue.fresh;
  return <Badge count={count} label={`书架 · 今天待复习 ${count} 张`}/>;
}

function MailUnread() {
  const { unread } = useLetters();
  return <Badge count={unread} label={`信箱 · ${unread} 封未拆的来信`}/>;
}

function FramePhoto() {
  const [photo, setPhoto] = useState(readFramePhoto);
  useEffect(() => {
    const update = () => setPhoto(readFramePhoto());
    window.addEventListener(FRAME_PHOTO_EVENT, update); window.addEventListener('storage', update);
    return () => { window.removeEventListener(FRAME_PHOTO_EVENT, update); window.removeEventListener('storage', update); };
  }, []);
  return photo ? <img className="home-frame-photo" src={photo.src} alt="" draggable={false}/> : null;
}
