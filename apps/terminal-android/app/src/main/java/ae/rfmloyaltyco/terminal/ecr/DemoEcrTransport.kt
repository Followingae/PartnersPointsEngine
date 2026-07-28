package ae.rfmloyaltyco.terminal.ecr

import kotlinx.coroutines.delay

/**
 * Hardware-free SmartPay simulator so the whole loyalty flow can be exercised on
 * any Android device. Behaviour hooks (amount in minor units):
 *   ends in .13 → declined, .14 → timeout, .15 → cancelled; everything else approves.
 */
class DemoEcrTransport : EcrTransport {

    override suspend fun connect(): String? {
        delay(300)
        return null
    }

    override fun isLinked(): Boolean = true

    override suspend fun purchase(amountMinor: Long, orderNo: String): EcrPaymentResult {
        delay(2200)
        return when (amountMinor % 100) {
            13L -> EcrPaymentResult(false, EcrPaymentResult.Status.DECLINED, orderNo, "Declined (demo)")
            14L -> EcrPaymentResult(false, EcrPaymentResult.Status.TIMEOUT, orderNo, "Timed out (demo)")
            15L -> EcrPaymentResult(false, EcrPaymentResult.Status.CANCELLED, orderNo, "Cancelled (demo)")
            else -> EcrPaymentResult(
                approved = true,
                status = EcrPaymentResult.Status.APPROVED,
                orderNo = orderNo,
                message = "Approved",
                maskedPan = "•••• 4242",
                cardType = "VISA",
                authNo = "D" + (100000..999999).random(),
                voucherNo = (100000..999999).random().toString(),
                paymentMethod = "card",
            )
        }
    }

    override suspend fun refund(amountMinor: Long, orderNo: String, originalOrderNo: String): EcrPaymentResult {
        delay(1800)
        return EcrPaymentResult(true, EcrPaymentResult.Status.APPROVED, orderNo, "Refund approved", paymentMethod = "card")
    }

    override suspend fun voidPurchase(orderNo: String, originalOrderNo: String): EcrPaymentResult {
        delay(1200)
        return EcrPaymentResult(true, EcrPaymentResult.Status.APPROVED, orderNo, "Void approved")
    }

    override suspend fun cancel(originalOrderNo: String) = Unit

    override fun shutdown() = Unit
}
