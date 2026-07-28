package ae.rfmloyaltyco.terminal.ui

import ae.rfmloyaltyco.terminal.TerminalApp
import ae.rfmloyaltyco.terminal.checkout.CheckoutViewModel
import ae.rfmloyaltyco.terminal.data.TxnRecord
import ae.rfmloyaltyco.terminal.receipt.ReceiptData
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
import androidx.compose.material3.OutlinedTextField
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
 * Void a card sale taken on this terminal. SmartPay identifies the original by
 * its voucher number (printed on its slip); we keep it per sale so the cashier
 * usually just taps the row.
 */
@Composable
fun RefundScreen(app: TerminalApp, onBack: () -> Unit) {
    val records by app.history.records.collectAsStateWithLifecycle()
    val cfg = app.settings.snapshot()
    val scope = rememberCoroutineScope()
    var selected by remember { mutableStateOf<TxnRecord?>(null) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var voucherEntry by remember { mutableStateOf("") }
    var slip by remember { mutableStateOf<ReceiptData?>(null) }
    val server = remember { app.settings.cachedServerConfig() }

    val slipToPrint = slip
    if (slipToPrint != null) {
        PrintReceiptOverlay(app = app, data = slipToPrint) { slip = null }
        return
    }

    val voidable = records.filter { it.kind == "sale" && it.status == "approved" && it.paymentMethod == "card" }

    fun runVoid() {
        val original = selected ?: return
        val intentMode = cfg.ecrMode == "intent"
        val reference = (original.voucherNo ?: voucherEntry.trim().ifBlank { null })
            ?: if (intentMode) {
                message = "Enter the voucher number from the original slip to void it."
                return
            } else {
                original.ecrOrderNo
            }
        busy = true
        message = null
        scope.launch {
            val orderNo = CheckoutViewModel.newOrderNo()
            val result = app.ecr().voidPurchase(orderNo, reference)
            busy = false
            if (result.approved) {
                app.history.add(
                    TxnRecord(
                        localId = UUID.randomUUID().toString(),
                        at = System.currentTimeMillis(),
                        kind = "void",
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
                        voucherNo = result.voucherNo,
                    ),
                )
                app.history.update(original.localId) { it.copy(status = "voided") }
                slip = ReceiptData(
                    brandName = server?.brandName?.ifBlank { null } ?: "",
                    branchName = server?.branchName,
                    terminalLabel = server?.terminalLabel ?: cfg.terminalLabel,
                    at = System.currentTimeMillis(),
                    orderNo = orderNo,
                    grossMinor = original.netMinor,
                    discountMinor = 0,
                    netMinor = original.netMinor,
                    currency = cfg.currency,
                    paymentMethod = "card",
                    memberName = original.memberName,
                    earnedPoints = 0,
                    redeemedPoints = 0,
                    balanceAfter = null,
                    pointsCode = server?.pointsCode ?: "PTS",
                    kind = "void",
                )
                selected = null
                voucherEntry = ""
            } else {
                message = result.message
            }
        }
    }

    TerminalScaffold(
        title = "Void",
        subtitle = "Cancel a sale taken on this terminal",
        onBack = onBack,
        bottomBar = {
            val sel = selected
            if (sel != null) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    message?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = RfmColor.Destructive) }
                    if (sel.voucherNo == null && cfg.ecrMode == "intent") {
                        OutlinedTextField(
                            value = voucherEntry,
                            onValueChange = { voucherEntry = it.filter { ch -> ch.isLetterOrDigit() } },
                            label = { Text("Voucher no. from the original slip") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                    }
                    PrimaryAction(
                        "Void ${formatAmountWithCurrency(sel.netMinor, cfg.currency)}",
                        loading = busy,
                        color = RfmColor.Coral,
                        contentColor = RfmColor.Ink,
                    ) { runVoid() }
                }
            } else {
                message?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = RfmColor.Lime900) }
            }
        },
    ) {
        if (voidable.isEmpty()) {
            Spacer(Modifier.height(24.dp))
            Text("No card sales on this terminal yet.", style = MaterialTheme.typography.bodyMedium, color = RfmColor.MutedFg)
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(voidable, key = { it.localId }) { r ->
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
                                r.voucherNo?.let {
                                    Text("Voucher $it", style = MaterialTheme.typography.labelSmall, color = RfmColor.MutedFg)
                                }
                            }
                            Text(r.ecrOrderNo.takeLast(8), style = MaterialTheme.typography.labelSmall, color = RfmColor.MutedFg)
                        }
                    }
                }
            }
        }
    }
}
