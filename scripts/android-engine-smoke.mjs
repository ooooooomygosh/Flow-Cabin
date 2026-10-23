// Execute the packaged backend in the same Javet Node engine on the host JVM.
// This deliberately does not claim to test Android's JNI, WebView or Keystore.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), output=path.join(root,'mobile-test-results'), classes=path.join(output,'engine-classes');
const cp=process.env.JAVET_TEST_CLASSPATH; if(!cp) throw new Error('Set JAVET_TEST_CLASSPATH to Javet 6.0.2 core + this host native JARs; see docs/android.md.');
const bin=name=>process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',name+(process.platform==='win32'?'.exe':'')):name;
await fs.mkdir(classes,{recursive:true});
const compiled=spawnSync(bin('javac'),['-cp',cp,'-d',classes,path.join(root,'mobile/qa/EmbeddedBackendSmoke.java')],{windowsHide:true,encoding:'utf8'}); if(compiled.status!==0) throw new Error(compiled.stderr||'Java compile failed');
const report={hostJvm:true,androidDeviceTested:false,checks:[]};
for(const defaultUpstream of [false,true]) {
  const qa=path.join(output,defaultUpstream?'embedded-default-check':'embedded-fixture-check'); await fs.mkdir(qa,{recursive:true});
  await fs.rm(path.join(qa,'ready.txt'),{force:true}); await fs.rm(path.join(qa,'stop.txt'),{force:true});
  const child=spawn(bin('java'),['-cp',classes+path.delimiter+cp,'EmbeddedBackendSmoke',path.join(root,'android/app/src/main/assets/cabin-backend'),qa,...(defaultUpstream?['default-upstream']:[])],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let log=''; child.stdout.on('data',chunk=>log+=chunk); child.stderr.on('data',chunk=>log+=chunk);
  const exited=new Promise(resolve=>child.on('exit',resolve));
  try {
    let port; for(let i=0;i<400;i++) { if(child.exitCode!==null) throw new Error(log); try {port=Number(await fs.readFile(path.join(qa,'ready.txt'),'utf8'));if(port)break;}catch{} await new Promise(resolve=>setTimeout(resolve,100)); } if(!port) throw new Error('Embedded backend startup timed out: '+log);
    const request=async(resource,value,auth=true)=>fetch(`http://127.0.0.1:${port}${resource}`,{signal:AbortSignal.timeout(10000),headers:{...(auth?{'x-cabin-native-token':'embedded-fixture-token'}:{}),...(value===undefined?{}:{'Content-Type':'application/json'})},...(value===undefined?{}:{method:'POST',body:JSON.stringify(value)})});
    assert.equal((await request('/music/config',undefined,false)).status,401);
    const config=await(await request('/music/config')).json(); assert.equal(config.qqLoggedIn,false);
    if(!defaultUpstream) {
      assert.equal((await(await request('/native/session',{provider:'qq',cookie:'uin=123; qm_keyst=java-fixture'})).json()).ok,true);
      assert.equal((await(await request('/music/config')).json()).qqLoggedIn,true);
      assert.doesNotMatch(await fs.readFile(path.join(qa,'account/music.json'),'utf8'),/java-fixture|qm_keyst/);
      assert.equal((await(await request('/music/search?provider=qq&query=fixture')).json()).candidates[0].title,'Embedded fixture');
      const resolved=await(await request('/music/resolve',{provider:'qq',id:'003abc12345678'})).json(); assert.match(resolved.audioPath,/^\/desktop-music\/audio\//);
      assert.equal(await(await request('/music'+resolved.audioPath.slice('/desktop-music'.length))).text(),'embedded-fixture-audio');
      await request('/native/session',{provider:'qq',cookie:''}); assert.equal((await(await request('/music/config')).json()).qqLoggedIn,false);
    }
    const name=defaultUpstream?'real-portable-dependency-graph-boots-in-embedded-node':'java-callback-encryption-login-search-resolve-stream-logout'; report.checks.push(name); console.log('PASS '+name);
  } finally {
    await fs.writeFile(path.join(qa,'stop.txt'),'stop'); const exit=await Promise.race([exited,new Promise(resolve=>setTimeout(()=>resolve('timeout'),5000))]); if(exit==='timeout') child.kill();
    await fs.writeFile(path.join(qa,'engine.log'),log);
  }
}
await fs.writeFile(path.join(output,'embedded-engine-report.json'),JSON.stringify(report,null,2));
