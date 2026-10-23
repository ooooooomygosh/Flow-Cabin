import { useEffect, useState } from 'react';
import { readLife, LIFE_KEY, LIFE_CHANGED } from './life-state.mjs';
export function useLife() {
  const [life, setLife] = useState(readLife);
  useEffect(() => { const update = e => { if (!e.key || e.key === LIFE_KEY) setLife(readLife()); }; window.addEventListener(LIFE_CHANGED, update); window.addEventListener('storage', update); return () => { window.removeEventListener(LIFE_CHANGED, update); window.removeEventListener('storage', update); }; }, []);
  return life;
}
