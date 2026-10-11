import { openRoomSettings, openMusicSettings, chooseSource } from './settings-actions.mjs';
import assert from 'node:assert/strict';
import { getRoomScene } from '../src/scene-catalog.mjs';

// User-visible layout contracts, shared by browser smoke and hidden Electron QA.
export async function verifyCabinLayout({ page, check = () => {} }) {
  const scene = getRoomScene(await page.locator('.cabin-scene').getAttribute('data-room-look'));
  const measure = await page.evaluate(() => {
    const card = document.querySelector('.room-now-playing'), art = document.querySelector('.cabin-scene-canvas');
    const r = card.getBoundingClientRect(), a = art.getBoundingClientRect();
    const opacity = el => { let value = 1; for (; el; el = el.parentElement) value *= Number(getComputedStyle(el).opacity); return value; };
    const controls = [...card.querySelectorAll('h2,p,button,a')];
    return { card: { left:r.left,right:r.right,top:r.top,bottom:r.bottom }, art:{left:a.left,width:a.width}, background:getComputedStyle(card).backgroundColor,
      opacity: controls.map(opacity), horizontalOverflow:document.documentElement.scrollWidth > innerWidth,
      recordBottom:Math.max(...[...document.querySelectorAll('.room-record')].map(e=>e.getBoundingClientRect().bottom)),
      buttonOverflow:[...card.querySelectorAll('button,a')].some(e=>{const b=e.getBoundingClientRect();return b.left<r.left-1||b.right>r.right+1||b.bottom>r.bottom+1;}) };
  });
  const scale = measure.art.width / 1448;
  assert(Math.abs(measure.card.left - (measure.art.left + scene.shelfFrame.left * scale)) <= 2, 'album card left follows rack frame');
  assert(Math.abs(measure.card.right - (measure.art.left + scene.shelfFrame.right * scale)) <= 2, 'album card right follows rack frame');
  assert(/(?:,\s*0\.7\)|\/\s*0\.7\))$/.test(measure.background), `background alpha must be 70%: ${measure.background}`);
  assert(measure.opacity.every(value => value === 1), 'title, metadata and buttons must remain opaque');
  assert.equal(measure.horizontalOverflow, false, 'no page horizontal overflow');
  assert.equal(measure.buttonOverflow, false, 'album actions stay inside the card');
  assert(measure.recordBottom <= measure.card.top + 1, 'album card must stay below record interactions');
  const heading = await page.locator('.turntable-heading').boundingBox();
  const tools = await page.getByRole('navigation', { name: '小屋设置', exact: true }).boundingBox();
  assert(tools.y >= heading.y + heading.height - 1, 'room tools follow the turntable heading');
  for (const name of ['筛选与唱片盒']) {
    const button = page.getByRole('button', { name, exact: true });
    assert.equal(await button.count(), 1, `${name} must have one reachable entry`);
    assert.equal(await button.evaluate(e => Boolean(e.closest('.room-turntable')) && !e.closest('.turntable-drag-handle')), true);
  }
  assert.equal(await page.locator('.room-turntable').getByLabel('唱机音源').count(), 0);
  for (const name of ['布置小屋', '音源设置']) assert.equal(await page.getByRole('button', { name, exact:true }).count(), 0);
  await page.getByRole('button', { name: '打开黑胶与专辑特写', exact:true }).waitFor();
  check('album-card-frame-alignment-background-alpha-and-console-tools');
  return measure;
}

export async function verifyCabinToolActions({ page, check = () => {} }) {
  const filter = page.getByRole('button', { name:'筛选与唱片盒', exact:true });
  await filter.click(); assert.equal(await filter.getAttribute('aria-expanded'), 'true');
  await page.getByLabel('筛选类型', { exact:true }).selectOption('song');
  await page.getByText('没有符合筛选的唱片。', { exact:true }).waitFor();
  assert.match(await filter.textContent(), /0/); assert.match(await filter.getAttribute('class'), /is-active/);
  await page.getByLabel('筛选类型', { exact:true }).selectOption('all'); await page.locator('.room-record').first().waitFor();
  await filter.click(); assert.equal(await filter.getAttribute('aria-expanded'), 'false');
  await openRoomSettings(page); await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name:'回到小屋',exact:true }).click();
  await openMusicSettings(page); await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
  await page.getByRole('button', { name:'移动唱机',exact:true }).press('Home');
  assert.equal(await page.locator('.room-turntable').getAttribute('data-moving'), 'false', 'tool actions do not start a drag');
  check('relocated-tools-filter-state-and-dialog-actions');
}

export async function verifyFocusLayout({ page }) {
  const measured = await page.evaluate(() => {
    const dock = document.querySelector('.focus-dock');
    const p = dock?.getBoundingClientRect();
    const hit = r => r.left < p.right - 1 && r.right > p.left + 1 && r.top < p.bottom - 1 && r.bottom > p.top + 1;
    const scene = document.querySelector('.cabin-scene');
    const background = getComputedStyle(scene, '::before');
    return { narrow:matchMedia('(max-width:900px)').matches, panel:p && { top:p.top,bottom:p.bottom,left:p.left,right:p.right },
      collisions:p ? [...document.querySelectorAll('.room-record-slot,.scene-deck')].filter(e=>hit(e.getBoundingClientRect())).length : 0,
      background:background.backgroundImage, backgroundVisible:background.display !== 'none', height:innerHeight,
      badgeVisible:document.querySelector('.focus-badge').getBoundingClientRect().width > 0 };
  });
  assert(measured.badgeVisible, 'timer badge remains reachable');
  assert(measured.backgroundVisible && measured.background !== 'none', 'scene backdrop fills exposed edges');
  if (measured.panel) {
    assert(measured.panel.top >= -1 && measured.panel.bottom <= measured.height + 1, 'focus panel stays within window');
    if (!measured.narrow) assert.equal(measured.collisions, 0, 'wide floating panel avoids actual record/deck rectangles');
    else assert(Math.abs(measured.panel.bottom - measured.height) <= 1, 'narrow focus tools use a bottom sheet');
  }
  return measured;
}
