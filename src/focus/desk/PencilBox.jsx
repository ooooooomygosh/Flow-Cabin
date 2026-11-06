import React from 'react';

// The pencil square at the head of a to-do (DEsk's planner): an irregular box, and a tick drawn into it.
export function PencilBox({ done }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="desk-check-art">
    <path className="desk-check-box" d="M3.4 4.1 L20.4 3.3 L20.9 20.2 L3.2 20.8 Z"/>
    {done && <path className="desk-tick" pathLength="1" d="M5 13.4 L9.6 18.4 L20.2 4.6"/>}
  </svg>;
}
export default PencilBox;
