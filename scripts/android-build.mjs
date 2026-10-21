import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = process.argv.includes('--release');
// Use the caller's SDK/JDK and signing environment; no workstation paths or keys in Git.
if (release && !process.env.FLOW_CABIN_ANDROID_KEYSTORE) throw new Error('Release builds require FLOW_CABIN_ANDROID_KEYSTORE and its signing passwords. See docs/android.md.');
const task = release ? ':app:assembleRelease' : ':app:assembleDebug';
const command = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const child = spawn(command, [task, '--no-daemon'], { cwd: path.join(root, 'android'), shell: process.platform === 'win32', stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
