package cn.flowcabin.app;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.caoccao.javet.annotations.V8Function;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Only bound to the private embedded Node runtime, never to a login WebView. */
public final class CabinCredentials {
    private static final String ALIAS = "flow-cabin-music-v1";
    private synchronized SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) { KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore"); generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build()); generator.generateKey(); }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    @V8Function(name = "cabinEncrypt") public String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] data = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), iv = cipher.getIV(), packed = new byte[1 + iv.length + data.length];
        packed[0] = (byte) iv.length; System.arraycopy(iv, 0, packed, 1, iv.length); System.arraycopy(data, 0, packed, 1 + iv.length, data.length); return Base64.encodeToString(packed, Base64.NO_WRAP);
    }
    @V8Function(name = "cabinDecrypt") public String decrypt(String value) throws Exception {
        byte[] data = Base64.decode(value, Base64.DEFAULT); int size = data[0] & 255; if (size != 12 || data.length < 30) throw new IllegalArgumentException("Invalid credentials");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, data, 1, size)); return new String(cipher.doFinal(data, size + 1, data.length - size - 1), StandardCharsets.UTF_8);
    }
}
