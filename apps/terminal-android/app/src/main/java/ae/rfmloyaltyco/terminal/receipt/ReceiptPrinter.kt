package ae.rfmloyaltyco.terminal.receipt

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import com.ftpos.library.smartpos.printer.OnPrinterCallback
import com.ftpos.library.smartpos.printer.Printer
import com.ftpos.library.smartpos.servicemanager.OnServiceConnectCallback
import com.ftpos.library.smartpos.servicemanager.ServiceManager
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Drives the terminal's thermal printer through the Feitian device SDK
 * (`ServiceManager` → `Printer`). Degrades gracefully: on hardware without the
 * Feitian API service (or in demo mode) `print` simulates the same timing so
 * the printing animation still runs.
 */
class ReceiptPrinter(private val context: Context, private val demo: Boolean) {

    sealed interface Outcome {
        data object Printed : Outcome
        data object Simulated : Outcome
        data class Failed(val message: String) : Outcome
    }

    private val bound = AtomicBoolean(false)

    /**
     * Estimated wall-clock time for the paper to physically come out: thermal
     * heads on F-series run ~70 mm/s at 8 dots/mm → ≈ 560 dots/s, plus a fixed
     * spin-up. The on-screen animation is driven by this same estimate.
     */
    fun estimateDurationMs(bitmap: Bitmap): Long = SPINUP_MS + bitmap.height * 1000L / DOTS_PER_SECOND

    suspend fun print(bitmap: Bitmap): Outcome = withContext(Dispatchers.IO) {
        if (demo) {
            delay(estimateDurationMs(bitmap))
            return@withContext Outcome.Simulated
        }
        if (!bind()) {
            // No Feitian API service on this device — simulate so UX stays intact.
            delay(estimateDurationMs(bitmap))
            return@withContext Outcome.Simulated
        }
        try {
            val printer = Printer.getInstance(context)
            var ret = printer.open()
            if (ret != 0) return@withContext Outcome.Failed(statusMessage(printer, ret))
            ret = printer.startCaching()
            if (ret != 0) return@withContext Outcome.Failed("Printer error 0x%x".format(ret))
            printer.setGray(3)
            ret = printer.printBmp(bitmap)
            if (ret != 0) return@withContext Outcome.Failed("Printer error 0x%x".format(ret))

            val result = withTimeoutOrNull(PRINT_TIMEOUT_MS) {
                suspendCancellableCoroutine<Outcome> { cont ->
                    printer.printWithFeed(FEED_DOTS, object : OnPrinterCallback {
                        override fun onSuccess() {
                            if (cont.isActive) cont.resume(Outcome.Printed)
                        }

                        override fun onError(code: Int) {
                            if (cont.isActive) cont.resume(Outcome.Failed(errorMessage(code)))
                        }
                    })
                }
            } ?: Outcome.Failed("Printer timed out")
            runCatching { printer.close() }
            result
        } catch (e: Throwable) {
            Log.e(TAG, "print failed", e)
            Outcome.Failed(e.message ?: "Printer unavailable")
        }
    }

    private suspend fun bind(): Boolean {
        if (bound.get()) return true
        return withTimeoutOrNull(BIND_TIMEOUT_MS) {
            suspendCancellableCoroutine { cont ->
                try {
                    ServiceManager.bindPosServer(context.applicationContext, object : OnServiceConnectCallback {
                        override fun onSuccess() {
                            bound.set(true)
                            if (cont.isActive) cont.resume(true)
                        }

                        override fun onFail(code: Int) {
                            if (cont.isActive) cont.resume(false)
                        }
                    })
                } catch (e: Throwable) {
                    // Feitian service APK not present (non-terminal hardware)
                    if (cont.isActive) cont.resume(false)
                }
            }
        } ?: false
    }

    private fun statusMessage(printer: Printer, fallbackCode: Int): String = try {
        val status = com.ftpos.library.smartpos.printer.PrintStatus()
        printer.getStatus(status)
        if (status.getmIsHavePaper() == false) "Out of paper — load a new roll" else "Printer error 0x%x".format(fallbackCode)
    } catch (_: Throwable) {
        "Printer error 0x%x".format(fallbackCode)
    }

    private fun errorMessage(code: Int): String = when (code) {
        1 -> "Out of paper — load a new roll"
        2 -> "Printer overheated — wait a moment"
        else -> "Printer error 0x%x".format(code)
    }

    companion object {
        private const val TAG = "ReceiptPrinter"
        private const val BIND_TIMEOUT_MS = 4_000L
        private const val PRINT_TIMEOUT_MS = 30_000L
        private const val SPINUP_MS = 350L

        /** ~70 mm/s × 8 dots/mm. */
        const val DOTS_PER_SECOND = 560

        /** Paper feed after the receipt so it can be torn cleanly. */
        private const val FEED_DOTS = 120
    }
}
