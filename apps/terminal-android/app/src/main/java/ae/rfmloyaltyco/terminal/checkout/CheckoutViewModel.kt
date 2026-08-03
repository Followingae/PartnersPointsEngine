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
import ae.rfmloyaltyco.terminal.receipt.ReceiptStamp
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
        /** Set when an identical sale was just charged and we want the cashier to confirm. */
        val duplicatePrompt: DuplicatePrompt? = null,
        /** Server-owned valuation + brand identity (cached across offline restarts). */
        val server: ServerConfig? = null,
        val rate: RedemptionRate = RedemptionRate.DEFAULT,
        val voucherBusy: Boolean = false,
        val voucherError: String? = null,
        val redeemedVouchers: List<ae.rfmloyaltyco.terminal.api.VoucherRedemption> = emptyList(),
        /** Rewards the identified customer already holds. */
        val availableVouchers: List<ae.rfmloyaltyco.terminal.api.AvailableVoucher> = emptyList(),
    ) {
        fun redeemValueMinor(): Long = rate.valueMinor(redeemPoints, amountMinor)

        /** Discount-type reward vouchers come off the bill too. */
        fun voucherDiscountMinor(): Long =
            redeemedVouchers.sumOf { it.discountMinor }.coerceAtMost(amountMinor)

        fun netMinor(): Long =
            (amountMinor - redeemValueMinor() - voucherDiscountMinor()).coerceAtLeast(0)
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state

    val config get() = settings.snapshot()

    private var payJob: Job? = null
    /** The last completed sale, for spotting the same one going through twice. */
    private var lastCompleted: CompletedSale? = null
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
        // What rewards do they already hold? The cashier shouldn't need the code.
        val available = runCatching { api.memberVouchers(token) }.getOrDefault(emptyList())
        _state.update {
            it.copy(
                lookupBusy = false,
                lookupNotFound = false,
                member = Member(token, identifierType, value, context),
                quote = quote,
                redeemPoints = 0,
                availableVouchers = available,
            )
        }
    }

    // ── reward vouchers ──────────────────────────────────────────────────────

    /**
     * Accept a reward voucher the customer presents. Marks it used server-side;
     * a discount-type reward also comes off this bill.
     */
    fun redeemVoucher(code: String) {
        if (code.isBlank()) return
        _state.update { it.copy(voucherBusy = true, voucherError = null) }
        viewModelScope.launch {
            try {
                val v = api.redeemVoucher(code.trim(), _state.value.member?.token)
                _state.update {
                    it.copy(
                        voucherBusy = false,
                        voucherError = null,
                        redeemedVouchers = it.redeemedVouchers + v,
                        // it's used now — drop it from the "available" list
                        availableVouchers = it.availableVouchers.filterNot { a -> a.code.equals(v.code, true) },
                    )
                }
            } catch (e: TerminalApi.ApiException) {
                _state.update { it.copy(voucherBusy = false, voucherError = e.errorMessage) }
            } catch (_: Exception) {
                _state.update { it.copy(voucherBusy = false, voucherError = "Can't reach the loyalty service — try again") }
            }
        }
    }

    fun clearVoucherError() = _state.update { it.copy(voucherError = null) }

    fun clearMember() {
        _state.update { it.copy(member = null, quote = null, redeemPoints = 0, lookupError = null, lookupNotFound = false) }
    }

    // ── redemption ───────────────────────────────────────────────────────────

    /** Direct setter for the slider / custom amount — clamps to balance, bill cap and minimum. */
    fun setRedeemExact(points: Long) {
        val s = _state.value
        val member = s.member ?: return
        val rate = s.rate
        if (!rate.enabled) return
        val capByBalance = member.context?.availablePoints ?: Long.MAX_VALUE
        val capValueMinor = s.amountMinor * rate.maxPercentOfBillBps / 10000
        val capByAmount = if (rate.rateValueMinor > 0) capValueMinor * rate.ratePoints / rate.rateValueMinor else Long.MAX_VALUE
        val clamped = points.coerceIn(0, minOf(capByBalance, capByAmount))
        _state.update { it.copy(redeemPoints = if (clamped < rate.minRedeemPoints) 0 else clamped) }
    }

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

    fun takePayment(method: String, confirmedDuplicate: Boolean = false) {
        if (payJob?.isActive == true) return
        val snapshot = _state.value
        val cfg = config

        // A second identical sale moments after the first is nearly always the
        // same sale going through twice — a re-tap, a screen the cashier thought
        // hadn't registered. The existing guard only covers a tap *while* the
        // first is in flight, which is why a customer was charged and awarded
        // points twice for one purchase. Ask rather than assume: a genuine
        // second round of the same drinks is possible, just rare.
        val prior = lastCompleted
        if (!confirmedDuplicate && prior != null &&
            prior.amountMinor == snapshot.amountMinor &&
            prior.memberKey == snapshot.member?.identifierValue &&
            System.currentTimeMillis() - prior.atMillis < DUPLICATE_WINDOW_MS
        ) {
            _state.update {
                it.copy(
                    duplicatePrompt = DuplicatePrompt(
                        method = method,
                        secondsAgo = ((System.currentTimeMillis() - prior.atMillis) / 1000).toInt(),
                    ),
                )
            }
            return
        }
        _state.update { it.copy(duplicatePrompt = null) }
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
            var paymentOk = method == "cash" || (ecrResult?.approved == true)
            // Verify what was actually charged (SmartPay echoes trans_amount back).
            if (paymentOk && ecrResult?.amountMinor != null && ecrResult.amountMinor != net) {
                loyaltyNote = "Charged ${ecrResult.amountMinor} vs expected $net — verify before reconciling"
            }

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
            var earnTxn: ae.rfmloyaltyco.terminal.api.Txn? = null
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
                    val txn = api.earn(member.token, earnBase, idem, orderNo)
                    earnTxn = txn // stamp cards + unlocked rewards for the slip
                    txn.points ?: 0L
                } catch (_: Exception) {
                    outbox.enqueueEarn(member.identifierType, member.identifierValue, earnBase, idem, orderNo)
                    loyaltyNote = listOfNotNull(loyaltyNote, "Earn queued — will sync automatically").joinToString("; ")
                    _state.value.quote?.earnPoints ?: 0L
                }
            }

            // The campaigns behind this earn, named. Taken from the transaction
            // the server actually posted; the quote is the fallback for an earn
            // that went to the outbox and has no transaction to read yet.
            val earnBonuses = earnTxn?.bonuses?.takeIf { it.isNotEmpty() }
                ?: _state.value.quote?.bonuses.orEmpty()

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
                // Lets the server attach the rewards used on this sale to the
                // eReceipt, so the digital copy matches the printed slip.
                .apply { member?.token?.let { put("memberToken", it) } }
                // So the eReceipt and the emailed copy name the happy hour too,
                // not just the slip that came out of the printer.
                .apply {
                    if (earnBonuses.isNotEmpty()) {
                        put(
                            "bonuses",
                            org.json.JSONArray().apply {
                                earnBonuses.forEach { b ->
                                    put(
                                        org.json.JSONObject()
                                            .put("name", b.name)
                                            .apply { b.factor?.let { put("factor", it) } }
                                            .apply { b.points?.let { put("points", it) } },
                                    )
                                }
                            },
                        )
                    }
                }
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
                brandName = server?.brandName?.ifBlank { null } ?: "",
                branchName = server?.branchName,
                terminalLabel = server?.terminalLabel ?: cfg.terminalLabel,
                at = System.currentTimeMillis(),
                orderNo = orderNo,
                grossMinor = gross,
                discountMinor = discount,
                netMinor = net,
                currency = cfg.currency,
                paymentMethod = method,
                memberName = member?.context?.displayName,
                earnedPoints = earnedPoints,
                redeemedPoints = redeemPoints,
                balanceAfter = balanceAfter,
                pointsCode = server?.pointsCode ?: "PTS",
                loyaltyId = member?.context?.loyaltyId?.ifBlank { null },
                memberPhoneMasked = member?.takeIf { it.identifierType == "phone" }?.identifierValue?.let { maskPhone(it) },
                eReceiptUrl = eUrl,
                bonuses = earnBonuses.map { ae.rfmloyaltyco.terminal.receipt.ReceiptBonus(it.name, it.label) },
                stamps = earnTxn?.stamps.orEmpty().map { ReceiptStamp(it.name, it.progress, it.target) },
                unlocked = earnTxn?.completed.orEmpty().mapNotNull { it.badgeName ?: it.name.takeIf { _ -> it.voucherCode != null } },
                vouchers = snapshot.redeemedVouchers.map { v ->
                    ae.rfmloyaltyco.terminal.receipt.ReceiptVoucher(v.code, v.rewardName, v.discountMinor)
                },
            )
            lastCompleted = CompletedSale(
                amountMinor = gross,
                memberKey = member?.identifierValue,
                atMillis = System.currentTimeMillis(),
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

    /** The cashier says this really is a second identical sale — proceed. */
    fun confirmDuplicate() {
        val prompt = _state.value.duplicatePrompt ?: return
        _state.update { it.copy(duplicatePrompt = null) }
        takePayment(prompt.method, confirmedDuplicate = true)
    }

    fun dismissDuplicate() = _state.update { it.copy(duplicatePrompt = null) }

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
        voucherNo = ecr?.voucherNo,
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

/** A sale the cashier may be about to repeat by accident. */
data class DuplicatePrompt(val method: String, val secondsAgo: Int)

/** What was last charged, for duplicate detection. */
private data class CompletedSale(
    val amountMinor: Long,
    val memberKey: String?,
    val atMillis: Long,
)

/**
 * How long an identical sale is treated as suspicious.
 *
 * Long enough to cover a cashier re-tapping after a screen they thought hadn't
 * registered; short enough that a genuine second round of the same order isn't
 * constantly questioned.
 */
private const val DUPLICATE_WINDOW_MS = 120_000L
