package ae.rfmloyaltyco.terminal.update

import ae.rfmloyaltyco.terminal.BuildConfig
import ae.rfmloyaltyco.terminal.api.TerminalApi
import ae.rfmloyaltyco.terminal.api.TerminalRelease
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.core.content.FileProvider
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Over-the-air updates for the fleet.
 *
 * Terminals live in shops. Until this existed, every change to the till app
 * meant someone physically carrying a laptop to each one, which is why the
 * estate has been running whatever build happened to be installed the last time
 * anybody visited.
 *
 * The rules this follows, all of them because it is a till:
 *
 *  · A sale in progress is never interrupted. The check runs from the idle
 *    screen and the install prompt only ever appears there.
 *  · The download is verified against the digest the server published before
 *    anything is handed to the package installer. A terminal that installed a
 *    swapped binary would be about the worst outcome this system has, and
 *    "it downloaded from our domain" is not a substitute for checking.
 *  · Every failure is silent and non-fatal. A terminal that cannot reach the
 *    update service keeps taking payments on the build it has.
 */
class AppUpdater(private val context: Context, private val api: TerminalApi) {

    /** Where the downloaded APK lands. Cleared on success and on a bad digest. */
    private val downloadDir: File get() = File(context.cacheDir, "updates").apply { mkdirs() }

    private val http = OkHttpClient.Builder().build()

    sealed interface Outcome {
        /** Nothing published, or already current. */
        data object UpToDate : Outcome
        /** Downloaded and verified; the installer has been offered. */
        data class Ready(val release: TerminalRelease) : Outcome
        /** Reached the server but couldn't finish. Retried on the next check. */
        data class Failed(val reason: String) : Outcome
    }

    /**
     * Asks what the current build is, and fetches it if this terminal is behind.
     *
     * Reports the running version in the same call, which is what makes "is the
     * fleet updated?" answerable from a desk instead of by walking into shops.
     */
    suspend fun check(): Outcome = withContext(Dispatchers.IO) {
        val release = try {
            api.appVersion(BuildConfig.VERSION_CODE, BuildConfig.VERSION_NAME)
        } catch (e: Exception) {
            Log.i(TAG, "update check skipped: ${e.message}")
            return@withContext Outcome.Failed("unreachable")
        } ?: return@withContext Outcome.UpToDate

        // The server already compared, but a client that trusts a downgrade
        // could be walked backwards onto an older build by a stale response.
        if (release.versionCode <= BuildConfig.VERSION_CODE) return@withContext Outcome.UpToDate

        val apk = File(downloadDir, "terminal-${release.versionCode}.apk")

        // A previous attempt may have already fetched it. Re-verify rather than
        // assume — a truncated file from a killed download looks like a hit.
        if (!apk.exists() || sha256(apk) != release.sha256) {
            apk.delete()
            val ok = download(release.url, apk)
            if (!ok) return@withContext Outcome.Failed("download failed")
            val actual = sha256(apk)
            if (actual != release.sha256) {
                // Never install this. Not a retry — a mismatch means the file is
                // not what was published, and trying again may just fetch it again.
                apk.delete()
                Log.e(TAG, "digest mismatch for ${release.versionCode}: expected ${release.sha256}, got $actual")
                return@withContext Outcome.Failed("digest mismatch")
            }
        }

        Outcome.Ready(release)
    }

    /**
     * Hands the verified APK to the system package installer.
     *
     * The user confirms — this app is not a device owner, so a silent install
     * isn't available, and asking is honest anyway: the cashier chooses a moment
     * with nobody at the counter.
     */
    fun install(release: TerminalRelease) {
        val apk = File(downloadDir, "terminal-${release.versionCode}.apk")
        if (!apk.exists()) return
        val uri: Uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", apk)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { context.startActivity(intent) }
            .onFailure { Log.e(TAG, "installer refused: ${it.message}") }
    }

    /** Builds older than the one being installed are just cache. */
    fun clearOldDownloads() {
        downloadDir.listFiles()?.forEach { f ->
            val code = f.name.removePrefix("terminal-").removeSuffix(".apk").toIntOrNull()
            if (code != null && code <= BuildConfig.VERSION_CODE) f.delete()
        }
    }

    private fun download(url: String, into: File): Boolean = try {
        http.newCall(Request.Builder().url(url).build()).execute().use { res ->
            if (!res.isSuccessful) {
                false
            } else {
                res.body?.byteStream()?.use { input ->
                    into.outputStream().use { out -> input.copyTo(out) }
                }
                into.length() > 0
            }
        }
    } catch (e: Exception) {
        Log.i(TAG, "download failed: ${e.message}")
        into.delete()
        false
    }

    private fun sha256(f: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        f.inputStream().use { input ->
            val buf = ByteArray(1 shl 16)
            while (true) {
                val n = input.read(buf)
                if (n <= 0) break
                digest.update(buf, 0, n)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private companion object {
        const val TAG = "AppUpdater"
    }
}
