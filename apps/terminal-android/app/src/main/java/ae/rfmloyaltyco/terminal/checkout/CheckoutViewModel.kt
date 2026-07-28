package ae.rfmloyaltyco.terminal.checkout

import ae.rfmloyaltyco.terminal.TerminalApp
import ae.rfmloyaltyco.terminal.api.MemberContext
import ae.rfmloyaltyco.terminal.api.Quote
import ae.rfmloyaltyco.terminal.api.RedemptionRate
import ae.rfmloyaltyco.terminal.api.ServerConfig
import ae.rfmloyaltyco.terminal.api.TerminalApi
import ae.rfmloyaltyco.terminal.data.TxnRecord
import ae.rfmloyaltyco.terminal.ecr.EcrPaymentResult
import ae.rfmloyaltyco.terminal.receipt.ReceiptData
import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import java.util.UUID
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The checkout saga:
 *
 *   amount → (optional) member → (optional) redeem hold → SmartPay payment
 *   → approved: capture hold + post earn   → declined/cancelled: void hold
 *
 * Loyalty writes that fail after an approved payment are queued in the offline
 * outbox (earn) or retried (capture) — payment success is never rolled back by
 * a loyalty error.
 */
class CheckoutViewModel(app: Application) : AndroidViewModel(app) {

    private val container = app as TerminalApp
    private val api get() = container.api
    private val settings get() = container.settings
    private val history get() = container.history
    private val outbox get() = container.outbox

    data class Member(
        val token: String,
        val identifierType: String,
        val identifierValue: String,
        val context: MemberContext?,
    )

    data class PaymentOutcome(
        val success: Boolean,
        val method: String, // card | cash
        val ecr: EcrPaymentResult?,
        val earnedPoints: Long,
        val redeemedPoints: Long,
        val balanceAfter: Long?,
        val loyaltyNote: String?,
        val message: String,
        val receipt: ReceiptData? = null,
    )

    data class State(
        val amountMinor: Long = 0L,
        val member: Member? = null,
        val quote: Quote? = null,
        val lookupBusy: Boolean = false,
        val lookupError: String? = null,
        val lookupNotFound: Boolean = false,
        val lastLookupPhone: String? = null,
        val redeemPoints: Long = 0L,
        val redeemBusy: Boolean = false,
        val paying: Boolean = false,
        val payingMessage: String = "",
        val outcome: PaymentOutcome? = null,
        val flowError: String? = null,
        /** Server-owned valuation + brand identity (cached across offline restarts). */
        val server: ServerConfig? = null,
        val rate: RedemptionRate = RedemptionRate.DEFAULT,
    ) {
        fun redeemValueMinor(): Long = rate.valueMinor(redeemPoints, amountMinor)

        fun netMinor(): Long = (amountMinor - redeemValueMinor()).coerceAtLeast(0)
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state

    val config get() = settings.snapshot()

    private var payJob: Job? = null
    private var currentOrderNo: String? = null

    init {
        // Crash recovery: a hold left dangling by a killed process is voided on
        // relaunch (best-effort; server TTL is the backstop).
        val pendingHold = prefs().getString(PENDING_HOLD, null)
        if (!pendingHold.isNullOrBlank()) {
            viewModelScope.launch {
                runCatching { api.void(pendingHold) }
                prefs().edit().remove(PENDING_HOLD).apply()
            }
        }
        // Replay any offline-queued earns in the background.
        viewModelScope.launch { runCatching { outbox.replayAll() } }
        // Valuation: cached copy immediately, fresh copy from the engine when reachable.
        settings.cachedServerConfig()?.let { cached ->
            _state.update { it.copy(server = cached, rate = cached.redemption) }
        }
        viewModelScope.launch {
            runCatching { api.fetchConfig() }.onSuccess { fresh ->
                settings.cacheServerConfig(fresh.raw)
                _state.update { it.copy(server = fresh, rate = fresh.redemption) }
            }
        }
    }

    fun refreshServerConfig() {
        viewModelScope.launch {
            runCatching { api.fetchConfig() }.onSuccess { fresh ->
                settings.cacheServerConfig(fresh.raw)
                _state.update { it.copy(server = fresh, rate = fresh.redemption) }
            }
        }
    }

    // ── amount entry ─────────────────────────────────────────────────────────

    fun onAmountDigit(d: Char) {
        _state.update {
            val next = (it.amountMinor * 10 + (d - '0')).coerceAtMost(99_999_999L)
            it.copy(amountMinor = next)
        }
    }

    fun onAmountBackspace() {
        _state.update { it.copy(amountMinor = it.amountMinor / 10) }
    }

    fun resetSale() {
        payJob?.cancel()
        payJob = null
        currentOrderNo = null
        _state.value = State()
    }

    // ── customer recognition ─────────────────────────────────────────────────

    fun lookup(identifierType: String, rawValue: String) {
        val value = if (identifierType == "phone") TerminalApi.normalizePhone(rawValue) else rawValue
        _state.update { it.copy(lookupBusy = true, lookupError = null, lookupNotFound = false) }
        viewModelScope.launch {
            try {
                val token = api.resolve(identifierType, value)
                onMemberToken(token, identifierType, value)
            } catch (e: TerminalApi.ApiException) {
                if (e.status == 404 && identifierType == "phone") {
                    _state.update { it.copy(lookupBusy = false, lookupNotFound = true, lastLookupPhone = value, lookupError = null) }
                } else {
                    val msg = if (e.status == 404) "No member found for this code" else e.errorMessage
                    _state.update { it.copy(lookupBusy = false, lookupError = msg) }
                }
            } catch (e: Exception) {
                _state.update { it.copy(lookupBusy = false, lookupError = "Can't reach the loyalty service — sale can continue without loyalty") }
            }
        }
    }

    /** New number at the till: create the membership on the spot (name optional). */
    fun enroll(name: String?) {
        val phone = _state.value.lastLookupPhone ?: return
        _state.update { it.copy(lookupBusy = true, lookupError = null) }
        viewModelScope.launch {
            try {
                val token = api.enroll(phone, name)
                onMemberToken(token, "phone", phone)
            } catch (e: TerminalApi.ApiException) {
                _state.update { it.copy(lookupBusy = false, lookupError = "Couldn't enrol: ${e.errorMessage}") }
            } catch (e: Exception) {
                _state.update { it.copy(lookupBusy = false, lookupError = "Can't reach the loyalty service — try again") }
            }
        }
    }

    private suspend fun onMemberToken(token: String, identifierType: String, value: String) {
        val context = runCatching { api.memberContext(token) }.getOrNull()
        val quote = runCatching { api.quote(token, _state.value.amountMinor) }.getOrNull()
        _state.update {
            it.copy(
                lookupBusy = false,
                lookupNotFound = false,
                member = Member(token, identifierType, value, context),
                quote = quote,
                redeemPoints = 0,
            )
        }
    }

    fun clearMember() {
        _state.update { it.copy(member = null, quote = null, redeemPoints = 0, lookupError = null, lookupNotFound = false) }
    }

    // ── redemption ───────────────────────────────────────────────────────────

    fun selectRedeem(points: Long) {
        val s = _state.value
        val member = s.member ?: return
        val rate = s.rate
        if (!rate.enabled) return
        val capByBalance = member.context?.availablePoints ?: Long.MAX_VALUE
        // most points the bill can absorb under the configured max-% cap
        val capValueMinor = s.amountMinor * rate.maxPercentOfBillBps / 10000
        val capByAmount = if (rate.rateValueMinor > 0) capValueMinor * rate.ratePoints / rate.rateValueMinor else Long.MAX_VALUE
        val clamped = points.coerceAtMost(minOf(capByBalance, capByAmount)).coerceAtLeast(0)
        val effective = if (clamped < rate.minRedeemPoints) 0 else clamped
        _state.update { it.copy(redeemPoints = if (it.redeemPoints == effective) 0 else effective) }
    }

    // ── payment ──────────────────────────────────────────────────────────────

    fun takePayment(method: String) {
        if (payJob?.isActive == true) return
        val snapshot = _state.value
        val cfg = config
        _state.update { it.copy(paying = true, payingMessage = "Preparing…", flowError = null, outcome = null) }

        payJob = viewModelScope.launch {
            val gross = snapshot.amountMinor
            val redeemPoints = snapshot.redeemPoints
            val discount = snapshot.redeemValueMinor()
            val net = snapshot.netMinor()
            val member = snapshot.member
            val orderNo = newOrderNo().also { currentOrderNo = it }
            var holdId: String? = null
            var loyaltyNote: String? = null

            // 1 — place the redemption hold before money moves
            if (member != null && redeemPoints > 0) {
                _state.update { it.copy(payingMessage = "Reserving ${redeemPoints} points…") }
                try {
                    val hold = api.redeemAuthorize(member.token, redeemPoints, TerminalApi.newIdempotencyKey(), orderNo)
                    holdId = hold.id
                    prefs().edit().putString(PENDING_HOLD, hold.id).apply()
                } catch (e: TerminalApi.ApiException) {
                    _state.update { it.copy(paying = false, flowError = "Couldn't reserve points: ${e.errorMessage}") }
                    return@launch
                } catch (e: Exception) {
                    _state.update { it.copy(paying = false, flowError = "Loyalty service unreachable — remove the redemption or retry") }
                    return@launch
                }
            }

            // 2 — take the money
            val ecrResult: EcrPaymentResult? = if (method == "card") {
                _state.update { it.copy(payingMessage = "Waiting for SmartPay…\nAsk the customer to pay on the terminal") }
                container.ecr().purchase(net, orderNo)
            } else {
                null // cash: settled at the till
            }
            val paymentOk = method == "cash" || (ecrResult?.approved == true)

            if (!paymentOk) {
                // 3a — release the hold
                holdId?.let { id ->
                    runCatching { api.void(id) }
                    prefs().edit().remove(PENDING_HOLD).apply()
                }
                history.add(
                    record(
                        kind = "sale", status = statusOf(ecrResult), gross = gross, net = net,
                        redeem = redeemPoints, earn = 0, member = member, orderNo = orderNo,
                        method = method, ecr = ecrResult, note = ecrResult?.message,
                    ),
                )
                _state.update {
                    it.copy(
                        paying = false,
                        flowError = null,
                        outcome = PaymentOutcome(
                            success = false, method = method, ecr = ecrResult,
                            earnedPoints = 0, redeemedPoints = 0, balanceAfter = null,
                            loyaltyNote = null, message = ecrResult?.message ?: "Payment not completed",
                        ),
                    )
                }
                return@launch
            }

            // 3b — settle loyalty: capture the hold, then post the earn
            var earnedPoints = 0L
            if (holdId != null) {
                _state.update { it.copy(payingMessage = "Redeeming points…") }
                var captured = false
                repeat(3) { attempt ->
                    if (!captured) {
                        captured = runCatching { api.capture(holdId) }.isSuccess
                        if (!captured && attempt < 2) kotlinx.coroutines.delay(1200)
                    }
                }
                if (captured) {
                    prefs().edit().remove(PENDING_HOLD).apply()
                } else {
                    // leave PENDING_HOLD? No: the payment succeeded, the discount was
                    // given. Flag for reconciliation instead of voiding on next boot.
                    prefs().edit().remove(PENDING_HOLD).apply()
                    loyaltyNote = "Point redemption capture pending — flag for back-office reconciliation (hold $holdId)"
                }
            }

            if (member != null) {
                _state.update { it.copy(payingMessage = "Awarding points…") }
                val earnBase = if (cfg.earnOnNet) net else gross
                val idem = TerminalApi.newIdempotencyKey()
                earnedPoints = try {
                    api.earn(member.token, earnBase, idem, orderNo).points ?: 0L
                } catch (_: Exception) {
                    outbox.enqueueEarn(member.identifierType, member.identifierValue, earnBase, idem, orderNo)
                    loyaltyNote = listOfNotNull(loyaltyNote, "Earn queued — will sync automatically").joinToString("; ")
                    _state.value.quote?.earnPoints ?: 0L
                }
            }

            val balanceAfter = member?.context?.let { c -> c.availablePoints - redeemPoints + earnedPoints }
            // eReceipt: client-generated token so the printed QR is valid even if
            // the upload replays later from the outbox.
            val eToken = UUID.randomUUID().toString()
            val eUrl = cfg.baseUrl.trimEnd('/').removeSuffix("/terminal") + "/r/" + eToken
            val server = snapshot.server
            val receiptPayload = org.json.JSONObject()
                .put("token", eToken)
                .put("kind", "sale")
                .put("orderNo", orderNo)
                .put("grossMinor", gross)
                .put("discountMinor", snapshot.redeemValueMinor())
                .put("netMinor", net)
                .put("currency", cfg.currency)
                .put("paymentMethod", method)
                .put("maskedPan", ecrResult?.maskedPan)
                .put("authNo", ecrResult?.authNo)
                .put("memberName", member?.context?.displayName)
                .put("earnedPoints", earnedPoints)
                .put("redeemedPoints", redeemPoints)
                .apply { balanceAfter?.let { put("balanceAfter", it) } }
                .put("pointsCode", server?.pointsCode ?: "PTS")
            viewModelScope.launch {
                runCatching { api.createReceipt(receiptPayload) }
                    .onFailure { outbox.enqueueReceipt(receiptPayload) }
            }
            history.add(
                record(
                    kind = "sale", status = "approved", gross = gross, net = net,
                    redeem = redeemPoints, earn = earnedPoints, member = member, orderNo = orderNo,
                    method = method, ecr = ecrResult, note = loyaltyNote,
                ).copy(eReceiptToken = eToken),
            )
            val receipt = ReceiptData(
                brandName = server?.brandName?.ifBlank { null } ?: "Partners Points",
                branchName = server?.branchName,
                terminalLabel = server?.terminalLabel ?: cfg.terminalLabel,
                at = System.currentTimeMillis(),
                orderNo = orderNo,
                grossMinor = gross,
                discountMinor = discount,
                netMinor = net,
                currency = cfg.currency,
                paymentMethod = method,
                maskedPan = ecrResult?.maskedPan,
                authNo = ecrResult?.authNo,
                memberName = member?.context?.displayName,
                earnedPoints = earnedPoints,
                redeemedPoints = redeemPoints,
                balanceAfter = balanceAfter,
                pointsCode = server?.pointsCode ?: "PTS",
                loyaltyId = member?.context?.loyaltyId?.ifBlank { null },
                memberPhoneMasked = member?.takeIf { it.identifierType == "phone" }?.identifierValue?.let { maskPhone(it) },
                eReceiptUrl = eUrl,
            )
            _state.update {
                it.copy(
                    paying = false,
                    outcome = PaymentOutcome(
                        success = true, method = method, ecr = ecrResult,
                        earnedPoints = earnedPoints, redeemedPoints = redeemPoints,
                        balanceAfter = balanceAfter, loyaltyNote = loyaltyNote, message = "Payment approved",
                        receipt = receipt,
                    ),
                )
            }
        }
    }

    fun cancelPayment() {
        val orderNo = currentOrderNo ?: return
        viewModelScope.launch { runCatching { container.ecr().cancel(orderNo) } }
    }

    fun dismissOutcome(success: Boolean) {
        if (success) resetSale() else _state.update { it.copy(outcome = null) }
    }

    fun clearFlowError() = _state.update { it.copy(flowError = null) }

    // ── helpers ──────────────────────────────────────────────────────────────

    private fun record(
        kind: String,
        status: String,
        gross: Long,
        net: Long,
        redeem: Long,
        earn: Long,
        member: Member?,
        orderNo: String,
        method: String,
        ecr: EcrPaymentResult?,
        note: String?,
    ) = TxnRecord(
        localId = UUID.randomUUID().toString(),
        at = System.currentTimeMillis(),
        kind = kind,
        grossMinor = gross,
        netMinor = net,
        redeemPoints = redeem,
        earnPoints = earn,
        memberName = member?.context?.displayName,
        memberPhone = member?.takeIf { it.identifierType == "phone" }?.identifierValue,
        ecrOrderNo = orderNo,
        paymentMethod = method,
        maskedPan = ecr?.maskedPan,
        authNo = ecr?.authNo,
        status = status,
        note = note,
    )

    private fun statusOf(ecr: EcrPaymentResult?): String = when (ecr?.status) {
        EcrPaymentResult.Status.CANCELLED -> "cancelled"
        EcrPaymentResult.Status.TIMEOUT -> "failed"
        EcrPaymentResult.Status.LINK_ERROR -> "failed"
        else -> "declined"
    }

    private fun prefs() = getApplication<TerminalApp>().getSharedPreferences("rfm_terminal", 0)

    companion object {
        private const val PENDING_HOLD = "pending_hold_txn"

        fun maskPhone(p: String): String =
            if (p.length > 6) p.take(4) + "•".repeat(p.length - 7) + p.takeLast(3) else p

        /** ECR order numbers: 6–24 chars, [0-9A-Za-z_-*], unique per terminal. */
        fun newOrderNo(): String {
            val t = System.currentTimeMillis() / 1000
            val r = (1000..9999).random()
            return "RFM$t$r"
        }
    }
}
