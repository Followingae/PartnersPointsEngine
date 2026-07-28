package ae.rfmloyaltyco.terminal.ecr

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.withTimeoutOrNull

/**
 * App-to-app SmartPay integration (same-device Feitian SmartPOS).
 *
 * This is pure Android Intent IPC with the SmartPay app — it uses NO Feitian SDK
 * library. We start SmartPay's InvokeActivity for result; SmartPay drives the
 * card/PIN UI and hands the outcome back as intent extras.
 *
 * The Activity owns the launcher, so this bridge marshals requests out to it and
 * awaits the result the Activity delivers back.
 */
object SmartPayIntentBridge {

    const val PACKAGE = "com.app.smartpay"
    const val ACTIVITY = "com.feitian.activity.readcard.InvokeActivity"

    // trans_type values (from SmartPay's demo protocol)
    const val TRANS_SIGN_IN = 0x00
    const val TRANS_PURCHASE = 0x02
    const val TRANS_TIP = 0x03
    const val TRANS_REFUND = 0x09
    const val TRANS_VOID = 0x10
    const val TRANS_TIP_COMPLETE = 0x25

    /** SmartPay can hang without ever returning — the watchdog is mandatory. */
    private const val TIMEOUT_MS = 5 * 60 * 1000L

    private val _launchRequests = MutableSharedFlow<Intent>(extraBufferCapacity = 4)
    val launchRequests: SharedFlow<Intent> = _launchRequests

    @Volatile private var pending: CompletableDeferred<EcrPaymentResult>? = null

    /** True while SmartPay is in the foreground — the Activity keeps itself alive. */
    @Volatile var isActive: Boolean = false
        private set

    fun isInstalled(context: Context): Boolean = try {
        context.packageManager.getPackageInfo(PACKAGE, 0)
        val probe = Intent().setComponent(ComponentName(PACKAGE, ACTIVITY))
        context.packageManager.resolveActivity(probe, 0) != null
    } catch (_: PackageManager.NameNotFoundException) {
        false
    } catch (_: Exception) {
        false
    }

    /**
     * Launch a SmartPay transaction and suspend until it reports back.
     * `extras` carries trans_type plus whatever that type requires.
     */
    suspend fun run(context: Context, orderNo: String, extras: Map<String, Any?>): EcrPaymentResult {
        if (!isInstalled(context)) {
            return EcrPaymentResult(false, EcrPaymentResult.Status.LINK_ERROR, orderNo, "SmartPay app not found on this terminal")
        }
        // one transaction at a time
        if (pending?.isActive == true) {
            return EcrPaymentResult(false, EcrPaymentResult.Status.LINK_ERROR, orderNo, "A payment is already in progress")
        }

        val deferred = CompletableDeferred<EcrPaymentResult>()
        pending = deferred

        val intent = Intent().apply {
            component = ComponentName(PACKAGE, ACTIVITY)
            putExtra("AppId", context.packageName)
            putExtra("package_name", context.packageName)
            putExtra("activity_name", "ae.rfmloyaltyco.terminal.MainActivity")
            // Ask SmartPay not to print its own slip — we print one merged
            // receipt. Unknown extras are ignored, so this is safe; if this
            // build ignores them, switch printing off in SmartPay's settings.
            putExtra("print_flag", 0)
            putExtra("is_print", false)
            putExtra("printReceipt", false)
            extras.forEach { (k, v) ->
                when (v) {
                    is Int -> putExtra(k, v)
                    is Long -> putExtra(k, v)
                    is String -> putExtra(k, v)
                    null -> Unit
                    else -> putExtra(k, v.toString())
                }
            }
        }

        isActive = true
        val emitted = _launchRequests.tryEmit(intent)
        if (!emitted) {
            isActive = false
            pending = null
            return EcrPaymentResult(false, EcrPaymentResult.Status.LINK_ERROR, orderNo, "Could not reach the payment screen")
        }

        val result = withTimeoutOrNull(TIMEOUT_MS) { deferred.await() }
        isActive = false
        pending = null
        return result?.copy(orderNo = result.orderNo.ifBlank { orderNo })
            ?: EcrPaymentResult(false, EcrPaymentResult.Status.TIMEOUT, orderNo, "SmartPay did not respond — check the payment screen")
    }

    /** Called by MainActivity.onActivityResult / the result launcher callback. */
    fun deliver(resultCode: Int, data: Intent?) {
        val d = pending ?: return
        d.complete(parse(resultCode, data))
    }

    fun deliverFailure(message: String) {
        pending?.complete(EcrPaymentResult(false, EcrPaymentResult.Status.LINK_ERROR, "", message))
    }

    /**
     * RESULT_OK does NOT mean approved — SmartPay returns OK for declines too.
     * The authority is the `errorCode` extra: 0 = success.
     */
    private fun parse(resultCode: Int, data: Intent?): EcrPaymentResult {
        if (data == null) {
            return EcrPaymentResult(false, EcrPaymentResult.Status.CANCELLED, "", "Payment cancelled")
        }
        val dump = data.extras?.keySet()?.joinToString { k -> "$k=${data.extras?.get(k)}" } ?: ""
        Log.i(TAG, "SmartPay result rc=$resultCode extras{$dump}")

        val errorCode = data.intLike("errorCode") ?: if (resultCode == android.app.Activity.RESULT_OK) 0 else -1
        val errorMsg = data.stringLike("errorMsg").orEmpty()
        val orderNo = data.stringLike("order_no").orEmpty()

        if (errorCode == 0) {
            return EcrPaymentResult(
                approved = true,
                status = EcrPaymentResult.Status.APPROVED,
                orderNo = orderNo,
                message = "Approved",
                maskedPan = data.stringLike("card_no"),
                cardType = data.intLike("cardType")?.let { CardBrand.name(it) } ?: data.stringLike("cardType"),
                authNo = data.stringLike("auth_no"),
                voucherNo = data.stringLike("voucher_no"),
                referNo = data.stringLike("refer_no"),
                paymentMethod = "card",
                amountMinor = data.longLike("trans_amount"),
                batchNo = data.stringLike("batch_no"),
                terminalNo = data.stringLike("terminal_no"),
                merchantNo = data.stringLike("merchant_no"),
                transTime = data.stringLike("trans_time"),
                cardExpiry = data.stringLike("card_expire_date"),
                responseCode = data.stringLike("response_code"),
                aid = data.stringLike("aid"),
                tvr = data.stringLike("tvr"),
                tsi = data.stringLike("tsi"),
                appLabel = data.stringLike("app_label") ?: data.stringLike("app_name"),
                raw = dump,
            )
        }

        val cancelled = errorMsg.lowercase().let { m ->
            m.contains("cancel") || m.contains("abort") || m.contains("user")
        }
        return EcrPaymentResult(
            approved = false,
            status = if (cancelled) EcrPaymentResult.Status.CANCELLED else EcrPaymentResult.Status.DECLINED,
            orderNo = orderNo,
            message = errorMsg.ifBlank { "Payment failed (code $errorCode)" },
            raw = dump,
        )
    }

    // SmartPay is loose about types — read tolerantly.
    private fun Intent.intLike(key: String): Int? = when (val v = extras?.get(key)) {
        is Int -> v
        is Long -> v.toInt()
        is String -> v.trim().toIntOrNull()
        else -> null
    }

    private fun Intent.longLike(key: String): Long? = when (val v = extras?.get(key)) {
        is Long -> v
        is Int -> v.toLong()
        is String -> v.trim().toLongOrNull()
        else -> null
    }

    private fun Intent.stringLike(key: String): String? =
        extras?.get(key)?.toString()?.trim()?.takeIf { it.isNotEmpty() && it != "null" }

    private const val TAG = "SmartPayIntent"
}

/** SmartPay returns cardType as an Int — reading it as a String silently yields nothing. */
object CardBrand {
    fun name(code: Int): String = when (code) {
        0 -> "UnionPay"
        1 -> "VISA"
        2 -> "Mastercard"
        3 -> "AMEX"
        4 -> "JCB"
        5 -> "Discover"
        6 -> "Diners"
        7 -> "Maestro"
        8 -> "RuPay"
        9 -> "MIR"
        else -> "Card"
    }
}
