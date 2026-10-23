'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');

function buildMacInput() {
  const candidates = [
    process.env.NODE_INCLUDE_DIR,
    path.join(path.dirname(process.execPath), '..', 'include', 'node'),
    '/usr/local/include/node',
    '/opt/homebrew/include/node'
  ].filter(Boolean);
  const include = candidates.find((directory) => fs.existsSync(path.join(directory, 'node_api.h')));
  if (!include) throw new Error('Node.js headers (node_api.h) were not found; set NODE_INCLUDE_DIR.');
  const source = path.join(__dirname, 'native', 'mac-input.mm');
  const output = path.join(__dirname, 'native', 'mac-input.node');
  // A Command Line Tools-only install can expose an SDK newer than its default
  // libc++ include directory. Prefer the SDK's own headers when present.
  const sdk = execFileSync('xcrun', ['--show-sdk-path'], { encoding: 'utf8' }).trim();
  const sdkCxx = path.join(sdk, 'usr', 'include', 'c++', 'v1');
  execFileSync('clang++', [
    '-std=c++17', '-O2', '-fPIC', '-bundle', '-undefined', 'dynamic_lookup',
    '-mmacosx-version-min=11.0', '-I', include,
    ...(fs.existsSync(path.join(sdkCxx, 'atomic')) ? ['-isystem', sdkCxx] : []),
    '-framework', 'ApplicationServices',
    '-o', output, source
  ], { stdio: 'inherit' });
  console.log('Built native/mac-input.node');
  execFileSync('clang++',['-std=c++17','-O2','-fPIC','-fobjc-arc','-bundle','-undefined','dynamic_lookup','-mmacosx-version-min=11.0','-I',include,...(fs.existsSync(path.join(sdkCxx,'atomic'))?['-isystem',sdkCxx]:[]),'-framework','Foundation','-framework','CoreLocation','-o',path.join(__dirname,'native','mac-location.node'),path.join(__dirname,'native','mac-location.mm')],{stdio:'inherit'});
  console.log('Built native/mac-location.node');
}

if (process.platform === 'darwin') {
  buildMacInput();
  process.exit(0);
}
if (process.platform !== 'win32') { console.log('Native desktop helpers are not required on this platform.'); process.exit(0); }
const directory = path.join(__dirname, 'native', 'bin'); fs.mkdirSync(directory, { recursive: true });
const framework = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319');
const compiler = path.join(framework, 'csc.exe');
execFileSync(compiler, ['/nologo', '/target:exe', '/platform:x64', '/optimize+', '/reference:System.Web.Extensions.dll', '/out:' + path.join(directory, 'DesktopHost.exe'), path.join(__dirname, 'native', 'DesktopHost.cs')], { stdio: 'inherit', windowsHide: true });

// The system now-playing helper needs the WinRT union metadata (Windows.winmd)
// from the Windows SDK: System.Runtime.WindowsRuntime.dll binds its AsTask()
// helpers to that single "Windows" assembly. Without the SDK the helper is
// skipped and the client reports the source unavailable, unless the build
// sets REQUIRE_NOWPLAYING=1 (release builds do).
function unionMetadata() {
  const kits = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'UnionMetadata');
  let versions = [];
  try { versions = fs.readdirSync(kits).filter((name) => /^10\.\d+\.\d+\.\d+$/.test(name)).sort((a, b) => b.localeCompare(a, 'en', { numeric: true })); } catch {}
  for (const candidate of [...versions.map((version) => path.join(kits, version, 'Windows.winmd')), path.join(kits, 'Windows.winmd')]) if (fs.existsSync(candidate)) return candidate;
  return null;
}
const winmd = unionMetadata();
try {
  if (!winmd) throw new Error('Windows SDK UnionMetadata\\Windows.winmd was not found.');
  console.log('Building location and playback helpers with ' + winmd);
  const references = ['System.Web.Extensions.dll', winmd, ...['System.Runtime.WindowsRuntime.dll', 'System.Runtime.dll', 'System.Threading.Tasks.dll', 'System.Runtime.InteropServices.WindowsRuntime.dll'].map((name) => path.join(framework, name)).filter((file) => fs.existsSync(file))];
  execFileSync(compiler, ['/nologo', '/target:exe', '/platform:x64', '/optimize+', ...references.map((file) => '/reference:' + file), '/out:' + path.join(directory, 'NowPlaying.exe'), path.join(__dirname, 'native', 'NowPlaying.cs')], { stdio: 'inherit', windowsHide: true });
  execFileSync(compiler,['/nologo','/target:exe','/platform:x64','/optimize+',...references.map(file=>'/reference:'+file),'/out:'+path.join(directory,'ApproximateLocation.exe'),path.join(__dirname,'native','ApproximateLocation.cs')],{stdio:'inherit',windowsHide:true});
} catch (error) {
  if (process.env.REQUIRE_NOWPLAYING === '1') { console.error('NowPlaying.exe is required for this build. ' + error.message); process.exit(1); }
  console.warn('NowPlaying.exe was not built; the system now-playing source will be unavailable. ' + error.message);
}
