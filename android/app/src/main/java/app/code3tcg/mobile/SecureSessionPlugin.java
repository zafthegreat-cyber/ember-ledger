package app.code3tcg.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureSession")
public class SecureSessionPlugin extends Plugin {
    private static final String ALIAS = "code3-session-v1";
    private SharedPreferences prefs() { return getContext().getSharedPreferences(ALIAS, Context.MODE_PRIVATE); }
    private String key(PluginCall call) {
        String key = call.getString("key");
        if (key == null || !key.matches("[a-zA-Z0-9_.:-]{1,250}")) throw new IllegalArgumentException();
        return key;
    }
    private SecretKey encryptionKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    @PluginMethod public synchronized void get(PluginCall call) {
        try {
            String name = key(call), stored = prefs().getString(name, null);
            JSObject result = new JSObject();
            if (stored != null) {
                String[] pieces = stored.split(":", 2);
                if (pieces.length != 2) throw new IllegalStateException();
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), new GCMParameterSpec(128, Base64.decode(pieces[0], Base64.NO_WRAP)));
                cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
                result.put("value", new String(cipher.doFinal(Base64.decode(pieces[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
            }
            call.resolve(result);
        } catch (Exception error) { call.reject("Secure sign-in storage could not be read."); }
    }
    @PluginMethod public synchronized void set(PluginCall call) {
        try {
            String name = key(call), value = call.getString("value");
            if (value == null || value.length() > 131072) throw new IllegalArgumentException();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, encryptionKey());
            cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
            String encrypted = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            if (!prefs().edit().putString(name, encrypted).commit()) throw new IllegalStateException();
            call.resolve();
        } catch (Exception error) { call.reject("Secure sign-in storage could not be saved."); }
    }
    @PluginMethod public synchronized void remove(PluginCall call) {
        try {
            if (!prefs().edit().remove(key(call)).commit()) throw new IllegalStateException();
            call.resolve();
        } catch (Exception error) { call.reject("Secure sign-in storage could not be cleared."); }
    }
}
