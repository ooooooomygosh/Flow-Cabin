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
        localStorage.setItem('flow-cabin-onboarding-v1', JSON.stringify({ version: 1, status: 'done', step: 'done' }));
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
