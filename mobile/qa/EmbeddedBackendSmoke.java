import com.caoccao.javet.annotations.V8Function;
import com.caoccao.javet.enums.V8AwaitMode;
import com.caoccao.javet.interop.NodeRuntime;
import com.caoccao.javet.interop.V8Host;
import com.caoccao.javet.node.modules.NodeModuleModule;
import java.io.File;
import java.nio.file.*;
import java.util.Base64;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** Host-JVM smoke of the actual embedded Node engine. Not an Android/Keystore test. */
public class EmbeddedBackendSmoke {
    private final SecretKey key;
    private final Path ready;
    public EmbeddedBackendSmoke(Path ready) throws Exception { this.ready=ready; KeyGenerator generator=KeyGenerator.getInstance("AES"); generator.init(256); key=generator.generateKey(); }
    @V8Function(name="cabinEncrypt") public String encrypt(String text) throws Exception { Cipher c=Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE,key); byte[] body=c.doFinal(text.getBytes(java.nio.charset.StandardCharsets.UTF_8)), result=new byte[12+body.length]; System.arraycopy(c.getIV(),0,result,0,12);System.arraycopy(body,0,result,12,body.length);return Base64.getEncoder().encodeToString(result); }
    @V8Function(name="cabinDecrypt") public String decrypt(String text) throws Exception { byte[] data=Base64.getDecoder().decode(text);Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key,new GCMParameterSpec(128,data,0,12));return new String(c.doFinal(data,12,data.length-12),java.nio.charset.StandardCharsets.UTF_8); }
    @V8Function(name="cabinReady") public void started(int port) throws Exception { Files.writeString(ready,Integer.toString(port)); System.out.println("EMBEDDED_BACKEND_READY"); }
    @V8Function(name="cabinFailed") public void failed(String reason) { System.err.println(reason); throw new IllegalStateException("Embedded backend failed to start"); }
    private static String js(String text) { return "'"+text.replace("\\","\\\\").replace("'","\\'")+"'"; }
    public static void main(String[] args) throws Exception {
        File code=new File(args[0]); Path qa=Paths.get(args[1]); Files.createDirectories(qa); Files.createDirectories(qa.resolve("cache")); Files.createDirectories(qa.resolve("account")); Files.deleteIfExists(qa.resolve("ready.txt")); Files.deleteIfExists(qa.resolve("stop.txt"));
        EmbeddedBackendSmoke host=new EmbeddedBackendSmoke(qa.resolve("ready.txt"));
        try(NodeRuntime runtime=V8Host.getNodeInstance().createV8Runtime()) {
            runtime.allowEval(true);
            System.out.println("ENGINE " + runtime.getExecutor("process.version").executeString());
            runtime.getNodeModule(NodeModuleModule.class).setRequireRootDirectory(code); runtime.getGlobalObject().bind(host);
            runtime.getExecutor("globalThis.cabinOptions={directory:"+js(qa.resolve("account").toString())+",cache:"+js(qa.resolve("cache").toString())+",token:'embedded-fixture-token',upstream:{searchQQSongs:async()=>[{mid:'003abc12345678',name:'Embedded fixture',artist:'Fixture artist'}],getQQMediaMid:async()=>'',handleQQSongUrl:async()=>({playable:true,url:'https://audio.music.qqmusic.qq.com/fixture.mp3',quality:'fixture'}),audioProxyHeadersFor:()=>({})}};const actualFetch=globalThis.fetch;globalThis.fetch=(url,options)=>String(url).startsWith('https://audio.music.qqmusic.qq.com/')?Promise.resolve(new Response('embedded-fixture-audio',{headers:{'content-type':'audio/mpeg'}})):actualFetch(url,options);").executeVoid();
            if(args.length>2 && args[2].equals("default-upstream")) runtime.getExecutor("delete globalThis.cabinOptions.upstream").executeVoid();
            runtime.getExecutor("require('./main.cjs')").executeVoid();
            if(args.length>2 && args[2].equals("default-upstream")) runtime.getExecutor("require(require('node:path').join(require.resolve('NeteaseCloudMusicApi/package.json'),'..','util','request'))").executeVoid();
            long deadline=System.currentTimeMillis()+60000;
            while(!Files.exists(qa.resolve("stop.txt")) && System.currentTimeMillis()<deadline) {runtime.await(V8AwaitMode.RunNoWait);Thread.sleep(5);}
            runtime.getExecutor("globalThis.cabinStop?.()").executeVoid(); runtime.await();
        }
    }
}
