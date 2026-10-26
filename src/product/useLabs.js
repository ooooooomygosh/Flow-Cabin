import { useEffect, useState } from 'react';
import { LABS_EVENT, readLabs } from './features.mjs';

// 当前实验室开关；任一窗口内切换后立即刷新。
export default function useLabs() {
  const [labs, setLabs] = useState(() => readLabs());
  useEffect(() => {
    const refresh = () => setLabs(readLabs());
    window.addEventListener(LABS_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(LABS_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  return labs;
}
