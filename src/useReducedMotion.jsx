import { useSyncExternalStore } from 'react';
import { onReducedMotionChange, reducedMotion } from './motion-preference.mjs';

// The combined OS + desktop reduced-motion flag as React state.
const subscribe = (notify) => onReducedMotionChange(notify);
const read = () => reducedMotion();
export default function useReducedMotion() { return useSyncExternalStore(subscribe, read, () => false); }
