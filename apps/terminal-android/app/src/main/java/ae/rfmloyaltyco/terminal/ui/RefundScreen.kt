package ae.rfmloyaltyco.terminal.ui

import ae.rfmloyaltyco.terminal.TerminalApp
import ae.rfmloyaltyco.terminal.checkout.CheckoutViewModel
import ae.rfmloyaltyco.terminal.data.TxnRecord
import ae.rfmloyaltyco.terminal.theme.PrimaryAction
import ae.rfmloyaltyco.terminal.theme.RfmCard
import ae.rfmloyaltyco.terminal.theme.RfmColor
import ae.rfmloyaltyco.terminal.theme.TerminalScaffold
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.util.UUID
import kotlinx.coroutines.launch

/**
 * Refund / void against a prior card sale, selected from the local journal — the
 * cashier never re-types order numbers. Same-day sales use void, older use refund
 * (acquirer rules); we expose both and default sensibly.
 */
@Composable
fun RefundScreen(app: TerminalApp, onBack: () -> Unit) {
    val records by app.history.records.collectAsStateWithLifecycle()
    val cfg = app.settings.snapshot()
    val scope = rememberCoroutineScope()
    var selected by remember { mutableStateOf<TxnRecord?>(null) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    val refundable = records.filter { it.kind == "sale" && it.status == "approved" && it.paymentMethod == "card" }

    fun run(kind: String) {
        val original = selected ?: return
        busy = true
        message = null
        scope.launch {
            val orderNo = CheckoutViewModel.newOrderNo()
            // SmartPay identifies the original by its voucher number; the ECR SDK
            // path uses our order number.
            val reference = original.voucherNo ?: original.ecrOrderNo
            val result = if (kind == "void") {
                app.ecr().voidPurchase(orderNo, reference)
            } else {
                app.ecr().refund(original.netMinor, orderNo, reference)
            }
            busy = false
            if (result.approved) {
                app.history.add(
                    TxnRecord(
                        localId = UUID.randomUUID().toString(),
                        at = System.currentTimeMillis(),
                        kind = kind,
                        grossMinor = original.netMinor,
                        netMinor = original.netMinor,
                        redeemPoints = 0,
                        earnPoints = 0,
                        memberName = original.memberName,
                        memberPhone = original.memberPhone,
                        ecrOrderNo = orderNo,
                        originalOrderNo = original.ecrOrderNo,
                        paymentMethod = "card",
                        status = "approved",
                        note = "Loyalty points not clawed back automatically — adjust in the console if needed",
                    ),
                )
                app.history.update(original.localId) { it.copy(status = if (kind == "void") "voided" else "refunded") }
                message = if (kind == "void") "Void approved" else "Refund approved"
                selected = null
            } else {
                message = result.message
            }
        }
    }

    TerminalScaffold(
        title = "Refund / void",
        subtitle = "Pick the original sale",
        onBack = onBack,
        bottomBar = {
            val sel = selected
            if (sel != null) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    message?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = RfmColor.Destructive) }
                    PrimaryAction("Refund ${formatAmountWithCurrency(sel.netMinor, cfg.currency)}", loading = busy) { run("refund") }
                    PrimaryAction("Void (same day)", color = RfmColor.Muted, contentColor = RfmColor.Ink, loading = busy) { run("void") }
                }
            } else {
                message?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = RfmColor.Lime900) }
            }
        },
    ) {
        if (refundable.isEmpty()) {
            Spacer(Modifier.height(24.dp))
            Text("No refundable card sales on this terminal yet.", style = MaterialTheme.typography.bodyMedium, color = RfmColor.MutedFg)
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(refundable, key = { it.localId }) { r ->
                    RfmCard(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { selected = if (selected?.localId == r.localId) null else r },
                        padding = 16.dp,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    formatAmountWithCurrency(r.netMinor, cfg.currency),
                                    style = MaterialTheme.typography.titleMedium,
                                    color = if (selected?.localId == r.localId) RfmColor.Lime600 else RfmColor.Ink,
                                )
                                Text(
                                    listOfNotNull(formatTime(r.at), r.memberName, r.maskedPan).joinToString(" · "),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = RfmColor.MutedFg,
                                )
                            }
                            Text(r.ecrOrderNo.takeLast(8), style = MaterialTheme.typography.labelSmall, color = RfmColor.MutedFg)
                        }
                    }
                }
            }
        }
    }
}
