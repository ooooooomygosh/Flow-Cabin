import { useEffect, useMemo, useState } from 'react';
import { loadSessions, mergeSessions, subscribeSessions, SESSION_LOG_KEY } from './session-source.mjs';

// Legacy pomodoro sessions + the focus-session log + live `cabin:focus-session` events.
export default function useFocusSessions(legacy) {
  const [logged, setLogged] = useState(() => loadSessions({ storage: globalThis.localStorage }));
  const [live, setLive] = useState([]);
  useEffect(() => {
    const off = subscribeSessions(window, (record) => setLive((list) => [...list, record]));
    const sync = (event) => { if (event.key === SESSION_LOG_KEY) setLogged(loadSessions({ storage: localStorage })); };
    window.addEventListener('storage', sync);
    return () => { off(); window.removeEventListener('storage', sync); };
  }, []);
  return useMemo(() => mergeSessions(loadSessions({ legacy }), logged, live), [legacy, logged, live]);
}
