package ae.rfmloyaltyco.terminal.ui

import ae.rfmloyaltyco.terminal.TerminalApp
import ae.rfmloyaltyco.terminal.data.TxnRecord
import ae.rfmloyaltyco.terminal.receipt.ReceiptData
import ae.rfmloyaltyco.terminal.theme.Chip
import ae.rfmloyaltyco.terminal.theme.RfmCard
import ae.rfmloyaltyco.terminal.theme.RfmColor
import ae.rfmloyaltyco.terminal.theme.TerminalScaffold
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Print
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun HistoryScreen(app: TerminalApp, onBack: () -> Unit) {
    val records by app.history.records.collectAsStateWithLifecycle()
    val outbox by app.outbox.pending.collectAsStateWithLifecycle()
    val cfg = app.settings.snapshot()
    var reprint by remember { mutableStateOf<ReceiptData?>(null) }

    val reprintData = reprint
    if (reprintData != null) {
        PrintReceiptOverlay(app = app, data = reprintData) { reprint = null }
        return
    }

    TerminalScaffold(title = "History", subtitle = "${records.size} transactions on this terminal", onBack = onBack) {
        if (outbox.isNotEmpty()) {
            RfmCard(padding = 14.dp) {
                Text(
                    "${outbox.size} loyalty update(s) queued — will sync automatically",
                    style = MaterialTheme.typography.labelMedium,
                    color = RfmColor.TealDeep,
                )
            }
            Spacer(Modifier.height(10.dp))
        }
        if (records.isEmpty()) {
            Spacer(Modifier.height(24.dp))
            Text("Nothing yet — take the first sale.", style = MaterialTheme.typography.bodyMedium, color = RfmColor.MutedFg)
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(records, key = { it.localId }) { r ->
                    RfmCard(padding = 16.dp) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        formatAmountWithCurrency(r.netMinor, cfg.currency),
                                        style = MaterialTheme.typography.titleMedium,
                                        color = RfmColor.Ink,
                                    )
                                    Spacer(Modifier.width(8.dp))
                                    StatusChip(r.kind, r.status)
                                }
                                Text(
                                    listOfNotNull(formatTime(r.at), r.memberName ?: "No loyalty", r.paymentMethod).joinToString(" · "),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = RfmColor.MutedFg,
                                )
                                if (r.earnPoints > 0 || r.redeemPoints > 0) {
                                    Text(
                                        listOfNotNull(
                                            r.earnPoints.takeIf { it > 0 }?.let { "+${formatPoints(it)} pts" },
                                            r.redeemPoints.takeIf { it > 0 }?.let { "−${formatPoints(it)} pts" },
                                        ).joinToString("  "),
                                        style = MaterialTheme.typography.labelMedium,
                                        color = RfmColor.Lime600,
                                    )
                                }
                                r.note?.let {
                                    Text(it, style = MaterialTheme.typography.labelMedium, color = RfmColor.TealDeep)
                                }
                            }
                            Text(r.ecrOrderNo.takeLast(8), style = MaterialTheme.typography.labelSmall, color = RfmColor.MutedFg)
                            IconButton(onClick = { reprint = receiptFromRecord(app, r, cfg.currency, cfg.terminalLabel) }, modifier = Modifier.size(40.dp)) {
                                Icon(Icons.Filled.Print, contentDescription = "Reprint", tint = RfmColor.MutedFg)
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun receiptFromRecord(app: TerminalApp, r: TxnRecord, currency: String, terminalLabel: String): ReceiptData {
    val server = app.settings.cachedServerConfig()
    return ReceiptData(
        brandName = server?.brandName?.ifBlank { null } ?: "Partners Points",
        branchName = server?.branchName,
        terminalLabel = server?.terminalLabel ?: terminalLabel,
        at = r.at,
        orderNo = r.ecrOrderNo,
        grossMinor = r.grossMinor,
        discountMinor = (r.grossMinor - r.netMinor).coerceAtLeast(0),
        netMinor = r.netMinor,
        currency = currency,
        paymentMethod = r.paymentMethod,
        maskedPan = r.maskedPan,
        authNo = r.authNo,
        memberName = r.memberName,
        earnedPoints = r.earnPoints,
        redeemedPoints = r.redeemPoints,
        balanceAfter = null, // historical balance is not stored; omit rather than misstate
        pointsCode = server?.pointsCode ?: "PTS",
        kind = r.kind,
    )
}

@Composable
private fun StatusChip(kind: String, status: String) {
    val (bg, fg, label) = when {
        status == "approved" && kind == "sale" -> Triple(RfmColor.Lime200, RfmColor.Lime900, "Paid")
        kind == "refund" -> Triple(RfmColor.Coral.copy(alpha = 0.2f), RfmColor.Destructive, "Refund")
        kind == "void" || status == "voided" -> Triple(RfmColor.Muted, RfmColor.MutedFg, "Void")
        status == "refunded" -> Triple(RfmColor.Muted, RfmColor.MutedFg, "Refunded")
        status == "declined" -> Triple(RfmColor.Coral.copy(alpha = 0.2f), RfmColor.Destructive, "Declined")
        status == "cancelled" -> Triple(RfmColor.Muted, RfmColor.MutedFg, "Cancelled")
        else -> Triple(RfmColor.Muted, RfmColor.MutedFg, status)
    }
    Chip(label, bg = bg, fg = fg)
}
