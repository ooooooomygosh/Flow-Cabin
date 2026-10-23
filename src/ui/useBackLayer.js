import { useEffect, useRef } from 'react';
import { backStack } from './back-stack.mjs';

// While `active`, Esc and the Android back button call `close` (the latest one).
export default function useBackLayer(active, close, label = '') {
  const latest = useRef(close); latest.current = close;
  useEffect(() => active ? backStack.push(() => latest.current(), label) : undefined, [active, label]);
}
