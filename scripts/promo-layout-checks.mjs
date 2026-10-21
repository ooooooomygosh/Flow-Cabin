/** Layout regressions for the lower promo page, shared by local and production verification. */
import assert from 'node:assert/strict';

export async function checkPromoLowerLayout(page, { check, screenshot }) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(async () => {
    document.querySelectorAll('img').forEach((image) => { image.loading = 'eager'; });
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
  });
  for (const width of [1920, 1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
    await page.locator('.cabin-faq details').evaluateAll((items) => items.forEach((item) => { item.open = false; }));
    const layout = await page.evaluate(() => {
      const faq = document.querySelector('.cabin-faq');
      const images = [...document.querySelectorAll('.proof-shot img')].map((image) => {
        const style = getComputedStyle(image), box = image.getBoundingClientRect();
        return { loaded: image.complete && image.naturalWidth > 0, fit: style.objectFit,
          ratio: box.width / box.height, naturalRatio: image.naturalWidth / image.naturalHeight };
      });
      const cards = [...document.querySelectorAll('.proof-shot')].map((card) => {
        const media = card.querySelector('.proof-media') || card.querySelector('img');
        return { height: card.getBoundingClientRect().height,
          content: media.getBoundingClientRect().height + card.querySelector('figcaption').getBoundingClientRect().height };
      });
      const outside = [...document.querySelectorAll('.proof-chapter h2, .proof-shot, .proof-numbers, .cabin-faq h2, .cabin-faq summary, .download-section h2, .download-actions a, .release-note, .site-footer nav a')]
        .filter((element) => { const r = element.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1); })
        .map((element) => element.className || element.tagName);
      return { faqBackground: getComputedStyle(faq).backgroundColor, images, cards, outside,
        overflow: document.documentElement.scrollWidth > innerWidth,
        summaries: [...faq.querySelectorAll('summary')].map((element) => element.getBoundingClientRect().height) };
    });
    assert.notEqual(layout.faqBackground, 'rgba(0, 0, 0, 0)', 'FAQ needs an explicit background matching its text');
    assert.equal(layout.overflow, false, `${width}px document must fit`);
    assert.deepEqual(layout.outside, [], `${width}px lower-page content must fit, even with overflow clipping`);
    assert(layout.images.every((image) => image.loaded && (image.fit === 'contain' || Math.abs(image.ratio - image.naturalRatio) < .02)), `${width}px feature screenshots must be fully visible`);
    assert(layout.cards.every((card) => card.height - card.content < 8), `${width}px feature cards must not leave stretched empty tails`);
    assert(layout.summaries.length === 6 && layout.summaries.every((height) => height >= 44), 'FAQ targets must be reachable');
    await checkContrast(page, width);
    check(`lower-layout-and-contrast-${width}`);
    for (const [name, selector] of Object.entries({ proof: '.proof-chapter', faq: '.cabin-faq', download: '.download-section', footer: '.site-footer' })) {
      await screenshot(`promo-${name}-${width}`, page.locator(selector));
    }
    const summaries = page.locator('.cabin-faq summary');
    for (let index = 0; index < 6; index++) {
      await summaries.nth(index).focus();
      await page.keyboard.press('Enter');
      assert.equal(await summaries.nth(index).evaluate((element) => element.parentElement.open), true);
      const covered = await summaries.nth(index).evaluate((element) => {
        const box = element.getBoundingClientRect(), nav = document.querySelector('.site-header nav');
        if (getComputedStyle(nav).position !== 'fixed') return false;
        const dock = nav.getBoundingClientRect();
        return box.bottom > dock.top && box.top < dock.bottom;
      });
      assert.equal(covered, false, `${width}px keyboard-focused FAQ must stay above the fixed navigation`);
      const answer = summaries.nth(index).locator('..').locator('p');
      assert.equal(await answer.isVisible(), true);
      const bounds = await answer.evaluate((element) => {
        const box = element.getBoundingClientRect(), parent = element.closest('details').getBoundingClientRect();
        return { inside: box.left >= 0 && box.right <= innerWidth && box.bottom <= parent.bottom + 1,
          fontSize: parseFloat(getComputedStyle(element).fontSize), clipped: element.scrollHeight > element.clientHeight + 1 };
      });
      assert(bounds.inside && bounds.fontSize >= 14 && !bounds.clipped, `${width}px FAQ ${index + 1} answer must stay readable`);
    }
    await checkContrast(page, width);
    await screenshot(`promo-faq-expanded-${width}`, page.locator('.cabin-faq'));
    await summaries.first().focus();
    await page.keyboard.press('Space');
    assert.equal(await summaries.first().evaluate((element) => element.parentElement.open), false, 'native FAQ closes with Space');
    check(`faq-keyboard-open-close-and-expanded-layout-${width}`);
    await page.locator('.cabin-faq details').evaluateAll((items) => items.forEach((item) => { item.open = false; }));
    if ([1440, 390].includes(width)) {
      await page.evaluate(() => scrollTo(0, 0));
      await screenshot(`promo-full-${width}`, null, { fullPage: true });
    }
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}

async function checkContrast(page, width) {
  const failures = await page.evaluate(() => {
    const rgb = (value) => (value.match(/[\d.]+/g) || []).map(Number);
    const blend = (front, back) => { const alpha = front[3] ?? 1; return front.slice(0, 3).map((value, i) => value * alpha + back[i] * (1 - alpha)); };
    const luminance = (color) => color.map((value) => { const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    const selectors = '.proof-chapter .chapter-index, .proof-chapter h2, .proof-chapter .chapter-head > p, .proof-shot h3, .proof-shot h3 span, .proof-shot figcaption p, .proof-numbers b, .proof-numbers span, .proof-enlarge, .cabin-faq h2, .cabin-faq h3, .cabin-faq p, .cabin-faq summary, .cabin-faq a, .download-section h2, .download-copy > p, .download-actions a, .download-window small, .download-window > p, .release-note, .release-note a, .site-footer b, .site-footer small, .site-footer p, .site-footer nav a';
    return [...document.querySelectorAll(selectors)].filter((element) => element.checkVisibility()).flatMap((element) => {
      const ancestors = []; for (let parent = element; parent; parent = parent.parentElement) ancestors.unshift(parent);
      let background = [255, 255, 255];
      for (const parent of ancestors) background = blend(rgb(getComputedStyle(parent).backgroundColor), background);
      const foreground = blend(rgb(getComputedStyle(element).color), background);
      const light = luminance(foreground), dark = luminance(background), ratio = (Math.max(light, dark) + .05) / (Math.min(light, dark) + .05);
      return ratio >= 4.5 ? [] : [{ text: element.textContent.trim().slice(0, 42), ratio: Number(ratio.toFixed(2)) }];
    });
  });
  assert.deepEqual(failures, [], `${width}px lower-page text contrast must reach 4.5:1`);
}
