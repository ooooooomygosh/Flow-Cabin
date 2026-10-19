import { useEffect, useState } from 'react';

// The desktop shell injects a small, display-only snapshot of local input
// counts. It deliberately contains no key values, coordinates, window titles
// or application names; the UI can only read aggregate numbers.
const MAX_COUNT = 1e9;

const count = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(MAX_COUNT, Math.round(number))) : 0;
};

const normalizeTotal = (value) => {
  if (!value || typeof value !== 'object') return null;
  const keyboard = count(value.keyboard), click = count(value.click);
  return { keyboard, click, total: count(value.total) || keyboard + click };
};

export function normalizeInputStats(value) {
  if (!value || typeof value !== 'object' || !value.today || typeof value.today !== 'object') return null;
  const today = normalizeTotal(value.today);
  if (!today) return null;
  const total = normalizeTotal(value.total);
  const week = Array.isArray(value.week)
    ? value.week.slice(-7).map((day) => {
      if (!day || typeof day !== 'object') return null;
      const keyboard = count(day.keyboard), click = count(day.click);
      return { key: typeof day.key === 'string' ? day.key.slice(0, 10) : '', keyboard, click, total: count(day.total) || keyboard + click };
    }).filter((day) => day && day.key)
    : [];
  return {
    enabled: value.enabled === true,
    status: typeof value.status === 'string' ? value.status : '',
    permission: typeof value.permission === 'string' ? value.permission : '',
    platform: typeof value.platform === 'string' ? value.platform : '',
    today,
    ...(total ? { total } : {}),
    week,
    activeDays: count(value.activeDays),
    streak: count(value.streak)
  };
}

const read = () => {
  if (typeof globalThis.window === 'undefined') return null;
  return normalizeInputStats(globalThis.window.albumInputStats);
};

export default function useInputStats() {
  const [stats, setStats] = useState(read);
  useEffect(() => {
    const refresh = () => setStats(read());
    const receive = (event) => setStats(normalizeInputStats(event?.detail) || read());
    window.addEventListener('album-input-stats', receive);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('album-input-stats', receive);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return stats;
}
