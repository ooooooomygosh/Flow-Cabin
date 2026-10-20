// The app version, read from the root package.json.
//
// The regression fixtures seed `seenVersion` so the version-update wizard stays
// closed. When that value was written by hand, every release had to edit a
// dozen scripts — and forget one and the wizard opens mid-test and blocks
// whatever the fixture is trying to click. Reading it from package.json makes
// a release a one-line change again.
//
// The wizard itself is covered by scripts/onboarding-checks.mjs, which
// deliberately opens it; that script must not use this seed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const APP_VERSION = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

/** The localStorage payload that marks the guide as already done for this version. */
export const onboardingSeed = (extra = {}) =>
  JSON.stringify({ version: 2, status: 'done', step: 'done', seenVersion: APP_VERSION, ...extra });
