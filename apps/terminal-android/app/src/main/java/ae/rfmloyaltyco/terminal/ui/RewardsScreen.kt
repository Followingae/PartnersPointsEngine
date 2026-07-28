package ae.rfmloyaltyco.terminal.ui

import ae.rfmloyaltyco.terminal.checkout.CheckoutViewModel
import ae.rfmloyaltyco.terminal.theme.PrimaryAction
import ae.rfmloyaltyco.terminal.theme.RfmCard
import ae.rfmloyaltyco.terminal.theme.RfmColor
import ae.rfmloyaltyco.terminal.theme.SecondaryAction
import ae.rfmloyaltyco.terminal.theme.TerminalScaffold
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlin.math.roundToLong

/**
 * Order review + tender. Redemption is expressed in whole dirhams — cashiers and
 * customers negotiate in money, never in points-per-cent. Points are the
 * mechanism; AED is the language.
 */
@Composable
fun RewardsScreen(vm: CheckoutViewModel, onBack: () -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    val cfg = vm.config
    val rate = state.rate
    val member = state.member
    val net = state.netMinor()
    val redeemValue = state.redeemValueMinor()

    var scanningVoucher by remember { mutableStateOf(false) }
    var voucherEntry by remember { mutableStateOf("") }
    var showVoucherEntry by remember { mutableStateOf(false) }

    if (scanningVoucher) {
        ScanScreen(
            title = "Scan the customer's reward",
            onResult = { code ->
                scanningVoucher = false
                vm.redeemVoucher(code)
            },
            onCancel = { scanningVoucher = false },
        )
        return
    }

    TerminalScaffold(
        title = "Charge",
        subtitle = member?.context?.displayName ?: "No loyalty on this sale",
        onBack = onBack,
        bottomBar = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                state.flowError?.let { err ->
                    Text(err, style = MaterialTheme.typography.bodyMedium, color = RfmColor.Destructive)
                }
                PrimaryAction("Card · ${formatAmountWithCurrency(net, cfg.currency)}", loading = state.paying) {
                    vm.takePayment("card")
                }
                SecondaryAction("Cash · ${formatAmountWithCurrency(net, cfg.currency)}", enabled = !state.paying) {
                    vm.takePayment("cash")
                }
            }
        },
    ) {
        Column(
            Modifier.verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // ── amount summary (compact) ──────────────────────────────────────
            RfmCard(padding = 16.dp) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Bill", style = MaterialTheme.typography.bodyMedium, color = RfmColor.MutedFg, modifier = Modifier.weight(1f))
                    Text(formatAmountWithCurrency(state.amountMinor, cfg.currency), style = MaterialTheme.typography.titleMedium, color = RfmColor.Ink)
                }
                if (redeemValue > 0) {
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Points discount", style = MaterialTheme.typography.bodyMedium, color = RfmColor.MutedFg, modifier = Modifier.weight(1f))
                        Text("− ${formatAmountWithCurrency(redeemValue, cfg.currency)}", style = MaterialTheme.typography.titleMedium, color = RfmColor.Blush)
                    }
                }
                state.redeemedVouchers.forEach { v ->
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(v.rewardName, style = MaterialTheme.typography.bodyMedium, color = RfmColor.MutedFg, modifier = Modifier.weight(1f))
                        Text(
                            if (v.discountMinor > 0) "− ${formatAmountWithCurrency(v.discountMinor, cfg.currency)}" else "FREE",
                            style = MaterialTheme.typography.titleMedium,
                            color = RfmColor.Lime600,
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.Bottom) {
                    Text("To pay", style = MaterialTheme.typography.titleSmall, color = RfmColor.Ink, modifier = Modifier.weight(1f))
                    Text(formatAmountWithCurrency(net, cfg.currency), style = MaterialTheme.typography.displayMedium, color = RfmColor.Ink)
                }
            }

            if (member != null) {
                val available = member.context?.availablePoints ?: 0L
                val quote = state.quote

                // ── rewards this customer already holds — tap to apply ───────
                if (state.availableVouchers.isNotEmpty()) {
                    RfmCard(padding = 14.dp) {
                        Text("Their rewards", style = MaterialTheme.typography.titleSmall, color = RfmColor.Ink)
                        Text(
                            "Tap to use on this sale",
                            style = MaterialTheme.typography.labelMedium,
                            color = RfmColor.MutedFg,
                        )
                        Spacer(Modifier.height(10.dp))
                        state.availableVouchers.forEach { v ->
                            Surface(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 8.dp)
                                    .clickable(enabled = !state.voucherBusy) { vm.redeemVoucher(v.code) },
                                shape = RoundedCornerShape(14.dp),
                                color = RfmColor.Lime200,
                                border = BorderStroke(1.dp, RfmColor.Lime600.copy(alpha = 0.4f)),
                            ) {
                                Row(
                                    Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(Modifier.weight(1f)) {
                                        Text(v.rewardName, style = MaterialTheme.typography.titleSmall, color = RfmColor.Lime900)
                                        Text(
                                            if (v.discountMinor > 0)
                                                "− ${formatAmountWithCurrency(v.discountMinor, cfg.currency)}"
                                            else "Free item",
                                            style = MaterialTheme.typography.labelMedium,
                                            color = RfmColor.Lime900.copy(alpha = 0.75f),
                                        )
                                    }
                                    Text("USE", style = MaterialTheme.typography.titleSmall, color = RfmColor.Lime900)
                                }
                            }
                        }
                    }
                }

                if (rate.enabled && rate.rateValueMinor > 0 && available > 0) {
                    // Everything below is computed in whole dirhams.
                    val billCapMinor = state.amountMinor * rate.maxPercentOfBillBps / 10000
                    val balanceValueMinor = rate.valueMinor(available)
                    val maxAed = minOf(balanceValueMinor, billCapMinor) / 100          // floor to whole AED
                    val minAed = if (rate.minRedeemPoints > 0) (rate.valueMinor(rate.minRedeemPoints) + 99) / 100 else 0L
                    val selectedAed = redeemValue / 100

                    if (maxAed >= maxOf(minAed, 1L)) {
                        RfmCard(padding = 16.dp) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text("Pay with points", style = MaterialTheme.typography.titleMedium, color = RfmColor.Ink)
                                    Text(
                                        "${formatPoints(available)} pts available",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = RfmColor.MutedFg,
                                    )
                                }
                                Text(
                                    if (selectedAed > 0) "− ${cfg.currency} $selectedAed" else "${cfg.currency} 0",
                                    style = MaterialTheme.typography.displayMedium,
                                    color = if (selectedAed > 0) RfmColor.Blush else RfmColor.MutedFg.copy(alpha = 0.4f),
                                )
                            }

                            Slider(
                                value = selectedAed.toFloat(),
                                onValueChange = { raw ->
                                    val aed = raw.roundToLong().coerceIn(0, maxAed)
                                    vm.setRedeemExact(if (aed == 0L) 0L else rate.pointsForValue(aed * 100))
                                },
                                valueRange = 0f..maxAed.toFloat(),
                                steps = if (maxAed in 2..24) (maxAed - 1).toInt() else 0,
                                colors = SliderDefaults.colors(
                                    thumbColor = RfmColor.Ink,
                                    activeTrackColor = RfmColor.Lime,
                                    inactiveTrackColor = RfmColor.Muted,
                                    activeTickColor = RfmColor.Ink.copy(alpha = 0.25f),
                                    inactiveTickColor = RfmColor.MutedFg.copy(alpha = 0.25f),
                                ),
                            )

                            // whole-dirham quick picks, plus "use everything"
                            val picks = listOf(5L, 10L, 20L, 50L).filter { it in maxOf(minAed, 1L)..maxAed }.take(3)
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                picks.forEach { aed ->
                                    AedChip(
                                        label = "${cfg.currency} $aed",
                                        selected = selectedAed == aed,
                                        modifier = Modifier.weight(1f),
                                    ) { vm.setRedeemExact(rate.pointsForValue(aed * 100)) }
                                }
                                AedChip(
                                    label = "All ${cfg.currency} $maxAed",
                                    selected = selectedAed == maxAed && maxAed > 0,
                                    modifier = Modifier.weight(1f),
                                ) { vm.setRedeemExact(rate.pointsForValue(maxAed * 100)) }
                                if (selectedAed > 0) {
                                    AedChip(label = "Clear", selected = false, modifier = Modifier.weight(1f)) {
                                        vm.setRedeemExact(0)
                                    }
                                }
                            }
                        }
                    }
                }

                // ── reward vouchers the customer brings to the till ──────────
                RfmCard(padding = 14.dp) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Reward voucher", style = MaterialTheme.typography.titleSmall, color = RfmColor.Ink)
                            Text(
                                "Scan or type the code from their app",
                                style = MaterialTheme.typography.labelMedium,
                                color = RfmColor.MutedFg,
                            )
                        }
                        SecondaryAction("Scan", modifier = Modifier.width(110.dp)) { scanningVoucher = true }
                    }
                    if (showVoucherEntry) {
                        Spacer(Modifier.height(10.dp))
                        androidx.compose.material3.OutlinedTextField(
                            value = voucherEntry,
                            onValueChange = { voucherEntry = it.uppercase().filter { c -> c.isLetterOrDigit() } },
                            label = { Text("Voucher code") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                        Spacer(Modifier.height(8.dp))
                        SecondaryAction("Apply voucher", enabled = voucherEntry.isNotBlank() && !state.voucherBusy) {
                            vm.redeemVoucher(voucherEntry)
                            voucherEntry = ""
                            showVoucherEntry = false
                        }
                    } else {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Enter code manually",
                            style = MaterialTheme.typography.labelMedium,
                            color = RfmColor.Sky,
                            modifier = Modifier.clickable { showVoucherEntry = true },
                        )
                    }
                    state.voucherError?.let {
                        Spacer(Modifier.height(6.dp))
                        Text(it, style = MaterialTheme.typography.labelMedium, color = RfmColor.Destructive)
                    }
                }

                if (quote != null && quote.earnPoints > 0) {
                    Text(
                        "Earns +${formatPoints(quote.earnPoints)} pts on this sale",
                        style = MaterialTheme.typography.labelMedium,
                        color = RfmColor.Lime600,
                        modifier = Modifier.fillMaxWidth(),
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

@Composable
private fun AedChip(label: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Surface(
        modifier = modifier.height(52.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(14.dp),
        color = if (selected) RfmColor.Ink else RfmColor.Card,
        border = BorderStroke(1.dp, if (selected) RfmColor.Ink else RfmColor.Border),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                label,
                style = MaterialTheme.typography.titleSmall,
                color = if (selected) Color.White else RfmColor.Ink,
                textAlign = TextAlign.Center,
            )
        }
    }
}
