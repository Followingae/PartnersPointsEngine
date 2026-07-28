package ae.rfmloyaltyco.terminal.ecr

import org.json.JSONObject

/** Outcome of a payment request pushed to the SmartPay app. */
data class EcrPaymentResult(
    val approved: Boolean,
    val status: Status,
    val orderNo: String,
    val message: String,
    val maskedPan: String? = null,
    val cardType: String? = null,
    val authNo: String? = null,
    val voucherNo: String? = null,
    val referNo: String? = null,
    val paymentMethod: String? = null,
    val amountMinor: Long? = null,
    // full acquirer slip data (SmartPay returns these; needed for a compliant
    // merchant copy so SmartPay's own printout can be switched off)
    val batchNo: String? = null,
    val terminalNo: String? = null,
    val merchantNo: String? = null,
    val transTime: String? = null,
    val cardExpiry: String? = null,
    val responseCode: String? = null,
    val aid: String? = null,
    val tvr: String? = null,
    val tsi: String? = null,
    val cid: String? = null,
    val ac: String? = null,
    val currencyCode: String? = null,
    val transType: String? = null,
    val appLabel: String? = null,
    /** Every extra SmartPay returned, so nothing is lost from the slip. */
    val extras: Map<String, String> = emptyMap(),
    val raw: String? = null,
) {
    enum class Status { APPROVED, DECLINED, CANCELLED, TIMEOUT, LINK_ERROR }
}

/**
 * Abstraction over the Feitian ECR SDK so the checkout saga is testable and the
 * app can run in demo mode with no SmartPay present.
 */
interface EcrTransport {
    /** Establish the link (idempotent). Returns null on success, else a user-facing error. */
    suspend fun connect(): String?

    suspend fun purchase(amountMinor: Long, orderNo: String): EcrPaymentResult

    suspend fun refund(amountMinor: Long, orderNo: String, originalOrderNo: String): EcrPaymentResult

    suspend fun voidPurchase(orderNo: String, originalOrderNo: String): EcrPaymentResult

    /** Ask SmartPay to abort the in-flight transaction (best effort). */
    suspend fun cancel(originalOrderNo: String)

    fun isLinked(): Boolean

    fun shutdown()

    companion object {
        /** Parse a SmartPay transaction-response JSON payload (§3.1 of the ECR spec). */
        fun parseResponse(orderNo: String, data: String?): EcrPaymentResult {
            if (data.isNullOrBlank()) {
                return EcrPaymentResult(false, EcrPaymentResult.Status.LINK_ERROR, orderNo, "Empty response from SmartPay")
            }
            return try {
                val j = JSONObject(data)
                val transStatus = j.optString("trans_status", j.optString("error_code", "-1"))
                val approved = transStatus == "1" || (j.optInt("trans_status", -1) == 1)
                val errInfo = j.optString("error_info").ifBlank { null }
                EcrPaymentResult(
                    approved = approved,
                    status = if (approved) EcrPaymentResult.Status.APPROVED else EcrPaymentResult.Status.DECLINED,
                    orderNo = j.optString("order_no").ifBlank { orderNo },
                    message = if (approved) "Approved" else (errInfo ?: "Declined by SmartPay"),
                    maskedPan = j.optString("card_no").ifBlank { null },
                    cardType = j.optString("card_type").ifBlank { null },
                    authNo = j.optString("auth_no").ifBlank { null },
                    voucherNo = j.optString("voucher_no").ifBlank { null },
                    referNo = j.optString("refer_no").ifBlank { null },
                    paymentMethod = j.optString("payment_method").ifBlank { null },
                    raw = data,
                )
            } catch (_: Exception) {
                EcrPaymentResult(false, EcrPaymentResult.Status.LINK_ERROR, orderNo, "Unreadable response from SmartPay", raw = data)
            }
        }

        /** Human messages for the documented ECR error codes. */
        fun errorMessage(code: Int): String = when (code) {
            0 -> "OK"
            0x0003 -> "Operation timed out"
            0x0041, 0x0042, 0x0043 -> "Cannot reach SmartPay — check the ECR link"
            0x0101, 0x0102 -> "Connection to SmartPay lost"
            0x3003 -> "Payment timed out on SmartPay"
            0x3004 -> "Cancelled on the payment screen"
            0x3005 -> "Cancelled by this terminal"
            0x3024 -> "Duplicate order number"
            0x3025 -> "Order not found on SmartPay"
            0x3026 -> "SmartPay is busy or out of service"
            70 -> "SmartPay disconnected"
            else -> "ECR error 0x%x".format(code)
        }
    }
}
