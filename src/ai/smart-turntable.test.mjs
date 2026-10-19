import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDuration, parseIntent, localRecommendation, aiShelfSummary,
  buildAiMessages, parseAiSelection, normalizePlaybackPlan, parseAiPlaylist, smartPlaylistItem,
  normalizePlaylistPlaybackPlan,
  AI_ALBUM_LIMIT, AI_PLAYLIST_TRACK_LIMIT, ACTIVITY_IDS, DEFAULT_AUTOPLAY
} from './smart-turntable.mjs';

const minutes = (value) => Array.from({ length: value }, (_, index) => ({
  title: `Track ${index + 1}`,
  lengthMillis: 60000
}));

const shelf = [
  {
    id: 'focus',
    title: '深夜专注',
    artist: 'Cabin Piano',
    genres: ['ambient', 'piano', 'instrumental'],
    trackDetails: minutes(32)
  },
  {
    id: 'party',
    title: '燃到天亮',
    artist: 'Loud Band',
    genres: ['rock', 'metal', 'party'],
    trackDetails: minutes(28)
  },
  {
    id: 'sleep',
    title: '安眠',
    artist: 'Slow Room',
    genres: ['ambient', 'sleep', '轻音乐'],
    trackDetails: minutes(24)
  },
  {
    id: 'jazz',
    title: '雨夜爵士',
    artist: 'Blue Window',
    genres: ['jazz', 'acoustic'],
    trackDetails: minutes(20)
  }
];

test('parses Chinese and Arabic durations, including spoken half-hours', () => {
  assert.equal(parseDuration('我现在要学习五十分钟，请帮我搭配音乐'), 50);
  assert.equal(parseDuration('想放松 25 分钟'), 25);
  assert.equal(parseDuration('阅读一百二十分钟'), 120);
  assert.equal(parseDuration('写论文一小时二十分钟'), 80);
  assert.equal(parseDuration('工作 1 小时 20 分钟'), 80);
  assert.equal(parseDuration('阅读两小时十五分钟'), 135);
  assert.equal(parseDuration('运动 1h20m'), 80);
  assert.equal(parseDuration('睡前听半小时'), 30);
  assert.equal(parseDuration('工作一个半小时'), 90);
  assert.equal(parseDuration('运动 1.5 小时'), 90);
  assert.equal(parseDuration('只学 5 分钟'), 15);
  assert.equal(parseDuration('学习 0 分钟'), 15);
  assert.equal(parseDuration('听 240 分钟'), 180);
  assert.equal(parseDuration('随便听听'), 50);
});

test('recognises the requested activity before falling back to focus', () => {
  assert.equal(parseIntent('睡前听点音乐').activity.id, 'sleep');
  assert.equal(parseIntent('健身四十五分钟').activity.id, 'workout');
  assert.equal(parseIntent('写论文').activity.id, 'writing');
  assert.equal(parseIntent('阅读三十分钟').activity.id, 'reading');
  assert.equal(parseIntent('工作五十分钟').activity.id, 'work');
  assert.equal(parseIntent('专注学习五十分钟').activity.id, 'study');
  assert.equal(parseIntent('放松一下').activity.id, 'relax');
  assert.equal(parseIntent('午睡二十分钟').activity.id, 'sleep');
  assert.equal(parseIntent('做作业四十分钟').activity.id, 'study');
  assert.equal(parseIntent('写方案五十分钟').activity.id, 'writing');
  assert.equal(parseIntent('撸铁四十五分钟').activity.id, 'workout');
  assert.equal(parseIntent('冥想十五分钟').activity.id, 'relax');
  assert.equal(parseIntent('陪我坐一会儿').activity.id, 'focus');
});

test('local recommendations are explainable, de-duplicated and drawn from the shelf', () => {
  const result = localRecommendation('我要学习四十分钟', shelf);
  assert.equal(result.source, 'local');
  assert.equal(result.minutes, 40);
  assert.equal(result.activity.id, 'study');
  assert.ok(result.albums.length >= 1 && result.albums.length <= 3);
  assert.equal(new Set(result.albums.map((album) => album.id)).size, result.albums.length);
  assert.ok(result.albums.every((album) => shelf.includes(album)));
  assert.match(result.reason, /本机/);
  assert.doesNotMatch(result.reason, /AI/);
});

test('sleep and workout avoid obviously wrong high/low energy records', () => {
  const sleep = localRecommendation('睡前听半小时', shelf);
  assert.ok(sleep.albums.length > 0);
  assert.ok(sleep.albums.every((album) => album.id !== 'party'));

  const workout = localRecommendation('健身 45 分钟', shelf);
  assert.ok(workout.albums.length > 0);
  assert.ok(workout.albums.every((album) => album.id !== 'sleep'));
});

test('caps a recommendation at three albums and handles an empty shelf', () => {
  const many = Array.from({ length: 6 }, (_, index) => ({
    id: `a${index}`,
    title: `安静专注 ${index}`,
    artist: 'A',
    genres: ['ambient', 'lofi'],
    trackDetails: minutes(10)
  }));
  assert.equal(localRecommendation('学习三小时', many).albums.length, 3);

  const empty = localRecommendation('学习五十分钟', []);
  assert.deepEqual(empty.albums, []);
  assert.match(empty.reason, /唱片架还是空的/);
});

test('AI shelf summaries and prompts stay bounded and contain only selection metadata', () => {
  const many = Array.from({ length: 52 }, (_, index) => ({
    ...shelf[index % shelf.length],
    id: `item-${index}`,
    cover: 'https://example.com/private-cover.jpg',
    trackDetails: minutes(30)
  }));
  const summary = aiShelfSummary(many);
  assert.equal(summary.length, AI_ALBUM_LIMIT);
  assert.ok(summary.every((row) => !('cover' in row) && !('trackDetails' in row)));
  const messages = buildAiMessages('学习五十分钟', parseIntent('学习五十分钟'), many);
  const user = JSON.parse(messages[1].content);
  assert.equal(user.shelf.length, AI_ALBUM_LIMIT);
  assert.equal(user.minutes, 50);
  assert.match(messages[0].content, /strict JSON|严格 JSON/);
  assert.match(messages[0].content, /不限于用户唱片架/);
});

test('AI JSON validation filters invented ids, duplicates and excess picks', () => {
  const selection = parseAiSelection('```json\n{"albumIds":["focus","ghost","focus","jazz","sleep","party"],"reason":"安静一点"}\n```', shelf);
  assert.equal(selection.source, 'ai');
  assert.deepEqual(selection.albums.map((album) => album.id), ['focus', 'jazz', 'sleep']);
  assert.equal(selection.reason, '安静一点');

  assert.equal(parseAiSelection('这不是 JSON', shelf), null);
  assert.equal(parseAiSelection('{"albumIds":"focus"}', shelf), null);
  assert.equal(parseAiSelection('{"albumIds":["ghost","missing"]}', shelf), null);
  assert.equal(parseAiSelection('{"albumIds":[]}', shelf), null);
  assert.equal(parseAiSelection('{"albumIds":["focus"]}', []), null);
});

test('a failed or unavailable AI selection falls back to the local shelf recommendation', () => {
  const request = '我要学习四十分钟';
  const intent = parseIntent(request);
  const result = parseAiSelection('{"albumIds":["invented"]}', shelf)
    || localRecommendation(intent, shelf);
  assert.equal(result.source, 'local');
  assert.equal(result.minutes, 40);
  assert.equal(result.activity.id, 'study');
  assert.ok(result.albums.length >= 1 && result.albums.length <= 3);
  assert.ok(result.albums.every((album) => shelf.includes(album)));
});

test('AI selection accepts numeric ids only when they match existing records', () => {
  const items = [{ id: 7, title: 'Seven', genres: ['ambient'] }];
  assert.equal(parseAiSelection('{"albumIds":[7,"7",8]}', items).albums[0].id, 7);
  assert.equal(parseAiSelection('{"albumIds":[8]}', items), null);
});

test('a complete AI plan is normalized into the exact onStart contract', () => {
  const plan = parseAiSelection(JSON.stringify({
    minutes: 45,
    activity: 'work',
    albumIds: ['jazz', 'focus'],
    autoplay: false,
    reason: '两段爵士，先轻后稳'
  }), shelf, parseIntent('工作五十分钟'));

  assert.equal(plan.source, 'ai');
  assert.equal(plan.minutes, 50, 'explicit request duration wins over a drifting model');
  assert.deepEqual(plan.activity, { id: 'work', label: '工作' });
  assert.deepEqual(plan.albumIds, ['jazz', 'focus']);
  assert.deepEqual(plan.albums.map((album) => album.id), ['jazz', 'focus']);
  assert.equal(plan.items, plan.albums);
  assert.equal(plan.autoplay, false);
  assert.equal(plan.reason, '两段爵士，先轻后稳');
});

test('explicit autoplay and focus fields stay authoritative; open requests may use the model plan', () => {
  const hold = parseAiSelection(JSON.stringify({
    minutes: 25,
    activity: 'sleep',
    albumIds: ['jazz'],
    autoplay: true,
    reason: '只先放上唱机'
  }), shelf, parseIntent('只把唱片放上唱机，学习五十分钟'));
  assert.equal(hold.minutes, 50);
  assert.deepEqual(hold.activity, { id: 'study', label: '学习' });
  assert.equal(hold.autoplay, false);

  const open = parseAiSelection(JSON.stringify({
    minutes: 42,
    activity: 'reading',
    albumIds: ['jazz'],
    autoplay: false,
    reason: '留一点安静'
  }), shelf, parseIntent('随便听听'));
  assert.equal(open.minutes, 42);
  assert.deepEqual(open.activity, { id: 'reading', label: '阅读' });
  assert.equal(open.autoplay, false);
});

test('invalid AI minutes and activity fall back to parseIntent instead of clamping or trusting the model', () => {
  for (const badMinutes of [5, 181, 50.5, '50', null, true]) {
    const plan = parseAiSelection(JSON.stringify({
      minutes: badMinutes,
      activity: 'gaming',
      albumIds: ['focus'],
      autoplay: 'yes',
      reason: '模型字段不可信'
    }), shelf, '睡前听点音乐');
    assert.equal(plan.minutes, 30);
    assert.deepEqual(plan.activity, { id: 'sleep', label: '睡前' });
    assert.equal(plan.autoplay, DEFAULT_AUTOPLAY);
    assert.equal(plan.reason, '模型字段不可信');
  }
});

test('legacy albumIds/reason output remains usable with local intent defaults', () => {
  const plan = parseAiSelection('{"albumIds":["jazz"],"reason":"旧格式也能接上"}', shelf, parseIntent('放松二十五分钟'));
  assert.equal(plan.source, 'ai');
  assert.equal(plan.minutes, 25);
  assert.deepEqual(plan.activity, { id: 'relax', label: '放松' });
  assert.equal(plan.autoplay, true);
  assert.deepEqual(plan.albums.map((album) => album.id), ['jazz']);
});

test('AI reasons are sanitized and capped at 100 characters', () => {
  const plan = parseAiSelection(JSON.stringify({
    minutes: 50,
    activity: 'study',
    albumIds: ['focus'],
    autoplay: true,
    reason: '音'.repeat(150)
  }), shelf, '学习五十分钟');
  assert.equal(Array.from(plan.reason).length, 100);
  assert.ok(plan.reason.length <= 100);
});

test('local recommendations expose the same playable plan shape', () => {
  const plan = localRecommendation('学习四十分钟', shelf);
  assert.equal(plan.source, 'local');
  assert.equal(plan.autoplay, true);
  assert.equal(plan.items, plan.albums);
  assert.deepEqual(plan.albumIds, plan.albums.map((album) => album.id));
  assert.ok(plan.albums.length >= 1 && plan.albums.length <= 3);
  assert.ok(Array.from(plan.reason).length <= 100);

  const empty = localRecommendation('学习四十分钟', []);
  assert.deepEqual(empty.albums, []);
  assert.deepEqual(empty.items, []);
  assert.equal(empty.autoplay, true);
});

test('confirmation revalidates album order and all plan fields against the current shelf', () => {
  const plan = parseAiSelection(JSON.stringify({
    minutes: 50,
    activity: 'study',
    albumIds: ['focus', 'jazz'],
    autoplay: false,
    reason: '准备开始'
  }), shelf, '学习五十分钟');

  const narrowed = normalizePlaybackPlan(plan, shelf.filter((album) => album.id !== 'jazz'), parseIntent('学习五十分钟'));
  assert.deepEqual(narrowed.albums.map((album) => album.id), ['focus']);
  assert.equal(narrowed.items, narrowed.albums);

  const tampered = normalizePlaybackPlan({
    source: 'ai',
    minutes: 999,
    activity: { id: 'not-allowed', label: '伪造' },
    items: [{ id: 'ghost' }, { id: 'focus' }, { id: 'focus' }],
    autoplay: 'yes',
    reason: ''
  }, shelf, '阅读四十五分钟');
  assert.equal(tampered.minutes, 45);
  assert.deepEqual(tampered.activity, { id: 'reading', label: '阅读' });
  assert.deepEqual(tampered.albums.map((album) => album.id), ['focus']);
  assert.equal(tampered.autoplay, true);
  assert.ok(Array.from(tampered.reason).length <= 100);

  assert.equal(normalizePlaybackPlan(plan, [], '学习五十分钟'), null);
});

test('the prompt advertises the full controlled JSON contract', () => {
  const messages = buildAiMessages('学习五十分钟', parseIntent('学习五十分钟'), shelf);
  const user = JSON.parse(messages[1].content);
  assert.deepEqual(user.allowedActivities, ACTIVITY_IDS);
  assert.equal(user.activity, 'study');
  assert.match(messages[0].content, /minutes/);
  assert.match(messages[0].content, /autoplay/);
  assert.match(messages[0].content, /tracks/);
  assert.match(messages[0].content, /唱片架之外/);
  assert.ok(Array.isArray(user.outputSchema.tracks));
});

test('AI playlists accept songs outside the shelf and keep only safe track fields', () => {
  const playlist = parseAiPlaylist(JSON.stringify({
    title: '纸上散步',
    description: '钢琴、氛围与低声爵士，给写作留出空间。',
    minutes: 50,
    activity: 'writing',
    autoplay: true,
    tracks: [
      { title: 'Near Light', artist: 'Ólafur Arnalds', album: 'Living Room Songs', providerId: 'must-not-survive' },
      { title: 'Near Light', artist: 'Ólafur Arnalds', album: 'duplicate' },
      { title: 'A Walk', artist: 'Tycho', album: 'Dive' }
    ]
  }), '写论文五十分钟');

  assert.equal(playlist.kind, 'playlist');
  assert.equal(playlist.title, '纸上散步');
  assert.equal(playlist.minutes, 50);
  assert.equal(playlist.activity.id, 'writing');
  assert.equal(playlist.tracks.length, 2);
  assert.deepEqual(Object.keys(playlist.tracks[0]).sort(), ['album', 'artist', 'title']);
  assert.equal(JSON.stringify(playlist).includes('must-not-survive'), false);
});

test('AI playlist parsing rejects empty or malformed track lists and caps output', () => {
  assert.equal(parseAiPlaylist('{"tracks":[]}'), null);
  assert.equal(parseAiPlaylist('{"tracks":[{"title":"only a title"}]}'), null);
  assert.equal(parseAiPlaylist('not json'), null);
  const many = Array.from({ length: AI_PLAYLIST_TRACK_LIMIT + 8 }, (_, index) => ({ title: `Song ${index}`, artist: 'Artist' }));
  assert.equal(parseAiPlaylist(JSON.stringify({ tracks: many })).tracks.length, AI_PLAYLIST_TRACK_LIMIT);
});

test('a parsed AI playlist becomes an ordinary shelf playlist with automatic playback metadata', () => {
  const parsed = parseAiPlaylist(JSON.stringify({
    title: '五十页之后',
    description: '低刺激，不打断阅读。',
    minutes: 50,
    activity: 'reading',
    autoplay: true,
    tracks: [
      { title: 'Says', artist: 'Nils Frahm', album: 'Spaces' },
      { title: 'Says', artist: 'Nils Frahm', album: 'Spaces' }
    ]
  }), '阅读五十分钟');
  const item = smartPlaylistItem(parsed, parsed.tracks, { id: 'fixed-playlist' });
  assert.equal(item.type, 'playlist');
  assert.equal(item.artist, '智能唱片机');
  assert.equal(item.externalIds.playlist, 'ai:fixed-playlist');
  assert.deepEqual(item.tracks, ['Says']);
  assert.equal(item.trackDetails[0].source, 'ai');
  assert.equal(item.trackDetails[0].providerId, '');
  assert.equal(item.trackDetails[0].artist, 'Nils Frahm');

  const plan = normalizePlaylistPlaybackPlan({ ...parsed, item, persisted: true }, '阅读五十分钟');
  assert.equal(plan.kind, 'playlist');
  assert.equal(plan.persisted, true);
  assert.equal(plan.items[0], plan.item);
  assert.equal(plan.item.tracks.length, 1);
  assert.equal(plan.item.trackDetails[0].source, 'ai');
  assert.equal(plan.autoplay, true);
});
