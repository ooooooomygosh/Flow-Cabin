import { useEffect, useState } from 'react';

// The desktop shell injects display-only counters into the cabin page. No event
// contents are present: `today`, `total`, `week` and `streak` are all numbers.
const read = () => {
  const value = globalThis.window?.albumInputStats;
  return value && typeof value === 'object' && value.today ? value : null;
};

export default function useInputStats() {
  const [stats, setStats] = useState(read);
  useEffect(() => {
    const receive = (event) => setStats(event?.detail || read());
    window.addEventListener('album-input-stats', receive);
    return () => window.removeEventListener('album-input-stats', receive);
  }, []);
  return stats;
}
