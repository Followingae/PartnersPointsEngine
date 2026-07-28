package ae.rfmloyaltyco.terminal.data

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Terminal configuration. The HMAC signing secret is encrypted at rest with an
 * AndroidKeyStore AES-GCM key (hardware-backed on Feitian devices).
 */
class SettingsStore(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("rfm_terminal", Context.MODE_PRIVATE)

    data class Config(
        val baseUrl: String,
        val publishableKeyId: String,
        val secret: String,
        val terminalLabel: String,
        val ecrMode: String, // socket | serial_usb | bt4 | demo
        val ecrDevice: String, // socket ip / bt name; blank for serial
        val earnOnNet: Boolean,
        val autoPrint: Boolean,
        val adminPin: String,
        val currency: String,
    ) {
        val paired: Boolean get() = publishableKeyId.isNotBlank() && secret.isNotBlank()
    }

    fun snapshot(): Config = Config(
        baseUrl = prefs.getString(K_BASE_URL, DEFAULT_BASE_URL)!!,
        publishableKeyId = prefs.getString(K_PK, "")!!,
        secret = decrypt(prefs.getString(K_SECRET_ENC, "")!!),
        terminalLabel = prefs.getString(K_LABEL, "Terminal")!!,
        ecrMode = prefs.getString(K_ECR_MODE, "intent")!!,
        ecrDevice = prefs.getString(K_ECR_DEVICE, "127.0.0.1")!!,
        earnOnNet = prefs.getBoolean(K_EARN_NET, true),
        autoPrint = prefs.getBoolean(K_AUTO_PRINT, true),
        adminPin = prefs.getString(K_PIN, "4321")!!,
        currency = prefs.getString(K_CURRENCY, "AED")!!,
    )

    /** Server config cache — the redemption valuation survives offline restarts. */
    fun cacheServerConfig(raw: String) {
        prefs.edit().putString(K_SERVER_CONFIG, raw).apply()
    }

    fun cachedServerConfig(): ae.rfmloyaltyco.terminal.api.ServerConfig? =
        prefs.getString(K_SERVER_CONFIG, null)?.let { raw ->
            runCatching { ae.rfmloyaltyco.terminal.api.TerminalApi.parseServerConfig(org.json.JSONObject(raw)) }.getOrNull()
        }

    fun savePairing(baseUrl: String, publishableKeyId: String, secret: String, label: String) {
        prefs.edit()
            .putString(K_BASE_URL, baseUrl)
            .putString(K_PK, publishableKeyId)
            .putString(K_SECRET_ENC, encrypt(secret))
            .putString(K_LABEL, label)
            .apply()
    }

    fun saveOperational(
        ecrMode: String,
        ecrDevice: String,
        earnOnNet: Boolean,
        autoPrint: Boolean,
        adminPin: String,
    ) {
        prefs.edit()
            .putString(K_ECR_MODE, ecrMode)
            .putString(K_ECR_DEVICE, ecrDevice)
            .putBoolean(K_EARN_NET, earnOnNet)
            .putBoolean(K_AUTO_PRINT, autoPrint)
            .putString(K_PIN, adminPin)
            .apply()
    }

    fun unpair() {
        prefs.edit().remove(K_PK).remove(K_SECRET_ENC).apply()
    }

    // ── AndroidKeyStore AES-GCM ──────────────────────────────────────────────

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return gen.generateKey()
    }

    private fun encrypt(plain: String): String {
        if (plain.isEmpty()) return ""
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP)
    }

    private fun decrypt(stored: String): String {
        if (stored.isEmpty()) return ""
        return try {
            val (ivB64, ctB64) = stored.split(':', limit = 2)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(ivB64, Base64.NO_WRAP)))
            String(cipher.doFinal(Base64.decode(ctB64, Base64.NO_WRAP)), Charsets.UTF_8)
        } catch (_: Exception) {
            ""
        }
    }

    companion object {
        const val DEFAULT_BASE_URL = "https://api.partnerspoints.ae/v1/terminal"
        private const val KEY_ALIAS = "rfm_terminal_secret"
        private const val K_BASE_URL = "base_url"
        private const val K_PK = "pk"
        private const val K_SECRET_ENC = "secret_enc"
        private const val K_LABEL = "label"
        private const val K_ECR_MODE = "ecr_mode"
        private const val K_ECR_DEVICE = "ecr_device"
        private const val K_EARN_NET = "earn_net"
        private const val K_AUTO_PRINT = "auto_print"
        private const val K_SERVER_CONFIG = "server_config"
        private const val K_PIN = "pin"
        private const val K_CURRENCY = "currency"
    }
}
