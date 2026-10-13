import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { prepareReleaseSource } from './release-source.mjs';

const sha = 'a'.repeat(40), old = 'b'.repeat(40), annotation = 'c'.repeat(40);
const repo = 'owner/project', tag = 'v1.14.0', ref = `refs/tags/${tag}`;
const commit = value => ({ type: 'commit', sha: value });
const reference = object => ({ ref, object });
const base = { version: '1.14.0', checkoutSha: sha, env: { GITHUB_EVENT_NAME: 'push', GITHUB_REF: ref, GITHUB_SHA: sha, GITHUB_REPOSITORY: repo } };
const manual = { ...base, env: { ...base.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', DISPATCH_TAG: tag } };
const respond = (responses, calls) => async (...args) => {
  calls.push(args); const response = responses.shift();
  if (response instanceof Error) throw response;
  assert.notEqual(response, undefined, 'unexpected API call'); return response;
};

test('pushed lightweight tag must resolve to the tested commit', async () => {
  const calls = [];
  assert.equal(await prepareReleaseSource({ ...base, api: respond([reference(commit(sha))], calls) }), tag);
  assert.deepEqual(calls, [['GET', `repos/${repo}/git/ref/tags/${tag}`]]);
});
test('annotated tags are dereferenced to the commit, including nested tags', async () => {
  const calls = [], nested = 'd'.repeat(40);
  assert.equal(await prepareReleaseSource({ ...base, api: respond([
    reference({ type: 'tag', sha: annotation }), { object: { type: 'tag', sha: nested } }, { object: commit(sha) },
  ], calls) }), tag);
  assert.deepEqual(calls.slice(1), [['GET', `repos/${repo}/git/tags/${annotation}`], ['GET', `repos/${repo}/git/tags/${nested}`]]);
});
test('retry dispatched on an existing tag verifies its SHA without creating a ref', async () => {
  const calls = [];
  assert.equal(await prepareReleaseSource({ ...base, env: { ...base.env, GITHUB_EVENT_NAME: 'workflow_dispatch' },
    api: respond([reference(commit(sha))], calls) }), tag);
  assert.deepEqual(calls, [['GET', `repos/${repo}/git/ref/tags/${tag}`]]);
});
for (const annotated of [false, true]) test(`rejects old ${annotated ? 'annotated' : 'lightweight'} tag`, async () => {
  const responses = annotated ? [reference({ type: 'tag', sha: annotation }), { object: commit(old) }] : [reference(commit(old))];
  await assert.rejects(prepareReleaseSource({ ...base, api: respond(responses, []) }), /exact tested commit/);
});
test('manual publish atomically creates a new tag at the tested SHA, then verifies it', async () => {
  const calls = [];
  assert.equal(await prepareReleaseSource({ ...manual, api: respond([reference(commit(sha)), reference(commit(sha))], calls) }), tag);
  assert.deepEqual(calls, [
    ['POST', `repos/${repo}/git/refs`, { ref, sha }], ['GET', `repos/${repo}/git/ref/tags/${tag}`],
  ]);
});
test('existing or concurrently created manual tags are rejected without moving or reusing them', async () => {
  const calls = [];
  await assert.rejects(prepareReleaseSource({ ...manual, api: respond([new Error('422 Reference already exists')], calls) }), /Cannot create new release tag/);
  assert.deepEqual(calls, [['POST', `repos/${repo}/git/refs`, { ref, sha }]]);
});
test('unexpected creation response and a moved tag fail closed', async () => {
  await assert.rejects(prepareReleaseSource({ ...manual, api: respond([reference(commit(old))], []) }), /Created tag/);
  await assert.rejects(prepareReleaseSource({ ...manual, api: respond([reference(commit(sha)), reference(commit(old))], []) }), /exact tested commit/);
});
test('missing tags, network errors, invalid objects and annotation cycles fail closed', async () => {
  for (const responses of [
    [new Error('404 Not Found')], [new Error('network unavailable')], [{ ref: 'refs/tags/other', object: commit(sha) }],
    [reference({ type: 'tree', sha })], [reference({ type: 'tag', sha: annotation }), { object: { type: 'tag', sha: annotation } }],
  ]) await assert.rejects(prepareReleaseSource({ ...base, api: respond(responses, []) }));
});
test('invalid input and untested checkout are rejected before any API mutation', async () => {
  for (const change of [
    { checkoutSha: old }, { version: '1.13.0' },
    { env: { ...manual.env, GITHUB_EVENT_NAME: 'pull_request' } },
    { env: { ...manual.env, GITHUB_REF: 'refs/heads/feature' } },
    { env: { ...manual.env, DISPATCH_TAG: '' } },
    { env: { ...manual.env, DISPATCH_TAG: 'v1.14.0;touch injected' } },
    { env: { ...manual.env, GITHUB_SHA: 'main' } },
    { env: { ...manual.env, GITHUB_REPOSITORY: '../bad' } },
  ]) await assert.rejects(prepareReleaseSource({ ...manual, ...change, api: () => assert.fail('API called for invalid input') }));
});

test('actual workflow command stops before gh release on a failed guard', { skip: process.platform === 'win32' }, () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const workflow = readFileSync(path.join(root, '.github/workflows/desktop-release.yml'), 'utf8');
  const commands = workflow.match(/^          tag="\$\(node scripts\/release-source\.mjs\)"\n          gh release create[^\n]+/m)?.[0];
  assert(commands, 'workflow must use the source guard immediately before publication');
  assert.match(commands, /--verify-tag/); assert.doesNotMatch(commands, /--target/);
  const temporary = mkdtempSync(path.join(tmpdir(), 'release-source-'));
  try {
    mkdirSync(path.join(temporary, 'desktop')); mkdirSync(path.join(temporary, 'scripts')); mkdirSync(path.join(temporary, 'bin'));
    writeFileSync(path.join(temporary, 'desktop/package.json'), JSON.stringify({ version: '1.14.0' }));
    writeFileSync(path.join(temporary, 'scripts/release-source.mjs'), readFileSync(path.join(root, 'scripts/release-source.mjs')));
    writeFileSync(path.join(temporary, 'bin/git'), `#!${process.execPath}\nconsole.log('${sha}');\n`, { mode: 0o755 });
    writeFileSync(path.join(temporary, 'bin/gh'), `#!${process.execPath}
import { appendFileSync, readFileSync } from 'node:fs';
const args = process.argv.slice(2); appendFileSync(process.env.CALL_LOG, JSON.stringify(args)+'\\n');
if (args[0] === 'api') {
  if (args.includes('POST')) {
    if (process.env.CASE === 'existing') process.exit(1);
    const body = JSON.parse(readFileSync(0, 'utf8'));
    console.log(JSON.stringify({ref:body.ref,object:{type:'commit',sha:body.sha}}));
  } else console.log(JSON.stringify({ref:'${ref}',object:{type:'commit',sha:process.env.CASE === 'mismatch' ? '${old}' : '${sha}'}}));
}
`, { mode: 0o755 });
    for (const scenario of ['existing', 'mismatch', 'matching']) {
      const log = path.join(temporary, scenario+'.jsonl');
      const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-c', commands], {
        cwd: temporary, encoding: 'utf8', env: { ...process.env, ...manual.env, CASE: scenario, CALL_LOG: log, PATH: path.join(temporary, 'bin')+path.delimiter+process.env.PATH },
      });
      const calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
      const releases = calls.filter(a => a[0] === 'release');
      if (scenario === 'matching') { assert.equal(result.status, 0, result.stderr); assert.equal(releases.length, 1); assert.equal(releases[0][2], tag); }
      else { assert.notEqual(result.status, 0); assert.equal(releases.length, 0); }
    }
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
