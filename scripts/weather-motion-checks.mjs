import assert from 'node:assert/strict';

export async function verifyWeatherMotion(browser, origin, check) {
  for (const surface of ['cabin-room', 'wallpaper-room']) {
    for (const weather of ['rain', 'snow', 'starry']) {
      const context = await browser.newContext({ reducedMotion: 'no-preference', viewport: { width: 960, height: 600 } });
      const errors = [], external = [];
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) { external.push(url.href); return route.abort(); }
        if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/desktop-music/')) return route.fulfill({ json: { items: [] } });
        return route.continue();
      });
      await context.addInitScript(({ surface, weather }) => {
        if (location.origin === 'null') return;
        localStorage.setItem('flow-cabin-onboarding-v1', JSON.stringify({ version: 2, status: 'done', step: 'done', seenVersion: '1.21.2' }));
        localStorage.setItem('album-circle-performance-v1', 'quality');
        localStorage.setItem('album-circle-library-v1-local-owner', JSON.stringify({ rooms: { 'local-room': { look: 'forest' } } }));
        localStorage.setItem('album-circle-focus-v1:local-owner', JSON.stringify({ rewards: { xp: 50000, equipped: { weather } } }));
        if (surface === 'wallpaper-room') {
          window.weatherSnapshot = { look: 'forest', weather, items: [], petOut: true, reduceMotion: false };
          window.albumWallpaper = { getSnapshot: async () => window.weatherSnapshot, onSnapshot: cb => { window.pushWeatherSnapshot = cb; return () => {}; } };
        }
      }, { surface, weather });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      try {
        // Use the actual entry points, so fonts.css is present only in main.
        await page.goto(surface === 'wallpaper-room' ? `${origin}/wallpaper.html` : origin);
        // Window weather is pixel canvases on the shared frame clock: rain and snow fall in the
        // glass (front canvas), the starry sky twinkles behind the art (sky canvas).
        const selector = `.${surface} ${weather === 'starry' ? '.cabin-sky-canvas' : '.cabin-weather-canvas'}`;
        const snapshots = [];
        for (const [system, reduced] of [['no-preference', false], ['no-preference', true], ['no-preference', false], ['reduce', false]]) {
          await page.emulateMedia({ reducedMotion: system });
          await page.evaluate(({ surface, reduced }) => {
            if (surface === 'wallpaper-room') window.pushWeatherSnapshot({ ...window.weatherSnapshot, reduceMotion: reduced });
            else document.documentElement.dataset.desktopReduceMotion = String(reduced);
          }, { surface, reduced });
          const still = reduced || system === 'reduce';
          await page.locator(`.${surface} .cabin-scene[data-weather="${weather}"] .cabin-window-weather[data-motion="${still ? 'reduced' : 'running'}"]`).waitFor();
          assert.equal(await page.locator(`.${surface} .cabin-snow, .${surface} .cabin-weather`).count(), 0, 'no CSS pseudo weather is left');
          const read = () => page.locator(selector).first().evaluate((canvas) => {
            const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let hash = 0, lit = 0;
            for (let i = 0; i < data.length; i += 4) { if (data[i + 3]) lit++; hash = (hash * 31 + data[i] + data[i + 1] * 7 + data[i + 2] * 13 + data[i + 3] * 17) | 0; }
            return { hash, lit, systemReduced: matchMedia('(prefers-reduced-motion: reduce)').matches, appReduced: document.documentElement.dataset.desktopReduceMotion, motion: document.querySelector('.cabin-window-weather').dataset.motion };
          });
          const before = await read();
          if (!still) {
            await page.waitForFunction(({ selector, previous }) => {
              const canvas = document.querySelector(selector), data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
              let hash = 0; for (let i = 0; i < data.length; i += 4) hash = (hash * 31 + data[i] + data[i + 1] * 7 + data[i + 2] * 13 + data[i + 3] * 17) | 0;
              return hash !== previous;
            }, { selector, previous: before.hash }, { polling: 50, timeout: 10000 });
          } else await page.waitForTimeout(700);
          const after = await read();
          assert.equal(after.systemReduced, system === 'reduce'); assert.equal(after.appReduced, String(reduced));
          assert(after.lit > 0 && before.lit > 0, `${surface}/${weather}: the weather must stay visible`);
          if (still) {
            assert.equal(after.motion, 'reduced');
            assert.deepEqual(after, before, `${surface}/${weather}: reduced weather must remain still`);
          } else {
            assert.equal(after.motion, 'running');
            assert.notEqual(after.hash, before.hash, `${surface}/${weather}: weather must move`);
          }
          snapshots.push({ system, reduced, ...after });
        }
        check(`weather-canvas-motion-${surface}-${weather}`, { snapshots });
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
      } finally { await context.close(); }
    }
  }
}

// Regression for the window "flipping back and forth" after a click: picking a 窗景 (and then
// following real weather) cross-fades over 30 s; during that fade the clouds must drift smoothly,
// not jump to a new place every frame, and the scene's weather must change exactly once per click.
export async function verifyWeatherSwitchSteady(browser, origin, check) {
  const context = await browser.newContext({ reducedMotion: 'no-preference', viewport: { width: 1280, height: 800 } });
  const errors = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/desktop-music/')) return route.fulfill({ json: { items: [] } });
    return route.continue();
  });
  await context.addInitScript(() => {
    if (location.origin === 'null') return;
    if (!sessionStorage.getItem('weather-switch')) {
      sessionStorage.setItem('weather-switch', '1');
      localStorage.setItem('flow-cabin-onboarding-v1', JSON.stringify({ version: 2, status: 'done', step: 'done', seenVersion: '1.21.2' }));
      localStorage.setItem('album-circle-performance-v1', 'quality');
      localStorage.setItem('album-circle-library-v1-local-owner', JSON.stringify({ rooms: { 'local-room': { look: 'forest' } } }));
      localStorage.setItem('album-circle-focus-v1:local-owner', JSON.stringify({ rewards: { xp: 50000, equipped: { weather: 'snow' } } }));
      localStorage.setItem('flow-cabin-sky-v1', JSON.stringify({ place: 'shanghai', realWeather: false }));
    }
    // A fake desktop shell answering the page's `weather` command with a windy storm report.
    window.albumDesktopAppearance = { client: true };
    window.open = (href) => {
      const url = new URL(href); if (!url.pathname.endsWith('/weather')) return null;
      const on = url.searchParams.get('enabled') === 'true';
      setTimeout(() => { window.cabinWeather = on ? { kind: 'cloudy', intensity: 1, wind: .95, fetchedAt: Date.now() } : null; window.dispatchEvent(new CustomEvent('cabin:weather', { detail: window.cabinWeather })); }, 150);
      return null;
    };
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin); await page.locator('button.room-cat').waitFor();
    await page.locator('.cabin-scene[data-sky="live"]').waitFor(); await page.waitForTimeout(800);
    // Frame-to-frame change of the sky canvas (clouds) and every weather the scene showed.
    const watch = (ms) => page.evaluate(async (ms) => {
      const canvas = document.querySelector('.cabin-sky-canvas'), ctx = canvas.getContext('2d'), kinds = [];
      let previous = null, worst = 0; const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        const kind = document.querySelector('.cabin-scene').dataset.weather; if (kinds.at(-1) !== kind) kinds.push(kind);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        // A cloud moving shows as pixels switching on/off (big alpha steps); the 30 s veil fade only nudges alpha.
        if (previous) { let changed = 0, lit = 0; for (let i = 3; i < data.length; i += 4) { if (data[i] || previous[i]) lit++; if (Math.abs(data[i] - previous[i]) > 40) changed++; } worst = Math.max(worst, lit ? changed / lit : 0); (window.__series ||= []).push(Math.round(100 * changed / (lit || 1))); }
        previous = data; await new Promise((r) => setTimeout(r, 100));
      }
      const series = window.__series; window.__series = []; return { kinds, worst: Math.round(worst * 1000) / 10, series };
    }, ms);
    await page.locator('button.room-cat').dblclick();
    const steps = [];
    for (const [name, act, kind] of [
      ['雨天窗景', () => page.getByRole('button', { name: '雨天窗景' }).first().click(), 'rain'],
      ['雪夜窗景', () => page.getByRole('button', { name: '雪夜窗景' }).first().click(), 'snow'],
      ['跟随真实天气', () => page.evaluate(async () => (await import('/src/sky-clock.mjs')).writeSkySettings({ realWeather: true })), 'cloudy']
    ]) {
      const watching = watch(2500); await act(); const result = await watching; steps.push({ name, ...result });
      assert.equal(result.kinds.at(-1), kind, `${name}: the window ends on ${kind} (${result.kinds})`);
      assert.ok(result.kinds.length <= 2, `${name}: the window must not flip back and forth (${result.kinds.join(' → ')})`);
      // Clouds drift a pixel or two per 100 ms; a jump moves most of them (≈ 40–90 % before the fix).
      assert.ok(result.worst < 25, `${name}: clouds jumped (${result.worst}% of sky pixels changed in 100 ms)`);
    }
    check('window-weather-switch-steady', { steps });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}
