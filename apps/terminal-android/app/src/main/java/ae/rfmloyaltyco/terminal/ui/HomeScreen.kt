package ae.rfmloyaltyco.terminal.ui

import ae.rfmloyaltyco.terminal.TerminalApp
import ae.rfmloyaltyco.terminal.theme.PrimaryAction
import ae.rfmloyaltyco.terminal.theme.RfmCard
import ae.rfmloyaltyco.terminal.theme.RfmColor
import ae.rfmloyaltyco.terminal.theme.StatusDot
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.PersonSearch
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
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
    val server = remember { app.settings.cachedServerConfig() }
    var apiOk by remember { mutableStateOf<Boolean?>(null) }
    var ecrOk by remember { mutableStateOf<Boolean?>(null) }

    LaunchedEffect(Unit) {
        if (cfg.paired) apiOk = runCatching { app.api.ping() }.getOrDefault(false)
        ecrOk = if (cfg.ecrMode == "demo") true else runCatching { app.ecr().connect() == null }.getOrDefault(false)
        runCatching { app.outbox.replayAll() }
        runCatching { app.api.fetchConfig() }.onSuccess { app.settings.cacheServerConfig(it.raw) }
    }

    Column(Modifier.fillMaxSize().background(RfmColor.Canvas).padding(20.dp)) {
        Spacer(Modifier.height(18.dp))
        Text(
            "PARTNERS POINTS",
            style = MaterialTheme.typography.labelSmall,
            color = RfmColor.Lime600,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            server?.brandName?.ifBlank { null } ?: cfg.terminalLabel,
            style = MaterialTheme.typography.displayMedium,
            color = RfmColor.Ink,
        )
        Text(
            listOfNotNull(server?.branchName, server?.terminalLabel ?: cfg.terminalLabel.takeIf { server != null })
                .joinToString(" · ")
                .ifBlank { "In-store loyalty terminal" },
            style = MaterialTheme.typography.bodyMedium,
            color = RfmColor.MutedFg,
        )
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            StatusDot(ok = apiOk == true, label = if (apiOk == null) "Loyalty…" else if (apiOk == true) "Loyalty linked" else "Loyalty offline")
            StatusDot(ok = ecrOk == true, label = if (cfg.ecrMode == "demo") "SmartPay (demo)" else if (ecrOk == null) "SmartPay…" else if (ecrOk == true) "SmartPay linked" else "SmartPay offline")
        }

        if (!cfg.paired) {
            Spacer(Modifier.height(18.dp))
            RfmCard {
                Text("Terminal not paired", style = MaterialTheme.typography.titleMedium, color = RfmColor.Ink)
                Spacer(Modifier.height(6.dp))
                Text(
                    "Pair this device with a terminal key from the superadmin console to start earning and redeeming.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = RfmColor.MutedFg,
                )
                Spacer(Modifier.height(14.dp))
                PrimaryAction("Pair terminal") { onPair() }
            }
        }

        Spacer(Modifier.weight(1f))

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            HomeAction(Icons.Filled.PersonSearch, "Check balance", RfmColor.Sky, Modifier.weight(1f), onBalanceCheck)
            HomeAction(Icons.Filled.Replay, "Refund / void", RfmColor.Coral, Modifier.weight(1f), onRefund)
        }
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            HomeAction(Icons.Filled.History, "History", RfmColor.Teal, Modifier.weight(1f), onHistory)
            HomeAction(Icons.Filled.Settings, "Settings", RfmColor.MutedFg, Modifier.weight(1f), onSettings)
        }

        Spacer(Modifier.height(18.dp))
        PrimaryAction("New sale", enabled = cfg.paired || cfg.ecrMode == "demo") { onNewSale() }
        Spacer(Modifier.height(6.dp))
    }
}

@Composable
private fun HomeAction(icon: ImageVector, label: String, tint: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Surface(
        modifier = modifier.height(76.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(20.dp),
        color = RfmColor.Card,
        border = BorderStroke(1.dp, RfmColor.Border.copy(alpha = 0.7f)),
    ) {
        Row(
            Modifier.fillMaxSize().padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(38.dp).background(tint.copy(alpha = 0.16f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.width(10.dp))
            Text(label, style = MaterialTheme.typography.titleSmall, color = RfmColor.Ink)
        }
    }
}
