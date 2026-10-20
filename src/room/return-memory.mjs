// A quiet reminder, drawn from existing records; never invent listening history.
export function returnMemory(sessions = []) {
  const last = sessions.filter(s => Number.isFinite(s?.end) && s.end > s.start && s.durationMs >= 60000).sort((a, b) => b.end - a.end)[0];
  if (!last) return null;
  const minutes = Math.max(1, Math.round(last.durationMs / 60000));
  return { title: last.album?.title ? `上次陪你专注：《${last.album.title}》` : `上次留给自己 ${minutes} 分钟`, detail: last.album?.title ? `${minutes} 分钟 · 今天也按自己的节奏来` : '唱片和小屋，都在这里等你。' };
}
