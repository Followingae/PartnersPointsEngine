package ae.rfmloyaltyco.terminal.ui

import ae.rfmloyaltyco.terminal.TerminalApp
import ae.rfmloyaltyco.terminal.checkout.CheckoutViewModel
import ae.rfmloyaltyco.terminal.theme.PrimaryAction
import ae.rfmloyaltyco.terminal.theme.RfmCard
import ae.rfmloyaltyco.terminal.theme.RfmColor
import ae.rfmloyaltyco.terminal.theme.SecondaryAction
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay

@Composable
fun ResultScreen(vm: CheckoutViewModel, app: TerminalApp, onDone: (Boolean) -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    val outcome = state.outcome ?: return
    var printing by remember { mutableStateOf(false) }
    var autoPrinted by remember(outcome) { mutableStateOf(false) }

    // Auto-print: the receipt slides off-screen into the printer the moment the sale lands.
    LaunchedEffect(outcome) {
        if (outcome.success && outcome.receipt != null && app.settings.snapshot().autoPrint && !autoPrinted) {
            autoPrinted = true
            printing = true
        }
    }

    if (printing && outcome.receipt != null) {
        PrintReceiptOverlay(app = app, data = outcome.receipt) { printing = false }
        return
    }

    if (outcome.success) {
        LaunchedEffect(outcome, printing) {
            delay(8000)
            if (!printing) onDone(true)
        }
    }

    Column(
        Modifier.fillMaxSize().background(RfmColor.Canvas).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(48.dp))
        Box(
            Modifier.size(96.dp).background(if (outcome.success) RfmColor.Lime else RfmColor.Coral, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (outcome.success) Icons.Filled.Check else Icons.Filled.Close,
                contentDescription = null,
                tint = RfmColor.Ink,
                modifier = Modifier.size(48.dp),
            )
        }
        Spacer(Modifier.height(20.dp))
        Text(
            if (outcome.success) "Payment approved" else "Not completed",
            style = MaterialTheme.typography.headlineMedium,
            color = RfmColor.Ink,
        )
        Text(
            outcome.message,
            style = MaterialTheme.typography.bodyMedium,
            color = RfmColor.MutedFg,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))

        if (outcome.success && (outcome.earnedPoints > 0 || outcome.redeemedPoints > 0)) {
            RfmCard {
                if (outcome.earnedPoints > 0) {
                    Row {
                        Text("Points earned", style = MaterialTheme.typography.bodyLarge, color = RfmColor.MutedFg, modifier = Modifier.weight(1f))
                        Text("+${formatPoints(outcome.earnedPoints)}", style = MaterialTheme.typography.headlineSmall, color = RfmColor.Lime600)
                    }
                }
                if (outcome.redeemedPoints > 0) {
                    Spacer(Modifier.height(8.dp))
                    Row {
                        Text("Points redeemed", style = MaterialTheme.typography.bodyLarge, color = RfmColor.MutedFg, modifier = Modifier.weight(1f))
                        Text("−${formatPoints(outcome.redeemedPoints)}", style = MaterialTheme.typography.headlineSmall, color = RfmColor.Blush)
                    }
                }
                outcome.balanceAfter?.let { bal ->
                    Spacer(Modifier.height(8.dp))
                    Row {
                        Text("New balance", style = MaterialTheme.typography.bodyLarge, color = RfmColor.MutedFg, modifier = Modifier.weight(1f))
                        Text("${formatPoints(bal)} pts", style = MaterialTheme.typography.headlineSmall, color = RfmColor.Ink)
                    }
                }
            }
        }

        outcome.ecr?.let { ecr ->
            Spacer(Modifier.height(12.dp))
            Text(
                listOfNotNull(ecr.maskedPan, ecr.authNo?.let { "Auth $it" }, "Order ${ecr.orderNo}").joinToString("  ·  "),
                style = MaterialTheme.typography.labelSmall,
                color = RfmColor.MutedFg,
            )
        }
        outcome.loyaltyNote?.let { note ->
            Spacer(Modifier.height(10.dp))
            Text(note, style = MaterialTheme.typography.labelMedium, color = RfmColor.TealDeep, textAlign = TextAlign.Center)
        }

        Spacer(Modifier.weight(1f))
        if (outcome.success && outcome.receipt != null) {
            SecondaryAction(if (autoPrinted) "Print again" else "Print receipt") { printing = true }
            Spacer(Modifier.height(10.dp))
        }
        PrimaryAction(if (outcome.success) "Done" else "Back to sale") { onDone(outcome.success) }
    }
}
