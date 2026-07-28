package ae.rfmloyaltyco.terminal.ecr

import android.content.Context

/**
 * Same-device SmartPay integration over Android Intent IPC (no Feitian SDK).
 * This is the default transport on all-in-one Feitian SmartPOS hardware.
 *
 * Amounts are already integer minor units throughout this app (the keypad builds
 * fils directly), so there is no float→cents rounding hazard here.
 */
class SmartPayIntentTransport(private val context: Context) : EcrTransport {

    override fun isLinked(): Boolean = SmartPayIntentBridge.isInstalled(context)

    override suspend fun connect(): String? =
        if (isLinked()) null else "SmartPay app not found on this terminal"

    override suspend fun purchase(amountMinor: Long, orderNo: String): EcrPaymentResult =
        SmartPayIntentBridge.run(
            context, orderNo,
            mapOf(
                "trans_type" to SmartPayIntentBridge.TRANS_PURCHASE,
                "trans_amount" to amountMinor.toInt(),
                "order_no" to orderNo,
            ),
        )

    /** Refund needs the original transaction's voucher number. */
    override suspend fun refund(amountMinor: Long, orderNo: String, originalOrderNo: String): EcrPaymentResult =
        SmartPayIntentBridge.run(
            context, orderNo,
            mapOf(
                "trans_type" to SmartPayIntentBridge.TRANS_REFUND,
                "trans_amount" to amountMinor.toInt(),
                "voucher_no" to originalOrderNo,
                "order_no" to orderNo,
            ),
        )

    /** Void takes the voucher number only — no amount. */
    override suspend fun voidPurchase(orderNo: String, originalOrderNo: String): EcrPaymentResult =
        SmartPayIntentBridge.run(
            context, orderNo,
            mapOf(
                "trans_type" to SmartPayIntentBridge.TRANS_VOID,
                "voucher_no" to originalOrderNo,
            ),
        )

    /** SmartPay owns its own screen; the cashier cancels there. */
    override suspend fun cancel(originalOrderNo: String) = Unit

    override fun shutdown() = Unit
}
