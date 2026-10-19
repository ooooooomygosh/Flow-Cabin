const site = document.querySelector('.site');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const latestReleaseEndpoint = 'https://api.github.com/repos/ooooooomygosh/album-web/releases/latest';
const fallbackLatestVersion = 'v1.21.4';

const rooms = {
  pixel: {
    name: '像素小屋',
    copy: '木架、壁炉和一扇会变的窗',
    image: '/promo/rooms/pixel.webp',
    accent: '#d8a66c',
    note: '壁炉把地板照成蜂蜜色，木架上的唱片安静地排着。'
  },
  warm: {
    name: '琥珀小屋',
    copy: '泡一杯热茶，在琥珀色灯光里慢慢听歌',
    image: '/promo/rooms/warm.webp',
    accent: '#dba668',
    note: '茶的热气升起来，灯光刚好比刚才暖一点。'
  },
  'night-study': {
    name: '月夜书桌',
    copy: '暖灯下写几行字，停下来转一转笔',
    image: '/promo/rooms/night-study.webp',
    accent: '#d6a56b',
    note: '窗边的人还在写字，笔在手指间转了半圈。'
  },
  forest: {
    name: '林间书屋',
    copy: '浇浇窗边的植物，转半圈花盆再读几页',
    image: '/promo/rooms/forest.webp',
    accent: '#b7c59a',
    note: '叶子把窗外的光筛得很细，风从拱形窗里进来。'
  },
  seaside: {
    name: '海边慢屋',
    copy: '推开圆窗，让海风陪一张慢慢转的唱片',
    image: '/promo/rooms/seaside.webp',
    accent: '#bcd4c3',
    note: '圆窗外有潮声，窗内的唱片也慢半拍。'
  },
  starlight: {
    name: '星夜阁楼',
    copy: '抬起望远镜，亲手连一张想象星图',
    image: '/promo/rooms/starlight.webp',
    accent: '#c1b7db',
    note: '阁楼很安静，只听见灯丝和远处的星。'
  }
};

const times = {
  morning: {
    label: '晨光',
    clock: '07:20',
    greeting: '早上好，先让窗子亮一点。',
    bubble: '今天也一起写两行吧。',
    weather: { clear: '薄雾 · 4°C', rain: '小雨 · 3°C', snow: '小雪 · 1°C' }
  },
  day: {
    label: '午后',
    clock: '14:40',
    greeting: '下午好，唱针可以慢一点落。',
    bubble: '我陪你把这个下午过完。',
    weather: { clear: '晴 · 19°C', rain: '阵雨 · 15°C', snow: '雪 · 2°C' }
  },
  dusk: {
    label: '黄昏',
    clock: '17:10',
    greeting: '天暗下来了，开一盏小灯。',
    bubble: '快收工啦，剩下一点明天再做。',
    weather: { clear: '晚霞 · 12°C', rain: '细雨 · 10°C', snow: '细雪 · 3°C' }
  },
  night: {
    label: '夜深',
    clock: '23:10',
    greeting: '夜深了，做完这一点就休息。',
    bubble: '夜深了，做完这一点就休息。',
    weather: { clear: '晴夜 · 8°C', rain: '夜雨 · 7°C', snow: '雪夜 · -1°C' }
  }
};

const weatherNames = { clear: '晴天', rain: '雨天', snow: '雪天' };
const weatherMoments = {
  clear: {
    morning: '薄雾刚刚散开，晨光落在窗沿上。',
    day: '阳光停在窗边，木头的纹路被照得很清楚。',
    dusk: '晚霞没有急着退，给屋里留下一层薄金。',
    night: '晴夜很安静，几颗星停在窗外。'
  },
  rain: {
    morning: '细小的雨点敲着玻璃，屋里比平时更安静。',
    day: '阵雨落下来，窗外的颜色被洗得发亮。',
    dusk: '雨还没停，路灯在水汽里晕开。',
    night: '夜雨轻轻敲窗，适合把声音调低一点。'
  },
  snow: {
    morning: '薄雪落在窗台，天光像一张没有写字的纸。',
    day: '雪把外面变得很慢，屋里的灯显得更暖。',
    dusk: '细雪飘进暮色，窗边已经亮起了灯。',
    night: '雪落在窗外，壁炉把地板照成蜂蜜色。'
  }
};
const studyTracks = [
  { id: 'study-dreamer', title: 'Dreamer', artist: 'Laufey', album: 'Bewitched', cover: '/promo/covers/bewitched.jpg', duration: '3:29' },
  { id: 'study-singalongsong', title: 'Singalongsong', artist: '方大同', album: '橙月', cover: '/promo/covers/orange-moon.jpg', duration: '3:18' },
  { id: 'study-cambrian', title: '寒武纪', artist: '王菲', album: '寓言', cover: '/promo/covers/fable.jpg', duration: '5:19' },
  { id: 'study-from-start', title: 'From The Start', artist: 'Laufey', album: 'Bewitched', cover: '/promo/covers/bewitched.jpg', duration: '2:49' },
  { id: 'study-three', title: '三人游', artist: '方大同', album: '橙月', cover: '/promo/covers/orange-moon.jpg', duration: '3:57' },
  { id: 'study-new-guest', title: '新房客', artist: '王菲', album: '寓言', cover: '/promo/covers/fable.jpg', duration: '4:55' },
  { id: 'study-letter', title: 'Letter to My 13 Year Old Self', artist: 'Laufey', album: 'Bewitched', cover: '/promo/covers/bewitched.jpg', duration: '4:20' }
];

const writeTracks = [
  { id: 'write-black-white', title: '黑白', artist: '方大同', album: '橙月', cover: '/promo/covers/orange-moon.jpg', duration: '4:12' },
  { id: 'write-misty', title: 'Misty', artist: 'Laufey', album: 'Bewitched', cover: '/promo/covers/bewitched.jpg', duration: '3:29' },
  { id: 'write-forget', title: '笑忘书', artist: '王菲', album: '寓言', cover: '/promo/covers/fable.jpg', duration: '4:15' },
  { id: 'write-little-bug', title: '小小虫', artist: '方大同', album: '橙月', cover: '/promo/covers/orange-moon.jpg', duration: '3:49' },
  { id: 'write-promise', title: 'Promise', artist: 'Laufey', album: 'Bewitched', cover: '/promo/covers/bewitched.jpg', duration: '3:37' },
  { id: 'write-spider-lily', title: '彼岸花', artist: '王菲', album: '寓言', cover: '/promo/covers/fable.jpg', duration: '5:17' }
];

const sleepTracks = [
  { id: 'sleep-while', title: 'While You Were Sleeping', artist: 'Laufey', album: 'Bewitched', cover: '/promo/covers/bewitched.jpg', duration: '2:58' },
  { id: 'sleep-everyone', title: '每个人都会', artist: '方大同', album: '橙月', cover: '/promo/covers/orange-moon.jpg', duration: '4:07' },
  { id: 'sleep-chanel', title: '香奈儿', artist: '王菲', album: '寓言', cover: '/promo/covers/fable.jpg', duration: '4:53' },
  { id: 'sleep-serendipity', title: 'Serendipity', artist: 'Laufey', album: 'Bewitched', cover: '/promo/covers/bewitched.jpg', duration: '3:35' },
  { id: 'sleep-for-you', title: '为你写的歌', artist: '方大同', album: '橙月', cover: '/promo/covers/orange-moon.jpg', duration: '3:45' },
  { id: 'sleep-asura', title: '阿修罗', artist: '王菲', album: '寓言', cover: '/promo/covers/fable.jpg', duration: '4:01' },
  { id: 'sleep-bewitched', title: 'Bewitched', artist: 'Laufey', album: 'Bewitched', cover: '/promo/covers/bewitched.jpg', duration: '3:02' },
  { id: 'sleep-new-guest', title: '新房客', artist: '王菲', album: '寓言', cover: '/promo/covers/fable.jpg', duration: '4:55' }
];

const smartPicks = {
  study: {
    ask: '学习 50 分钟，编一张完整歌单',
    intent: '学习 · 50 分钟',
    title: '留白专注 · 50 分钟',
    tracks: studyTracks,
    reason: '从唱片架之外补进钢琴、爵士与弦乐；节奏稳定，前 6 首不抢注意力，最后留一首慢慢收尾。',
    minutes: 50,
    focusName: '深度'
  },
  write: {
    ask: '写作 45 分钟，编一张完整歌单',
    intent: '写作 · 45 分钟',
    title: '把句子铺开 · 45 分钟',
    tracks: writeTracks,
    reason: '温暖、有呼吸感；人声与器乐交替，不把旋律堆满，写到停下来时也还有空间。',
    minutes: 45,
    focusName: '写作'
  },
  sleep: {
    ask: '睡前 30 分钟，编一张轻一点的歌单',
    intent: '睡前 · 30 分钟',
    title: '关灯前 · 30 分钟',
    tracks: sleepTracks,
    reason: '音量轻、留白多，从熟悉的人声慢慢降到更安静的段落，不急着把这一晚结束。',
    minutes: 30,
    focusName: '睡前'
  }
};

function inferTime() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 16) return 'day';
  if (hour >= 16 && hour < 19) return 'dusk';
  return 'night';
}

const state = {
  room: 'pixel',
  time: inferTime(),
  weather: 'clear',
  catChoice: 'wait',
  catReturnTimer: 0,
  catPinned: 'wait',
  typingCount: 0,
  keyboardCount: 0,
  clickCount: 0,
  playing: false,
  progress: 18,
  track: 0,
  activeTracks: smartPicks.study.tracks,
  smartPick: 'study',
  smartAutoplay: true,
  smartSaved: false,
  focusPreset: 50,
  focusName: '深度',
  focusRemaining: 50 * 60,
  focusRunning: false,
  focusTimer: 0,
  letterTab: 'cabin',
  toastTimer: 0
};

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

function applyLatestVersion(tagName) {
  const tag = typeof tagName === 'string' ? tagName.trim() : '';
  if (!tag || tag.length > 32) return;
  const label = /^v/i.test(tag) ? tag : `v${tag}`;
  $$('[data-latest-version]').forEach((node) => {
    node.textContent = label;
  });
}

async function syncLatestVersion() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(latestReleaseEndpoint, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal
    });
    if (!response.ok) return;
    const release = await response.json();
    applyLatestVersion(release?.tag_name);
  } catch {
    // The static v1.21.4 copy keeps the page useful when GitHub is unreachable.
  } finally {
    clearTimeout(timeout);
  }
}

function toast(message) {
  const node = $('[data-toast]');
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => node.classList.remove('is-visible'), 2200);
}

function currentDateLabel() {
  const now = new Date();
  return `${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${times[state.time].clock}`;
}

function updateRoom() {
  const room = rooms[state.room];
  site.dataset.room = state.room;
  site.style.setProperty('--scene-image', `url("${room.image}")`);
  site.style.setProperty('--scene-accent', room.accent);
  $('[data-room-name]').textContent = room.name;
  $('[data-room-copy]').textContent = room.copy;
  $$('[data-room-choice]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.roomChoice === state.room));
  });
  updateLetter();
}

function updateTime() {
  site.dataset.time = state.time;
  const time = times[state.time];
  $('#hero-time').textContent = time.clock;
  updateWeather();
  $$('[data-time-choice]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.timeChoice === state.time));
  });
  $$('[data-day-time]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.dayTime === state.time));
  });
  setCatBubble(time.bubble);
}

function updateWeather() {
  site.dataset.weather = state.weather;
  $('#hero-weather').textContent = times[state.time].weather[state.weather];
  $$('[data-weather-choice]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.weatherChoice === state.weather));
  });
  updateLetter();
}

function setCatBubble(message) {
  $$('[data-cat-bubble]').forEach((bubble) => {
    if (message !== bubble.textContent) bubble.textContent = message;
  });
}

function setCat(action, { pinned = false } = {}) {
  clearTimeout(state.catReturnTimer);
  state.catChoice = action;
  if (pinned) state.catPinned = action;
  $$('[data-cat-action]').forEach((sprite) => {
    sprite.dataset.catAction = action;
    const label = action === 'typing'
      ? '奶糖正在跟着你敲字'
      : action === 'click'
        ? '奶糖正伸爪拍着桌上的小老鼠'
        : action === 'groove'
          ? '奶糖在跟着音乐摇摆'
          : '奶糖正趴在小屋里等你';
    sprite.setAttribute('aria-label', label);
  });
  $$('[data-cat-choice]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.catChoice === state.catPinned));
  });
}

function temporaryCat(action, message, duration = 950) {
  clearTimeout(state.catReturnTimer);
  setCat(action);
  if (message) setCatBubble(message);
  state.catReturnTimer = setTimeout(() => {
    setCat(state.catPinned);
    setCatBubble(times[state.time].bubble);
  }, duration);
}

function renderCompanionCounts() {
  $('#keyboard-count').textContent = state.keyboardCount.toLocaleString('zh-CN');
  $('#click-count').textContent = state.clickCount.toLocaleString('zh-CN');
  $('#typing-count').textContent = state.typingCount.toLocaleString('zh-CN');
}

function registerCompanionMoment(type = 'keyboard') {
  if (type === 'click') state.clickCount += 1;
  else state.keyboardCount += 1;
  state.typingCount += 1;
  renderCompanionCounts();
  if (state.typingCount === 8) toast('奶糖已经陪你敲了一会儿，记得喝水。');
}

function updateTrack() {
  const track = state.activeTracks[state.track];
  if (!track) return;
  $('#track-number').textContent = String(state.track + 1).padStart(2, '0');
  $('#track-title').textContent = track.title;
  $('#track-artist').textContent = `${track.artist} · ${track.album}`;
  $('#track-cover').src = track.cover;
  const sleeveCover = $('.record-sleeve img');
  if (sleeveCover) sleeveCover.src = track.cover;
  $$('.tracklist button').forEach((button, index) => {
    button.classList.toggle('is-active', index === state.track);
    if (index === state.track) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
}

function selectTrack(index) {
  const track = state.activeTracks[index];
  if (!track) return;
  state.track = index;
  state.progress = 8;
  updateTrack();
  if (!state.playing) state.playing = true;
  renderPlaying();
  setCat('groove', { pinned: true });
  toast(`切到「${track.title}」。`);
}

function renderTurntableTrackList() {
  const list = $('.tracklist');
  const fragment = document.createDocumentFragment();
  state.activeTracks.forEach((track, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.track = String(index);

    const order = document.createElement('span');
    order.textContent = String(index + 1).padStart(2, '0');
    const duration = document.createElement('small');
    duration.textContent = track.duration;

    button.append(order, document.createTextNode(` ${track.title} `), duration);
    button.addEventListener('click', () => selectTrack(index));
    item.append(button);
    fragment.append(item);
  });
  list.replaceChildren(fragment);
  updateTrack();
}

function renderSmartTrackList(pick) {
  const list = $('#smart-picks');
  const fragment = document.createDocumentFragment();
  pick.tracks.forEach((track, index) => {
    const item = document.createElement('li');
    item.className = 'smart-pick';
    item.dataset.trackId = track.id;

    const order = document.createElement('span');
    order.className = 'smart-order';
    order.setAttribute('aria-hidden', 'true');
    order.textContent = String(index + 1).padStart(2, '0');

    const cover = document.createElement('img');
    cover.src = track.cover;
    cover.alt = `${track.album} 专辑封面`;

    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = track.title;
    const meta = document.createElement('small');
    meta.textContent = `${track.artist} · ${track.album}`;
    copy.append(title, meta);

    const tag = document.createElement('span');
    tag.className = 'smart-tag';
    tag.textContent = index === 0 ? '第 1 首 · 放上唱机' : '待播';

    item.append(order, cover, copy, tag);
    fragment.append(item);
  });
  list.replaceChildren(fragment);
  list.setAttribute('aria-label', `${pick.title} · 歌单曲目`);
}

function renderSmartAutoplay() {
  $$('[data-smart-autoplay]').forEach((button) => {
    const active = (button.dataset.smartAutoplay === 'true') === state.smartAutoplay;
    button.setAttribute('aria-pressed', String(active));
  });
  const start = $('[data-smart-start]');
  start.textContent = state.smartAutoplay ? '保存并开始这一轮' : '保存歌单，开始专注';
  $('#smart-start-hint').textContent = state.smartAutoplay
    ? '同时开始专注与播放'
    : '只开始专注，歌单保持暂停';
}

function renderSmartSaved() {
  const save = $('[data-smart-save]');
  save.disabled = state.smartSaved;
  save.textContent = state.smartSaved ? '已保存到唱片架' : '保存到唱片架';
}

function renderSmartPick(id) {
  const pick = smartPicks[id];
  if (!pick) return;
  state.smartPick = id;
  state.smartSaved = false;
  $('#smart-ask-text').textContent = pick.ask;
  $('#smart-intent').textContent = pick.intent;
  $('#smart-count').textContent = `${pick.tracks.length} 首 · 外部歌单`;
  renderSmartTrackList(pick);
  $('#smart-title').textContent = pick.title;
  $('#smart-description').textContent = pick.reason;
  $('#smart-status').textContent = `AI 演示 · 已编排 ${pick.tracks.length} 首`;
  renderSmartAutoplay();
  renderSmartSaved();
  $$('[data-smart-request]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.smartRequest === id));
  });
}

function saveSmartPick() {
  const pick = smartPicks[state.smartPick];
  if (!pick || state.smartSaved) return;
  state.smartSaved = true;
  renderSmartSaved();
  $('#smart-status').textContent = 'AI 演示 · 已收进唱片架';
  toast(`《${pick.title}》已保存到唱片架，可以整张放上唱机。`);
}

function startSmartPick() {
  const pick = smartPicks[state.smartPick];
  const first = pick?.tracks?.[0];
  if (!first) return;
  state.smartSaved = true;
  renderSmartSaved();
  setFocusPreset(pick.minutes, pick.focusName);
  state.activeTracks = pick.tracks;
  state.track = 0;
  state.progress = 8;
  renderTurntableTrackList();
  state.playing = state.smartAutoplay;
  renderPlaying();
  toggleFocus();
  setCat(state.smartAutoplay ? 'groove' : 'wait', { pinned: true });
  setCatBubble(state.smartAutoplay ? '第一首已经转起来了。' : '整张歌单放好了，等你按播放。');
  $('#smart-status').textContent = state.smartAutoplay ? 'AI 演示 · 正在播放' : 'AI 演示 · 等待播放';
  const playback = state.smartAutoplay
    ? `《${pick.title}》从第一首开始播`
    : `《${pick.title}》已放上唱机，保持暂停`;
  toast(`已保存到唱片架，并开始 ${pick.minutes} 分钟专注；${playback}。`);
  $('#focus').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' });
}

function renderPlaying() {
  const demo = $('.turntable-demo');
  demo.dataset.playing = String(state.playing);
  $('#deck-state').textContent = state.playing ? '正在播放 · 演示' : '播放已暂停';
  $$('[data-vinyl-toggle]').forEach((button) => button.setAttribute('aria-pressed', String(state.playing)));
  $$('[data-play-label]').forEach((label) => { label.textContent = state.playing ? '暂停' : '播放'; });
  $('.play-progress i').style.width = `${state.progress}%`;
}

function toggleVinyl() {
  state.playing = !state.playing;
  renderPlaying();
  if (state.playing) {
    setCat('groove', { pinned: true });
    setCatBubble('这首歌我也喜欢。');
    toast('唱片开始转了。这里只演示界面，不播放音频。');
  } else {
    setCat(state.catPinned === 'groove' ? 'wait' : state.catPinned, { pinned: true });
    setCatBubble(times[state.time].bubble);
  }
}

setInterval(() => {
  if (!state.playing) return;
  state.progress += .18;
  if (state.progress >= 100) {
    state.progress = 8;
    state.track = (state.track + 1) % state.activeTracks.length;
    updateTrack();
  }
  $('.play-progress i').style.width = `${state.progress}%`;
}, 500);

function formatFocus(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}${String(rest).padStart(2, '0')}`;
}

function renderFocus(animate = false) {
  const value = formatFocus(state.focusRemaining);
  $$('.flip-digit').forEach((digit, index) => {
    if (digit.textContent === value[index]) return;
    digit.textContent = value[index];
    if (animate && !reduceMotion.matches) {
      digit.classList.remove('is-flipping');
      void digit.offsetWidth;
      digit.classList.add('is-flipping');
    }
  });
  $('#focus-mode-label').textContent = state.focusName;
  $('#focus-status').textContent = state.focusRunning ? '专注进行中' : state.focusRemaining === state.focusPreset * 60 ? '准备开始' : '已暂停';
  const toggle = $('[data-focus-toggle]');
  toggle.textContent = state.focusRunning ? '暂停这一轮' : state.focusRemaining < state.focusPreset * 60 ? '继续这一轮' : '开始这一轮';
  $$('[data-focus-preset]').forEach((button) => {
    const active = Number(button.dataset.focusPreset) === state.focusPreset;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function setFocusPreset(minutes, name) {
  clearInterval(state.focusTimer);
  state.focusRunning = false;
  state.focusPreset = minutes;
  state.focusName = name;
  state.focusRemaining = minutes * 60;
  $('#focus-quote').textContent = minutes >= 90 ? '把手机放远一点，世界会安静下来。' : minutes >= 50 ? '把这一轮留给自己。' : '先做完手边这一小步。';
  renderFocus();
}

function toggleFocus() {
  if (state.focusRemaining <= 0) state.focusRemaining = state.focusPreset * 60;
  state.focusRunning = !state.focusRunning;
  clearInterval(state.focusTimer);
  if (state.focusRunning) {
    setCat('wait', { pinned: true });
    setCatBubble('这一轮，我替你看着钟。');
    state.focusTimer = setInterval(() => {
      state.focusRemaining -= 1;
      renderFocus(true);
      if (state.focusRemaining <= 0) {
        clearInterval(state.focusTimer);
        state.focusRunning = false;
        renderFocus();
        setCat('groove', { pinned: true });
        setCatBubble('完成啦，休息一下。');
        toast('这一轮完成了。去喝口水吧。');
      }
    }, 1000);
  } else {
    setCatBubble(times[state.time].bubble);
  }
  renderFocus();
}

const letterCopy = {
  cabin() {
    const room = rooms[state.room];
    return {
      title: `小屋来信 · ${times[state.time].label}`,
      body: [
        '这一周，你在小屋里专注了 <b>225 分钟</b>，完成 <b>3 轮</b>。',
        `现在是 ${times[state.time].clock}，${room.name}外面是${weatherNames[state.weather]}。${weatherMoments[state.weather][state.time]}${room.note}`,
        '不用把所有事都做完。回来坐一会儿，灯和唱片都还在。'
      ],
      tags: ['专注 225 分钟', '完成 3 轮', `${weatherNames[state.weather]} · ${times[state.time].clock}`]
    };
  },
  journal() {
    return {
      title: '今日手记 · 给今天留一页',
      body: [
        '今天没有发生什么大事。只是把桌面收干净了，听完了半张唱片，又把拖了很久的一件小事做完了。',
        `写到这里的时候，${rooms[state.room].name}外面是${weatherNames[state.weather]}。奶糖在桌边打了一个很轻的哈欠。`,
        '这一页不用给谁看。下次回来时，它会替你记得今天。'
      ],
      tags: ['手记可搜索', '标签与草稿', '保存在本机']
    };
  },
  weekly() {
    return {
      title: '本周折页 · 第 42 周',
      body: [
        '你回来了 <b>5 天</b>，最长的一次专注持续了 <b>50 分钟</b>。晚上 9 点以后，这间小屋最常亮着。',
        '本周听得最多的是《Bewitched》，翻得最多的是「学习生活」。奶糖收到了 4 条小鱼干。',
        '下周不必更努力，只要还愿意回来就好。'
      ],
      tags: ['连续 5 天', '50 分钟最长专注', '4 条小鱼干']
    };
  }
};

function updateLetter() {
  const copy = letterCopy[state.letterTab]();
  $('#letter-date').textContent = currentDateLabel();
  $('#letter-title').textContent = copy.title;
  $('#letter-body').innerHTML = copy.body.map((paragraph) => `<p>${paragraph}</p>`).join('');
  $('#letter-tags').innerHTML = copy.tags.map((tag) => `<li>${tag}</li>`).join('');
  $$('[data-letter-tab]').forEach((button) => {
    button.setAttribute('aria-selected', String(button.dataset.letterTab === state.letterTab));
  });
}

function updateScrollMeter() {
  const height = document.documentElement.scrollHeight - innerHeight;
  $('.scroll-meter i').style.width = `${height > 0 ? Math.min(100, scrollY / height * 100) : 0}%`;
}

function chooseRoom(id, scroll = false) {
  if (!rooms[id]) return;
  state.room = id;
  updateRoom();
  toast(`已把${rooms[id].name}搬到首屏。`);
  if (scroll) $('#top').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' });
}

function chooseTime(id) {
  if (!times[id]) return;
  state.time = id;
  updateTime();
}

function chooseWeather(id) {
  if (!weatherNames[id]) return;
  state.weather = id;
  updateWeather();
  toast(`窗外换成了${weatherNames[id]}。`);
}

$$('[data-time-choice]').forEach((button) => {
  button.addEventListener('click', () => chooseTime(button.dataset.timeChoice));
});

$$('[data-weather-choice]').forEach((button) => {
  button.addEventListener('click', () => chooseWeather(button.dataset.weatherChoice));
});

$$('[data-room-choice]').forEach((button) => {
  button.addEventListener('click', () => chooseRoom(button.dataset.roomChoice));
});

$$('[data-day-time]').forEach((button) => {
  button.addEventListener('click', () => {
    chooseTime(button.dataset.dayTime);
    toast(`把同一间房切到${times[button.dataset.dayTime].label}。`);
    $('#top').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  });
});

$$('[data-gallery-room]').forEach((card) => {
  card.addEventListener('click', () => chooseRoom(card.dataset.galleryRoom, true));
  card.style.setProperty('--card-accent', card.dataset.accent);
});

$$('[data-cat-choice]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.catChoice;
    setCat(action, { pinned: true });
    if (action === 'typing') {
      setCatBubble('你敲哪里，我就敲哪里。');
    } else if (action === 'click') {
      setCatBubble('你点一下，我也拍一下。');
    } else if (action === 'groove') {
      setCatBubble('这首歌我也喜欢。');
    } else {
      setCatBubble(times[state.time].bubble);
    }
  });
});

$('[data-cat-poke]').addEventListener('click', () => {
  $$('[data-cat-action]').forEach((sprite) => {
    sprite.classList.remove('is-poked');
    void sprite.offsetWidth;
    sprite.classList.add('is-poked');
    sprite.addEventListener('animationend', () => sprite.classList.remove('is-poked'), { once: true });
  });
  temporaryCat('groove', '呼噜呼噜……再摸一下。', 760);
});

let typingTimer = 0;
$('#pet-typing').addEventListener('input', () => {
  clearTimeout(typingTimer);
  temporaryCat('typing', '你敲哪里，我就敲哪里。', 1100);
  registerCompanionMoment('keyboard');
  typingTimer = setTimeout(() => {
    setCat(state.catPinned);
    setCatBubble(times[state.time].bubble);
  }, 1100);
});

$('[data-promo-click]').addEventListener('click', () => {
  clearTimeout(state.catReturnTimer);
  setCat('click', { pinned: true });
  setCatBubble('你点一下，我也拍一下。');
  registerCompanionMoment('click');
  state.catReturnTimer = setTimeout(() => {
    setCat(state.catPinned);
    setCatBubble(times[state.time].bubble);
  }, 720);
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key.length === 1 || ['Backspace', 'Enter', 'Delete'].includes(event.key)) {
    temporaryCat('typing', null, 620);
    registerCompanionMoment('keyboard');
  }
});

document.addEventListener('pointerdown', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('button, a, input, textarea, select, [role="tab"]')) return;
  temporaryCat('click', '看见你点这里啦。', 560);
  registerCompanionMoment('click');
});

renderCompanionCounts();

$$('[data-vinyl-toggle]').forEach((button) => {
  button.addEventListener('click', toggleVinyl);
});

$$('[data-focus-preset]').forEach((button) => {
  button.addEventListener('click', () => {
    setFocusPreset(Number(button.dataset.focusPreset), button.dataset.focusName);
  });
});

$$('[data-smart-request]').forEach((button) => {
  button.addEventListener('click', () => renderSmartPick(button.dataset.smartRequest));
});

$$('[data-smart-autoplay]').forEach((button) => {
  button.addEventListener('click', () => {
    state.smartAutoplay = button.dataset.smartAutoplay === 'true';
    renderSmartAutoplay();
    $('#smart-status').textContent = state.smartAutoplay ? 'AI 演示 · 确认后播放' : 'AI 演示 · 确认后暂停';
  });
});

$('[data-smart-save]').addEventListener('click', saveSmartPick);
$('[data-smart-start]').addEventListener('click', startSmartPick);

$('[data-focus-toggle]').addEventListener('click', toggleFocus);
$('[data-focus-reset]').addEventListener('click', () => {
  clearInterval(state.focusTimer);
  state.focusRunning = false;
  state.focusRemaining = state.focusPreset * 60;
  renderFocus();
  setCatBubble(times[state.time].bubble);
});

$('[data-card-flip]').addEventListener('click', (event) => {
  const button = event.currentTarget;
  const flipped = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(flipped));
  button.setAttribute('aria-label', flipped ? '显示词卡正面' : '翻到词卡背面');
});

$$('[data-letter-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    state.letterTab = button.dataset.letterTab;
    updateLetter();
  });
});

const note = $('#cabin-note');
const noteCount = $('[data-note-count]');
note.addEventListener('input', () => { noteCount.textContent = note.value.length; });

$('[data-letter-form]').addEventListener('submit', (event) => {
  event.preventDefault();
  const value = note.value.trim();
  if (!value) {
    toast('先写一句想留下来的话。');
    note.focus();
    return;
  }
  const reply = $('[data-letter-reply]');
  reply.hidden = false;
  $('p', reply).textContent = `现在是${times[state.time].clock}，${rooms[state.room].name}的窗外是${weatherNames[state.weather]}。你写下的这句话，我替你放在了灯边。不用立刻想明白，先做完手边这一小步，回来时奶糖还在。`;
  toast('这封信已放进本页的小屋。');
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('is-seen');
  });
}, { threshold: .12 });

$$('.chapter, .download-section').forEach((section) => observer.observe(section));

addEventListener('scroll', updateScrollMeter, { passive: true });
addEventListener('resize', updateScrollMeter);

updateRoom();
updateTime();
renderTurntableTrackList();
renderPlaying();
renderFocus();
renderSmartPick(state.smartPick);
updateScrollMeter();
setCatBubble(times[state.time].bubble);
applyLatestVersion(fallbackLatestVersion);
void syncLatestVersion();
