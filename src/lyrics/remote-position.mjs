// Where the other device's song is now, without trusting its clock: every difference is
// taken on one clock (the sender's anchoredAt → sentAt, then our receivedAt → now).
export function remotePosition(snapshot, now = Date.now()) {
  const music = snapshot?.music; if (!music || !Number.isFinite(music.position)) return null;
  const base = music.position * 1000; if (!music.playing) return base;
  const rate = music.rate || 1, before = snapshot.sentAt && music.anchoredAt ? Math.max(0, snapshot.sentAt - music.anchoredAt) : 0, after = snapshot.receivedAt ? Math.max(0, now - snapshot.receivedAt) : 0;
  return Math.min(music.duration ? music.duration * 1000 : Infinity, base + (before + after) * rate);
}
