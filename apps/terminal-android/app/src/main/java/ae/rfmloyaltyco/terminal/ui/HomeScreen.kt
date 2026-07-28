package ae.rfmloyaltyco.terminal.ui

import ae.rfmloyaltyco.terminal.TerminalApp
import ae.rfmloyaltyco.terminal.theme.HomeTile
import ae.rfmloyaltyco.terminal.theme.PrimaryAction
import ae.rfmloyaltyco.terminal.theme.RfmCard
import ae.rfmloyaltyco.terminal.theme.RfmColor
import ae.rfmloyaltyco.terminal.theme.StatusDot
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.PersonSearch
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Settings
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
import androidx.compose.ui.unit.dp

@Composable
fun HomeScreen(
    app: TerminalApp,
    onNewSale: () -> Unit,
    onBalanceCheck: () -> Unit,
    onRefund: () -> Unit,
    onHistory: () -> Unit,
    onSettings: () -> Unit,
    onPair: () -> Unit,
) {
    val cfg = app.settings.snapshot()
    var apiOk by remember { mutableStateOf<Boolean?>(null) }
    var ecrOk by remember { mutableStateOf<Boolean?>(null) }

    LaunchedEffect(Unit) {
        if (cfg.paired) apiOk = runCatching { app.api.ping() }.getOrDefault(false)
        ecrOk = if (cfg.ecrMode == "demo") true else runCatching { app.ecr().connect() == null }.getOrDefault(false)
        runCatching { app.outbox.replayAll() }
    }

    Column(
        Modifier.fillMaxSize().background(RfmColor.Canvas).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Partners Points", style = MaterialTheme.typography.headlineMedium, color = RfmColor.Ink)
                Text(cfg.terminalLabel, style = MaterialTheme.typography.bodyMedium, color = RfmColor.MutedFg)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            StatusDot(ok = apiOk == true, label = if (apiOk == null) "Loyalty…" else if (apiOk == true) "Loyalty linked" else "Loyalty offline")
            StatusDot(ok = ecrOk == true, label = if (cfg.ecrMode == "demo") "SmartPay (demo)" else if (ecrOk == null) "SmartPay…" else if (ecrOk == true) "SmartPay linked" else "SmartPay offline")
        }

        if (!cfg.paired) {
            RfmCard {
                Text("Terminal not paired", style = MaterialTheme.typography.titleMedium, color = RfmColor.Ink)
                Spacer(Modifier.height(6.dp))
                Text(
                    "Pair this device with a terminal key from the superadmin console to start earning and redeeming.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = RfmColor.MutedFg,
                )
                Spacer(Modifier.height(14.dp))
                PrimaryAction("Pair terminal", color = RfmColor.Lime, contentColor = RfmColor.Ink) { onPair() }
            }
        }

        Spacer(Modifier.weight(1f))

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            HomeTile(Icons.Filled.PersonSearch, "Check balance", Modifier.weight(1f), tint = RfmColor.Sky, onClick = onBalanceCheck)
            HomeTile(Icons.Filled.Replay, "Refund / void", Modifier.weight(1f), tint = RfmColor.Coral, onClick = onRefund)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            HomeTile(Icons.Filled.History, "History", Modifier.weight(1f), tint = RfmColor.TealDeep, onClick = onHistory)
            HomeTile(Icons.Filled.Settings, "Settings", Modifier.weight(1f), tint = RfmColor.MutedFg, onClick = onSettings)
        }

        PrimaryAction("New sale", enabled = cfg.paired || cfg.ecrMode == "demo") { onNewSale() }
        Spacer(Modifier.height(4.dp))
    }
}
