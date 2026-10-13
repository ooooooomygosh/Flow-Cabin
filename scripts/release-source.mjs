import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const isSha = value => /^[0-9a-f]{40}$/.test(value || '');
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };

// api is injected so every publishing path can be tested without network or writes.
export async function prepareReleaseSource({ env, version, checkoutSha, api }) {
  const { GITHUB_EVENT_NAME: event, GITHUB_REF: ref, GITHUB_SHA: sha, GITHUB_REPOSITORY: repo } = env;
  requireThat(isSha(sha) && checkoutSha === sha, 'Checkout must match the exact tested GITHUB_SHA');
  requireThat(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || ''), 'Invalid repository');
  const pushedTag = event === 'push' && ref?.startsWith('refs/tags/');
  const dispatchedTag = event === 'workflow_dispatch' && ref?.startsWith('refs/tags/');
  const dispatchedMain = event === 'workflow_dispatch' && ref === 'refs/heads/main';
  requireThat(pushedTag || dispatchedTag || dispatchedMain, 'Publishing requires a tag or a manual main run');
  const tag = dispatchedMain ? env.DISPATCH_TAG : ref.slice('refs/tags/'.length);
  requireThat(/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(tag || ''), 'Release tag must look like v1.2.3');
  requireThat(tag === `v${version}`, 'Release tag must match desktop/package.json');
  const tagRef = `refs/tags/${tag}`;
  if (dispatchedMain) {
    // Atomic create, not a GET-then-create check: an existing/concurrently created
    // tag (even at the same SHA) makes GitHub reject this request. Never move it.
    let created;
    try { created = await api('POST', `repos/${repo}/git/refs`, { ref: tagRef, sha }); }
    catch { throw new Error('Cannot create new release tag; it may already exist or GitHub rejected the request'); }
    requireThat(created?.ref === tagRef && created.object?.type === 'commit' && created.object.sha === sha,
      'Created tag does not identify the tested commit');
  }
  const current = await api('GET', `repos/${repo}/git/ref/tags/${tag}`);
  requireThat(current?.ref === tagRef, 'Release tag reference is missing or unexpected');
  let object = current.object;
  const visited = new Set();
  while (object?.type === 'tag') {
    requireThat(isSha(object.sha) && !visited.has(object.sha) && visited.size < 10, 'Invalid annotated tag chain');
    visited.add(object.sha);
    object = (await api('GET', `repos/${repo}/git/tags/${object.sha}`))?.object;
  }
  requireThat(object?.type === 'commit' && isSha(object.sha) && object.sha === sha,
    'Release tag does not resolve to the exact tested commit');
  return tag;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const tag = await prepareReleaseSource({
      env: process.env,
      version: JSON.parse(readFileSync('desktop/package.json', 'utf8')).version,
      checkoutSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      api: (method, endpoint, body) => {
        const args = ['api', '--method', method, endpoint];
        if (body) args.push('--input', '-');
        return JSON.parse(execFileSync('gh', args, {
          encoding: 'utf8', input: body ? JSON.stringify(body) : undefined,
          stdio: ['pipe', 'pipe', 'pipe'],
        }));
      },
    });
    console.log(tag);
  } catch (error) {
    // Do not echo authentication headers or the gh subprocess's captured output.
    console.error(error instanceof Error ? error.message.split('\n')[0] : 'Release source verification failed');
    process.exitCode = 1;
  }
}
