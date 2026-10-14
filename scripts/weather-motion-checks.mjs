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
        const selector = weather === 'snow' ? '.cabin-snow' : '.cabin-weather';
        const names = weather === 'rain' ? ['cabin-rain-a', 'cabin-rain-b'] : weather === 'snow' ? ['cabin-snowfall-a', 'cabin-snowfall-b'] : ['cabin-twinkle'];
        const snapshots = [];
        for (const [system, reduced] of [['no-preference', false], ['no-preference', true], ['no-preference', false], ['reduce', false]]) {
          await page.emulateMedia({ reducedMotion: system });
          await page.evaluate(({ surface, reduced }) => {
            if (surface === 'wallpaper-room') window.pushWeatherSnapshot({ ...window.weatherSnapshot, reduceMotion: reduced });
            else document.documentElement.dataset.desktopReduceMotion = String(reduced);
          }, { surface, reduced });
          await page.locator(`.${surface} .cabin-scene[data-weather="${weather}"] ${selector}`).waitFor();
          const read = () => page.locator(selector).evaluate((element, names) => ({
            systemReduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
            appReduced: document.documentElement.dataset.desktopReduceMotion,
            pseudo: ['::before', '::after'].slice(0, names.length).map(pseudo => {
              const css = getComputedStyle(element, pseudo);
              return { name: css.animationName, state: css.animationPlayState, content: css.content, transform: css.transform, opacity: css.opacity };
            }),
            animations: element.getAnimations({ subtree: true }).filter(a => names.includes(a.animationName)).map(a => ({ name: a.animationName, state: a.playState, time: a.currentTime }))
          }), names);
          await page.waitForFunction(({ selector, names, reduced }) => {
            const element = document.querySelector(selector);
            return element && document.documentElement.dataset.desktopReduceMotion === String(reduced) &&
              names.every((name, index) => getComputedStyle(element, index ? '::after' : '::before').animationName ===
                (reduced || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : name));
          }, { selector, names, reduced });
          const before = await read();
          if (!reduced && system === 'no-preference') {
            await page.waitForFunction(({ selector, previous }) => {
              const animations = document.querySelector(selector).getAnimations({ subtree: true });
              return previous.every(old => animations.some(a => a.animationName === old.name && a.currentTime > old.time));
            }, { selector, previous: before.animations }, { polling: 50, timeout: 10000 });
          } else await page.waitForTimeout(150);
          const after = await read();
          assert.equal(after.systemReduced, system === 'reduce'); assert.equal(after.appReduced, String(reduced));
          if (reduced || system === 'reduce') {
            assert(after.pseudo.every(p => p.name === 'none'), `${surface}/${weather}: pseudo animations must be disabled`);
            assert.deepEqual(after.animations, []);
            assert.deepEqual(after.pseudo, before.pseudo, 'reduced weather must remain still');
          } else {
            assert.deepEqual(after.pseudo.map(p => p.name), names);
            assert(after.pseudo.every(p => p.state === 'running' && !['none', 'normal'].includes(p.content)));
            assert.equal(after.animations.length, names.length);
            for (const animation of after.animations) {
              assert.equal(animation.state, 'running');
              assert(animation.time > before.animations.find(a => a.name === animation.name)?.time, `${surface}/${weather}: animation must advance ${JSON.stringify({ before, after })}`);
            }
          }
          snapshots.push({ system, reduced, ...after });
        }
        check(`weather-pseudo-motion-${surface}-${weather}`, { snapshots });
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
      } finally { await context.close(); }
    }
  }
}
