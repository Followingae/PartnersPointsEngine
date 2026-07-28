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
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * Order review: earn preview, one-tap redemption, tender selection. Redemption
 * pricing comes from the engine's brand-level valuation (synced at startup),
 * so every terminal and the customer app quote identical numbers.
 */
@Composable
fun RewardsScreen(vm: CheckoutViewModel, onBack: () -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    val cfg = vm.config
    val rate = state.rate
    val member = state.member
    val net = state.netMinor()
    val redeemValue = state.redeemValueMinor()

    TerminalScaffold(
        title = "Charge",
        subtitle = member?.context?.displayName?.let { "Member: $it" } ?: "No loyalty on this sale",
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
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            RfmCard {
                Text("Total", style = MaterialTheme.typography.labelMedium, color = RfmColor.MutedFg)
                Text(
                    formatAmountWithCurrency(state.amountMinor, cfg.currency),
                    style = MaterialTheme.typography.displayMedium,
                    color = RfmColor.Ink,
                )
                if (redeemValue > 0) {
                    Spacer(Modifier.height(8.dp))
                    Row {
                        Text("Points discount", style = MaterialTheme.typography.bodyMedium, color = RfmColor.MutedFg, modifier = Modifier.weight(1f))
                        Text("− ${formatAmountWithCurrency(redeemValue, cfg.currency)}", style = MaterialTheme.typography.titleMedium, color = RfmColor.Blush)
                    }
                    Row {
                        Text("To pay", style = MaterialTheme.typography.bodyMedium, color = RfmColor.MutedFg, modifier = Modifier.weight(1f))
                        Text(formatAmountWithCurrency(net, cfg.currency), style = MaterialTheme.typography.titleLarge, color = RfmColor.Ink)
                    }
                }
            }

            if (member != null) {
                val quote = state.quote
                if (quote != null && quote.earnPoints > 0) {
                    RfmCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Earns this sale", style = MaterialTheme.typography.labelMedium, color = RfmColor.MutedFg)
                                Text(
                                    "+${formatPoints(quote.earnPoints)} pts",
                                    style = MaterialTheme.typography.headlineMedium,
                                    color = RfmColor.Lime600,
                                )
                            }
                            if (quote.earnMultiplier > 1.0) {
                                Text("×${quote.earnMultiplier}", style = MaterialTheme.typography.titleMedium, color = RfmColor.TealDeep)
                            }
                        }
                    }
                }

                val available = member.context?.availablePoints ?: 0L
                if (rate.enabled && available >= maxOf(rate.minRedeemPoints, 1L) && rate.rateValueMinor > 0) {
                    Text("Redeem points", style = MaterialTheme.typography.titleMedium, color = RfmColor.Ink)

                    val capValueMinor = state.amountMinor * rate.maxPercentOfBillBps / 10000
                    val capPointsByBill = capValueMinor * rate.ratePoints / rate.rateValueMinor
                    val maxRedeemable = minOf(available, capPointsByBill)
                    val presets = rate.presetsPoints.filter {
                        it in rate.minRedeemPoints..maxRedeemable && rate.valueMinor(it, state.amountMinor) > 0
                    }

                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        presets.take(3).forEach { p ->
                            RedeemChip(
                                points = p,
                                valueMinor = rate.valueMinor(p, state.amountMinor),
                                currency = cfg.currency,
                                selected = state.redeemPoints == p,
                                modifier = Modifier.weight(1f),
                            ) { vm.selectRedeem(p) }
                        }
                    }
                    if (maxRedeemable >= rate.minRedeemPoints && maxRedeemable > 0) {
                        RedeemChip(
                            points = maxRedeemable,
                            valueMinor = rate.valueMinor(maxRedeemable, state.amountMinor),
                            currency = cfg.currency,
                            selected = state.redeemPoints == maxRedeemable && presets.none { it == maxRedeemable },
                            label = "Max",
                            modifier = Modifier.fillMaxWidth(),
                        ) { vm.selectRedeem(maxRedeemable) }
                    }
                    Text(
                        "Balance ${formatPoints(available)} pts · ${formatPoints(rate.ratePoints)} pts = ${cfg.currency} ${formatAmount(rate.rateValueMinor)}" +
                            if (rate.maxPercentOfBillBps < 10000) " · up to ${rate.maxPercentOfBillBps / 100}% of the bill" else "",
                        style = MaterialTheme.typography.labelMedium,
                        color = RfmColor.MutedFg,
                    )
                } else if (member.context != null && !rate.enabled) {
                    Text(
                        "Point redemption is disabled for this brand.",
                        style = MaterialTheme.typography.labelMedium,
                        color = RfmColor.MutedFg,
                    )
                }
            }
        }
    }
}

@Composable
private fun RedeemChip(
    points: Long,
    valueMinor: Long,
    currency: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    label: String? = null,
    onClick: () -> Unit,
) {
    Surface(
        modifier = modifier.height(72.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = if (selected) RfmColor.Ink else RfmColor.Card,
        border = BorderStroke(1.dp, if (selected) RfmColor.Ink else RfmColor.Border),
    ) {
        Column(
            Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                (label?.plus(" · ") ?: "") + "− $currency ${formatAmount(valueMinor)}",
                style = MaterialTheme.typography.titleSmall,
                color = if (selected) RfmColor.Lime else RfmColor.Ink,
            )
            Text(
                "${formatPoints(points)} pts",
                style = MaterialTheme.typography.labelMedium,
                color = if (selected) androidx.compose.ui.graphics.Color.White.copy(alpha = 0.7f) else RfmColor.MutedFg,
            )
        }
    }
}
