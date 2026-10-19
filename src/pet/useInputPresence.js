import { useEffect, useState } from 'react';
import { watchInputPresence } from './pet-presence.mjs';

export function useInputPresence(enabled = true) {
  const [value, setValue] = useState(() => ({ active: false, at: Date.now(), type: 'keyboard' }));
  useEffect(() => enabled ? watchInputPresence(window, setValue) : undefined, [enabled]);
  return enabled ? value : { active: false, at: value.at, type: value.type };
}
