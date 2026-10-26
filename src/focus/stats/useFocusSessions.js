import { useEffect, useMemo, useState } from 'react';
import { loadSessions, mergeSessions, subscribeSessions, SESSION_LOG_KEY } from './session-source.mjs';
import { SESSIONS_CHANGED } from '../session-log.mjs';

// Legacy pomodoro sessions + the focus-session log + live `cabin:focus-session` events.
// A record edited in place (a 压制唱片 note) reloads the log in this window too.
export default function useFocusSessions(legacy) {
  const [logged, setLogged] = useState(() => loadSessions({ storage: globalThis.localStorage }));
  const [live, setLive] = useState([]);
  useEffect(() => {
    const off = subscribeSessions(window, (record) => setLive((list) => [...list, record]));
    const reload = () => { setLogged(loadSessions({ storage: localStorage })); setLive([]); };
    const sync = (event) => { if (event.key === SESSION_LOG_KEY) reload(); };
    window.addEventListener('storage', sync); window.addEventListener(SESSIONS_CHANGED, reload);
    return () => { off(); window.removeEventListener('storage', sync); window.removeEventListener(SESSIONS_CHANGED, reload); };
  }, []);
  return useMemo(() => mergeSessions(loadSessions({ legacy }), logged, live), [legacy, logged, live]);
}
