// A GitHub Release page should show that version's changes and nothing else.
//
// desktop/RELEASE-NOTES.md is the full archive — every version, forever. The
// release workflow used to hand that whole file to `gh release create
// --notes-file`, so every release page re-listed the entire history and the
// installers were buried far below the fold. This extracts the one section
// that belongs to the version being published, and puts the download table
// first so the assets are one glance away.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEFAULT_REPO = 'ooooooomygosh/Flow-Cabin';

// What a user actually needs to know first: which file to download.
export const PLATFORMS = [
  ['macOS', 'Apple Silicon · Intel（DMG 或 ZIP）'],
  ['Windows', 'x64 安装版 · 便携版'],
];

const bare = (value) => String(value || '').trim().replace(/^v/i, '');

// The section of the archive that belongs to one version: the "## 1.2.3"
// heading up to the next "## " heading. Subsections ("### 验证范围") belong to
// the version above them, so they stay inside the section.
export function extractSection(markdown, version) {
  const wanted = bare(version);
  const lines = String(markdown || '').split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^##\s+v?(\d+\.\d+\.\d+)\s*$/);
    if (heading && heading[1] === wanted) { start = i; break; }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) { end = i; break; }
  }
  return {
    heading: lines[start].trim(),
    body: lines.slice(start + 1, end).join('\n').replace(/^\n+/, '').replace(/\n+$/, ''),
  };
}

// The body of one release: version, where to download, what changed, and a
// pointer to the full archive. Nothing else.
export function releaseBody(markdown, version, { repo = DEFAULT_REPO } = {}) {
  const section = extractSection(markdown, version);
  if (!section) throw new Error(`RELEASE-NOTES.md has no section for ${bare(version)}`);
  const table = ['| 平台 | 安装包 |', '| --- | --- |', ...PLATFORMS.map(([name, files]) => `| ${name} | ${files} |`)].join('\n');
  const archive = `\n\n---\n\n历次完整发布说明见 [desktop/RELEASE-NOTES.md](https://github.com/${repo}/blob/main/desktop/RELEASE-NOTES.md)。`;
  return [`## 心流小屋 v${bare(version)}`, '', table, '', section.body, archive].join('\n');
}

// CLI: node scripts/release-notes.mjs 1.21.5
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = process.argv[2] || process.env.RELEASE_TAG || '';
  if (!version) { console.error('用法：node scripts/release-notes.mjs <版本号，例如 v1.21.5>'); process.exit(1); }
  const markdown = readFileSync(new URL('../desktop/RELEASE-NOTES.md', import.meta.url), 'utf8');
  process.stdout.write(releaseBody(markdown, version) + '\n');
}
