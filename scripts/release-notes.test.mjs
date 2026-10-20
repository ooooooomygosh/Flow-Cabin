// The release page must show one version and nothing else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractSection, releaseBody, PLATFORMS } from './release-notes.mjs';

const archive = readFileSync(new URL('../desktop/RELEASE-NOTES.md', import.meta.url), 'utf8');

test('a release body holds that version only', () => {
  const body = releaseBody(archive, '1.21.5');
  assert.match(body, /^## 心流小屋 v1\.21\.5/);
  assert.match(body, /六个方向各过了一遍/);
  // Nothing from the previous versions may leak in.
  for (const older of ['v1.21.4', 'v1.21.3', 'v1.21.0', 'v1.20.0']) {
    assert.doesNotMatch(body, new RegExp(`^## ${older}`, 'm'), `${older} leaked into the release body`);
  }
  assert.doesNotMatch(body, /本机 Codex CLI 从“能打开”修到/, 'an older version’s text leaked in');
  assert.match(body, /### 未变的边界/, 'the honest boundaries must stay in the release body');
});

test('the download table comes first, before the changes', () => {
  const body = releaseBody(archive, '1.21.5');
  const tableAt = body.indexOf('| 平台 | 安装包 |');
  const changesAt = body.indexOf('六个方向各过了一遍');
  assert.ok(tableAt > 0 && changesAt > 0, 'both the table and the changes must be present');
  assert.ok(tableAt < changesAt, 'the download table must come before the change list');
  for (const [name, files] of PLATFORMS) assert.match(body, new RegExp(`\\| ${name} \\| ${files.replace(/[()（）]/g, '\\$&')} \\|`));
});

test('a leading v on the version is accepted', () => {
  assert.equal(releaseBody(archive, 'v1.21.5'), releaseBody(archive, '1.21.5'));
});

test('every archived version has its own section', () => {
  const versions = [...archive.matchAll(/^##\s+v?(\d+\.\d+\.\d+)\s*$/gm)].map(m => m[1]);
  assert.ok(versions.length >= 5, 'the archive should keep several versions');
  for (const version of versions) {
    const section = extractSection(archive, version);
    assert.ok(section, `no section for ${version}`);
    assert.ok(section.body.length > 0, `${version} has an empty body`);
    // A section must not reach into the next version: every "## " heading in
    // the archive is a version boundary, so none may survive inside a body.
    for (const line of section.body.split('\n')) {
      assert.doesNotMatch(line, /^##\s+/, `${version} swallowed another version’s heading: ${line}`);
    }
  }
});

test('a version that is not in the archive fails loudly', () => {
  assert.equal(extractSection(archive, '9.9.9'), null);
  assert.throws(() => releaseBody(archive, '9.9.9'), /no section for 9\.9\.9/);
});

test('subsections stay with their own version', () => {
  const body = releaseBody(archive, '1.21.4');
  assert.match(body, /### 验证范围/);
  assert.doesNotMatch(body, /### 已知边界\n[\s\S]*本机 Codex CLI/, 'the next version’s subsection leaked in');
});
