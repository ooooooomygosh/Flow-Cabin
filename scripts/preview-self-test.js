/* Disposable QA preview only. Human-triggered UI tests; never ship in release.
 * Operates only when the explicit fixture banner is present. All test data is
 * fictional, and downloads are captured in memory for assertions. No native
 * OS, account authentication, or live music-provider claims are made.
 */
(() => {
  'use strict';
  const mount = () => {
    const panel = document.createElement('details'); panel.id = 'qa-self-test';
    Object.assign(panel.style, { position: 'fixed', bottom: '6px', left: '8px', zIndex: '2147483647', background: '#192521f2', color: '#eff5e7', border: '1px solid #9db99e', borderRadius: '8px', padding: '7px 10px', font: '12px/1.5 sans-serif', maxWidth: '460px', maxHeight: '55vh', overflow: 'auto' });
    const summary = document.createElement('summary'); summary.textContent = '预览自检（仅模拟数据）'; panel.append(summary);
    const motionLabel = document.createElement('label'); motionLabel.style.cssText = 'display:block;margin:6px 0';
    const motion = document.createElement('input'); motion.type = 'checkbox'; motion.checked = document.documentElement.dataset.desktopReduceMotion === 'true'; motion.setAttribute('aria-label', '模拟减少动态效果');
    motion.onchange = () => { if (!document.getElementById('qa-preview-banner')) return; window.albumDesktopAppearance = { ...(window.albumDesktopAppearance || {}), reduceMotion: motion.checked }; document.documentElement.dataset.desktopReduceMotion = String(motion.checked); window.dispatchEvent(new CustomEvent('album-desktop-settings', { detail: window.albumDesktopAppearance })); };
    motionLabel.append(motion, document.createTextNode(' 模拟减少动态效果（不更改系统设置）')); panel.append(motionLabel);
    const button = document.createElement('button'); button.textContent = '运行预览自检'; button.type = 'button'; panel.append(button);
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = '会操作本页演示收藏、工具与音源；不连接真实账号。'; panel.append(status);
    const output = document.createElement('pre'); output.id = 'qa-self-test-report'; output.style.cssText = 'white-space:pre-wrap;max-height:260px;overflow:auto;font-size:10px'; panel.append(output); document.body.append(panel);
    const visible = e => e && e.getClientRects().length > 0;
    const findButton = name => [...document.querySelectorAll('button')].find(e => !panel.contains(e) && visible(e) && (e.getAttribute('aria-label') === name || e.textContent.trim() === name));
    const wait = async (predicate, label, timeout = 10000) => { const end = Date.now() + timeout; while (Date.now() < end) { const result = predicate(); if (result) return result; await new Promise(r => setTimeout(r, 40)); } throw new Error('Timeout: ' + label); };
    const click = async name => { const e = await wait(() => findButton(name), name); e.click(); await new Promise(r => setTimeout(r, 60)); };
    const input = async (label, value) => { const e = await wait(() => [...document.querySelectorAll('input,textarea,select')].find(n => visible(n) && (n.getAttribute('aria-label') === label || n.labels?.[0]?.textContent.trim().startsWith(label))), label); const prototype = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(e, value); e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); e.focus(); e.blur(); await new Promise(r => setTimeout(r, 80)); };
    button.onclick = async () => {
      if (!document.getElementById('qa-preview-banner')?.textContent.includes('交互验证预览')) { status.textContent = '拒绝运行：没有模拟数据标识'; return; }
      button.disabled = true; panel.open = false;
      const report = { fixtureOnly: true, nativeTested: false, startedAt: new Date().toISOString(), viewport: { width: innerWidth, height: innerHeight }, checks: [], errors: [], passed: false };
      const pass = name => { report.checks.push({ name, passed: true }); status.textContent = `已通过 ${report.checks.length} 项：${name}`; output.textContent = JSON.stringify(report, null, 2); };
      const assert = (condition, message) => { if (!condition) throw new Error(message); };
      const errorListener = event => report.errors.push(event.message || String(event.reason));
      window.addEventListener('error', errorListener); window.addEventListener('unhandledrejection', errorListener);
      const originalObjectURL = URL.createObjectURL.bind(URL), blobs = new Map(), downloads = [];
      URL.createObjectURL = blob => { const url = originalObjectURL(blob); blobs.set(url, blob); return url; };
      const originalFetch = window.fetch, originalSetItem = Storage.prototype.setItem; let releaseCover;
      const imageSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src'), cleanRequests = [];
      Object.defineProperty(HTMLImageElement.prototype, 'src', { ...imageSrc, set(value) { if (String(value).includes('-cabin-clean.png')) cleanRequests.push(String(value)); return imageSrc.set.call(this, value); } });
      const originalAnchorClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { if (this.download) { downloads.push({ name: this.download, blob: blobs.get(this.href) }); return; } return originalAnchorClick.call(this); };
      try {
        await wait(() => document.querySelector('.room-record'), 'room mount');
        assert(!document.querySelector('dialog[open]'), 'Close existing dialogs before running');
        if (document.querySelector('.focus-dock-close')) await click('收起专注工具');
        pass('fixture room mounted');
        await click('布置小屋');
        for (const [id, name] of [['pixel', '像素小屋'], ['warm', '琥珀小屋'], ['night-study', '月夜书桌'], ['forest', '林间书屋'], ['seaside', '海边慢屋'], ['starlight', '星夜阁楼']]) {
          await click('选择场景 ' + name); await wait(() => document.querySelector('.cabin-scene')?.dataset.roomLook === id, id); pass('scene ' + id);
          if (['pixel', 'warm'].includes(id)) {
            const layer = await wait(() => document.querySelector('.cabin-atmosphere[data-motion=reduced]'), id + ' clean artwork loads', 25000);
            const snapshotAtmosphere = () => JSON.stringify({ snow: layer.querySelector('.cabin-window-snow').toDataURL(), fire: layer.querySelector('.cabin-hearth-fire').toDataURL(), lights: [...layer.querySelectorAll('[data-surface]')].map(e => e.style.opacity) });
            const reducedFrame = snapshotAtmosphere(); await new Promise(r => setTimeout(r, 350)); assert(snapshotAtmosphere() === reducedFrame, id + ' reduced atmosphere changed');
            assert(!matchMedia('(prefers-reduced-motion: reduce)').matches, 'OS reduced-motion prevents normal-motion fixture test'); motion.checked = false; motion.dispatchEvent(new Event('change'));
            await wait(() => layer.dataset.motion === 'running', id + ' atmosphere running'); const runningFrame = snapshotAtmosphere(); await new Promise(r => setTimeout(r, 650)); assert(snapshotAtmosphere() !== runningFrame, id + ' atmosphere did not animate');
            motion.checked = true; motion.dispatchEvent(new Event('change')); await wait(() => layer.dataset.motion === 'reduced', id + ' reduced restored'); pass(id + ' atmosphere loaded running and reduced');
          } else { assert(!document.querySelector('.cabin-atmosphere'), id + ' used unsupported atmosphere'); assert(!cleanRequests.some(url => url.includes('/' + id + '-cabin-clean.png')), id + ' requested nonexistent clean artwork'); pass(id + ' has no cabin-only layer or clean request'); }
        }
        for (const [id, name] of [['cat', '奶糖'], ['chick', '蛋挞'], ['bunny', '棉花'], ['bear', '可可'], ['fox', '枫糖']]) { await click('选择桌宠 ' + name); await wait(() => document.querySelector('.room-cat .pixel-cat')?.dataset.petId === id, id); pass('pet ' + id); }
        await click('回到小屋'); assert(document.documentElement.scrollWidth <= innerWidth, 'Horizontal page overflow'); pass('viewport horizontal fit');
        const setSkin = async name => { document.querySelector('.focus-badge').click(); await new Promise(r => setTimeout(r, 80)); await click('统计'); await click(name); await click('收起专注工具'); };
        await click('布置小屋'); await click('选择桌宠 奶糖'); await click('回到小屋'); await setSkin('黑猫'); assert(document.querySelector('.room-cat canvas').dataset.skin === 'black', 'Cat black skin missing'); pass('cat black palette applies');
        for (const [id, name] of [['chick', '蛋挞'], ['bunny', '棉花'], ['bear', '可可'], ['fox', '枫糖']]) {
          await click('布置小屋'); await click('选择桌宠 ' + name); await click('回到小屋'); const canvas = document.querySelector('.room-cat canvas');
          assert(canvas.dataset.petId === id && !canvas.hasAttribute('data-skin'), 'Cat palette leaked to ' + id); await click('布置小屋'); const blackChoicePixels = document.querySelector('.pet-choice[aria-pressed=true] canvas').toDataURL(); await click('回到小屋'); await setSkin('橘猫'); await click('布置小屋'); assert(document.querySelector('.pet-choice[aria-pressed=true] canvas').toDataURL() === blackChoicePixels, 'Palette change recolored ' + id); await click('回到小屋'); await setSkin('黑猫'); pass('cat palette leaves ' + id + ' unchanged');
        }
        const savedLibrary = () => JSON.parse(localStorage.getItem('album-circle-library-v1-local-owner') || '{}');
        const handle = document.querySelector('.turntable-drag-handle'); assert(handle, 'Movable turntable handle absent');
        const press = async key => { handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); await new Promise(r => setTimeout(r, 80)); };
        const initialLeft = document.querySelector('.room-turntable').getBoundingClientRect().left; await press('ArrowRight');
        assert(document.querySelector('.room-turntable').getBoundingClientRect().left > initialLeft + 5, 'ArrowRight did not move turntable');
        assert(Number.isFinite(savedLibrary().rooms?.['local-room']?.turntable?.x), 'Turntable preference not stored'); pass('turntable keyboard movement and stored fractions');
        await press('Home'); assert(!savedLibrary().rooms?.['local-room']?.turntable, 'Home did not reset stored position'); pass('turntable Home resets position');
        const initialLook = document.querySelector('.cabin-scene').dataset.roomLook;
        Storage.prototype.setItem = function (key, value) { if (key === 'album-circle-library-v1-local-owner') throw new Error('模拟存储写入失败'); return originalSetItem.call(this, key, value); };
        await click('布置小屋'); await click('选择场景 林间书屋'); assert(document.querySelector('.cabin-scene').dataset.roomLook === initialLook, 'Failed preference write changed scene'); await wait(() => [...document.querySelectorAll('[role=alert]')].some(e => e.textContent.includes('模拟存储写入失败')), 'storage failure alert');
        Storage.prototype.setItem = originalSetItem; await click('选择场景 星夜阁楼'); await click('回到小屋'); pass('failed preference write keeps prior state and reports error');
        for (const [mode, expectedColour] of [['auto', '#2a7f93'], ['manual', '#b35f72']]) {
          const sample = document.createElement('canvas'); sample.width = sample.height = 48; const ctx = sample.getContext('2d'); ctx.fillStyle = expectedColour; ctx.fillRect(0, 0, 48, 48); const sampleURL = sample.toDataURL('image/png');
          const coverGate = new Promise(resolve => { releaseCover = resolve; });
          window.fetch = async (source, options) => { if (String(source) === sampleURL) await coverGate; return originalFetch(source, options); };
          const colourTitle = '延迟封面自检 ' + mode + ' ' + Date.now();
          await click('添加专辑'); await click('手动填写'); await input('专辑名', colourTitle); await input('歌手', '自检演示作者'); await input('封面图片链接', sampleURL); await input('曲目', '颜色测试'); await click('放上唱片架'); await wait(() => document.querySelector('.add-notice')?.textContent.includes(colourTitle), 'colour album add'); await click('关闭添加专辑');
          [...document.querySelectorAll('.room-record')].find(e => e.getAttribute('aria-label')?.includes(colourTitle)).click(); await click('自定义唱片');
          await input('黑胶透明度', '62'); if (mode === 'manual') await input('黑胶底色', '#00aa77');
          await click('保存唱片设置'); releaseCover(); releaseCover = null; window.fetch = originalFetch;
          await click('自定义唱片'); const finalColour = mode === 'manual' ? '#00aa77' : expectedColour;
          await wait(() => document.querySelector('.record-editor input[type=color]')?.value === finalColour, 'late cover resolves without losing colour choice'); assert(document.querySelector('.record-editor input[type=range]').value === '62', 'Late cover lost opacity'); pass('late cover early-save ' + mode + ' colour and opacity');
          if (mode === 'manual') { await click('恢复默认黑胶'); await wait(() => document.querySelector('.record-editor input[type=color]')?.value === expectedColour, 'reset uses sampled colour'); await click('保存唱片设置'); pass('manual override resets to automatic cover colour'); }
          else await click('取消');
          await click('唱片卡片'); await click('移除'); await click('确认移除'); await wait(() => !document.querySelector('dialog[open]'), 'colour fixture removed');
        }
        await click('沉入桌面'); await wait(() => document.querySelector('.wallpaper-error')?.textContent.includes('模拟桌面背景启动失败'), 'wallpaper fixture error'); await click('关闭动态背景提示'); assert(!document.querySelector('.wallpaper-error'), 'Wallpaper error did not dismiss'); pass('simulated wallpaper error dismissal');
        await click('沉入桌面'); await click('取消沉入桌面'); await new Promise(r => setTimeout(r, 450)); assert(findButton('沉入桌面'), 'Cancelled fixture startup reactivated'); pass('simulated wallpaper startup cancellation');
        await click('沉入桌面'); await wait(() => findButton('浮出桌面'), 'wallpaper fixture retry'); await click('浮出桌面'); pass('simulated wallpaper retry and stop');
        const title = '预览自检唱片 ' + Date.now();
        await click('添加专辑'); await click('手动填写'); await input('专辑名', title); await input('歌手', '自检演示作者'); await input('曲目', '测试第一首\n测试第二首'); await click('放上唱片架'); await wait(() => document.querySelector('.add-notice')?.textContent.includes(title), 'manual add'); await click('关闭添加专辑');
        const record = await wait(() => [...document.querySelectorAll('.room-record')].find(e => e.getAttribute('aria-label')?.includes(title)), 'new record'); record.click(); await click('唱片卡片'); await input('我的笔记', '预览自检笔记'); await wait(() => document.querySelector('.record-card-saved')?.textContent.includes('已保存在'), 'notes saved'); pass('collection add and notes update');
        await click('移除'); await click('确认移除'); await wait(() => !document.querySelector('dialog[open]'), 'remove close'); assert(![...document.querySelectorAll('.room-record')].some(e => e.getAttribute('aria-label')?.includes(title)), 'Album remains after delete'); pass('collection confirmed deletion');
        document.querySelector('.focus-badge').click(); await new Promise(r => setTimeout(r, 80)); await click('待办'); const task = '自检待办 ' + Date.now(); await input('新的待办', task); await click('添加待办'); await click('完成：' + task); assert([...document.querySelectorAll('.focus-task-list .is-done')].some(e => e.textContent.includes(task)), 'Task not completed'); pass('task create and complete');
        await click('随手记'); await input('随手记内容', '预览自检随手记\n只用于模拟测试'); pass('quick notes input'); await click('番茄钟'); await click('计时设置'); await input('专注（分）', '1');
        for (const label of ['系统通知', '提示音']) { const check = [...document.querySelectorAll('.focus-check')].find(e => e.textContent.trim() === label)?.querySelector('input'); if (check?.checked) check.click(); }
        const hideSeconds = [...document.querySelectorAll('.focus-check')].find(e => e.textContent.trim() === '隐藏秒数（仅显示剩余分钟）')?.querySelector('input'); assert(hideSeconds, 'Hide-seconds setting missing'); if (!hideSeconds.checked) hideSeconds.click();
        await click('开始专注'); await wait(() => document.querySelector('.focus-phase')?.textContent === '专注中', 'timer starts'); await click('暂停'); await wait(() => document.querySelector('.focus-phase')?.textContent.includes('已暂停'), 'timer pauses'); await click('继续'); assert(document.querySelector('.focus-badge').textContent.includes('1 分钟'), 'Minute-only badge missing'); pass('timer start pause resume'); pass('hideSeconds preserves minute-only display'); await click('收起专注工具');
        await click('收藏与备份'); await click('导出备份'); const backupFile = await wait(() => downloads.find(d => d.name.endsWith('.json') && d.blob), 'backup download'); const backup = JSON.parse(await backupFile.blob.text()); assert(backup.kind === 'FlowCabinBackup' && backup.items.length >= 18, 'Invalid backup'); assert(backup.focus.notes.includes('预览自检随手记'), 'Quick notes missing from backup'); assert(backup.focus.tasks.some(t => t.text === task && t.done), 'Completed task missing from backup'); pass('backup includes collection notes and task'); await click('关闭收藏与备份');
        document.querySelector('.room-record').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await input('唱机音源', 'local'); await wait(() => { const a = document.querySelector('audio[data-deck="active"]'); return a && !a.paused && a.currentTime > .2 && a.duration === 15; }, 'generated audio playback', 15000); pass('real generated WAV playback'); await input('唱机音源', 'system'); await wait(() => document.querySelector('.turntable-track')?.textContent.includes('模拟系统歌曲'), 'system fixture'); await click('暂停系统播放器'); await wait(() => findButton('继续系统播放器'), 'system pause'); pass('mocked system transport'); await input('唱机音源', 'visual');
        await click('专辑墙'); document.querySelector('.wall-library-album').click(); await wait(() => document.querySelector('.wall-preview-bar')?.textContent.includes('×'), 'wall paint'); await click('下载 PNG'); const png = await wait(() => downloads.find(d => d.name.endsWith('.png') && d.blob), 'PNG download'); assert(png.blob.type === 'image/png' && png.blob.size > 1000, 'Invalid wall PNG'); pass('album wall exports PNG'); await click('关闭专辑墙编辑器');
        document.querySelector('.focus-badge').click(); await new Promise(r => setTimeout(r, 80)); await click('番茄钟'); await wait(() => document.querySelector('.focus-phase')?.textContent.includes('短休息'), 'real one-minute focus completion', 75000); await click('统计'); assert(document.querySelector('.focus-stat-tiles')?.textContent.includes('1 分钟'), 'Completed minute missing'); assert(/🐟\s*1/.test(document.querySelector('.focus-rewards header')?.textContent || ''), 'Focus reward missing'); pass('real one-minute timer completion'); pass('hideSeconds preserves actual duration and reward'); await click('收起专注工具');
        assert(report.errors.length === 0, 'Runtime errors: ' + report.errors.join('; ')); report.passed = true;
      } catch (error) { report.error = error.stack || String(error); report.failureClassification = 'Untriaged preview assertion or harness failure; not automatically an application defect'; }
      finally { Object.defineProperty(HTMLImageElement.prototype, 'src', imageSrc); report.cleanImageRequests = cleanRequests; window.fetch = originalFetch; Storage.prototype.setItem = originalSetItem; releaseCover?.(); URL.createObjectURL = originalObjectURL; HTMLAnchorElement.prototype.click = originalAnchorClick; window.removeEventListener('error', errorListener); window.removeEventListener('unhandledrejection', errorListener); report.finishedAt = new Date().toISOString(); output.textContent = JSON.stringify(report, null, 2); status.textContent = report.passed ? `通过 ${report.checks.length} 项（仅浏览器模拟测试）` : `自检未通过：${report.error}`; panel.open = true; button.disabled = false; }
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
