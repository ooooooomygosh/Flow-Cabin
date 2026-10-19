const site = document.querySelector('.site');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

const rooms = {
  pixel: {
    name: '像素小屋',
    copy: '雪窗、木架与暖暖的壁炉',
    image: '/promo/rooms/pixel.webp',
    accent: '#d8a66c',
    note: '雪落在窗外，壁炉把地板照成蜂蜜色。'
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
    note: '叶子把下午的光筛得很细，风从拱形窗里进来。'
  },
  seaside: {
    name: '海边慢屋',
    copy: '推开圆窗，让海风陪午后的唱片',
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

const weatherNames = { clear: '晴', rain: '雨', snow: '雪' };
const tracks = [
  { title: 'Dreamer', artist: 'Laufey · Bewitched', cover: '/promo/covers/bewitched.jpg', duration: '3:29' },
  { title: 'While You Were Sleeping', artist: 'Laufey · Bewitched', cover: '/promo/covers/bewitched.jpg', duration: '2:58' },
  { title: 'Lovesick', artist: 'Laufey · Bewitched', cover: '/promo/covers/bewitched.jpg', duration: '3:45' },
  { title: 'California and Me', artist: 'Laufey · Bewitched', cover: '/promo/covers/bewitched.jpg', duration: '3:36' }
];

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
  playing: false,
  progress: 18,
  track: 0,
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
  if (state.letterTab === 'cabin') updateLetter();
}

function updateTime() {
  site.dataset.time = state.time;
  const time = times[state.time];
  $('#hero-time').textContent = time.clock;
  updateWeather();
  $$('[data-time-choice]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.timeChoice === state.time));
  });
  setCatBubble(time.bubble);
  if (state.letterTab === 'cabin') updateLetter();
}

function updateWeather() {
  site.dataset.weather = state.weather;
  $('#hero-weather').textContent = times[state.time].weather[state.weather];
  $$('[data-weather-choice]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.weatherChoice === state.weather));
  });
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
    sprite.dataset.action = action;
    const label = action === 'typing' ? '奶糖正在跟着你敲字' : action === 'groove' ? '奶糖在跟着音乐摇摆' : '奶糖正趴在小屋里等你';
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

function registerCompanionMoment() {
  state.typingCount += 1;
  $('#typing-count').textContent = `${state.typingCount} 次陪伴`;
  if (state.typingCount === 8) toast('奶糖攒到一条小鱼干。');
}

function updateTrack() {
  const track = tracks[state.track];
  $('#track-number').textContent = String(state.track + 1).padStart(2, '0');
  $('#track-title').textContent = track.title;
  $('#track-artist').textContent = track.artist;
  $('#track-cover').src = track.cover;
  const sleeveCover = $('.record-sleeve img');
  if (sleeveCover) sleeveCover.src = track.cover;
  $$('.tracklist button').forEach((button, index) => {
    button.classList.toggle('is-active', index === state.track);
    if (index === state.track) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
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
    state.track = (state.track + 1) % tracks.length;
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
        `现在是 ${times[state.time].clock}，${room.name}的灯还亮着。${room.note}`,
        '不用把所有事都做完。回来坐一会儿，灯和唱片都还在。'
      ],
      tags: ['专注 225 分钟', '完成 3 轮', `${times[state.time].label} · ${times[state.time].clock}`]
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
      registerCompanionMoment();
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
  registerCompanionMoment();
  typingTimer = setTimeout(() => {
    setCat(state.catPinned);
    setCatBubble(times[state.time].bubble);
  }, 1100);
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key.length === 1 || ['Backspace', 'Enter', 'Delete'].includes(event.key)) {
    temporaryCat('typing', null, 620);
  }
});

document.addEventListener('pointerdown', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('button, a, input, textarea, select, [role="tab"]')) return;
  temporaryCat('typing', '看见你点这里啦。', 560);
});

$$('[data-vinyl-toggle]').forEach((button) => {
  button.addEventListener('click', toggleVinyl);
});

$$('.tracklist button').forEach((button) => {
  button.addEventListener('click', () => {
    state.track = Number(button.dataset.track);
    state.progress = 8;
    updateTrack();
    renderPlaying();
    if (!state.playing) {
      state.playing = true;
      renderPlaying();
    }
    setCat('groove', { pinned: true });
    toast(`切到「${tracks[state.track].title}」。`);
  });
});

$$('[data-focus-preset]').forEach((button) => {
  button.addEventListener('click', () => {
    setFocusPreset(Number(button.dataset.focusPreset), button.dataset.focusName);
  });
});

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
updateTrack();
renderPlaying();
renderFocus();
updateLetter();
updateScrollMeter();
setCatBubble(times[state.time].bubble);
