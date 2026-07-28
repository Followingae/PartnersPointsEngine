package ae.rfmloyaltyco.terminal.ui

import ae.rfmloyaltyco.terminal.TerminalApp
import ae.rfmloyaltyco.terminal.theme.Keypad
import ae.rfmloyaltyco.terminal.theme.PrimaryAction
import ae.rfmloyaltyco.terminal.theme.RfmCard
import ae.rfmloyaltyco.terminal.theme.RfmColor
import ae.rfmloyaltyco.terminal.theme.SecondaryAction
import ae.rfmloyaltyco.terminal.theme.TerminalScaffold
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

/** PIN-gated operational settings (cashiers stay out). */
@Composable
fun SettingsScreen(app: TerminalApp, onBack: () -> Unit, onRepair: () -> Unit) {
    val cfg = remember { app.settings.snapshot() }
    var unlocked by remember { mutableStateOf(false) }
    var pinEntry by remember { mutableStateOf("") }

    if (!unlocked) {
        TerminalScaffold(title = "Settings", subtitle = "Enter admin PIN", onBack = onBack) {
            Spacer(Modifier.height(12.dp))
            Text(
                "•".repeat(pinEntry.length).padEnd(4, '◦'),
                style = MaterialTheme.typography.displayMedium,
                color = RfmColor.Ink,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(20.dp))
            Keypad(
                onDigit = {
                    if (pinEntry.length < 8) pinEntry += it
                    if (pinEntry == cfg.adminPin) unlocked = true
                },
                onBackspace = { pinEntry = pinEntry.dropLast(1) },
            )
        }
        return
    }

    var ecrMode by remember { mutableStateOf(cfg.ecrMode) }
    var ecrDevice by remember { mutableStateOf(cfg.ecrDevice) }
    var earnOnNet by remember { mutableStateOf(cfg.earnOnNet) }
    var autoPrint by remember { mutableStateOf(cfg.autoPrint) }
    var pin by remember { mutableStateOf(cfg.adminPin) }
    var saved by remember { mutableStateOf(false) }
    var testPrint by remember { mutableStateOf(false) }
    val serverCfg = remember { app.settings.cachedServerConfig() }

    if (testPrint) {
        PrintReceiptOverlay(
            app = app,
            data = ae.rfmloyaltyco.terminal.receipt.ReceiptData(
                brandName = serverCfg?.brandName?.ifBlank { null } ?: "",
                branchName = serverCfg?.branchName,
                terminalLabel = serverCfg?.terminalLabel ?: cfg.terminalLabel,
                at = System.currentTimeMillis(),
                orderNo = "TESTPRINT" + (System.currentTimeMillis() / 1000),
                grossMinor = 12550,
                discountMinor = 500,
                netMinor = 12050,
                currency = cfg.currency,
                paymentMethod = "card",
                memberName = "Test print",
                earnedPoints = 120,
                redeemedPoints = 500,
                balanceAfter = 2480,
                pointsCode = serverCfg?.pointsCode ?: "PTS",
                stamps = listOf(ae.rfmloyaltyco.terminal.receipt.ReceiptStamp("Coffee card", 7, 9)),
            ),
        ) { testPrint = false }
        return
    }

    TerminalScaffold(
        title = "Settings",
        subtitle = cfg.terminalLabel,
        onBack = onBack,
        bottomBar = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (saved) Text("Saved.", style = MaterialTheme.typography.labelMedium, color = RfmColor.Lime900)
                PrimaryAction("Save settings") {
                    app.settings.saveOperational(
                        ecrMode = ecrMode,
                        ecrDevice = ecrDevice,
                        earnOnNet = earnOnNet,
                        autoPrint = autoPrint,
                        adminPin = pin.ifBlank { "4321" },
                    )
                    saved = true
                }
            }
        },
    ) {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            RfmCard {
                Text("SmartPay link (ECR)", style = MaterialTheme.typography.titleMedium, color = RfmColor.Ink)
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("intent" to "SmartPay", "demo" to "Demo").forEach { (value, label) ->
                        SecondaryAction(
                            label = if (ecrMode == value) "● $label" else label,
                            modifier = Modifier.weight(1f),
                        ) { ecrMode = value }
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("socket" to "Socket", "serial_usb" to "USB", "bt4" to "Bluetooth").forEach { (value, label) ->
                        SecondaryAction(
                            label = if (ecrMode == value) "● $label" else label,
                            modifier = Modifier.weight(1f),
                        ) { ecrMode = value }
                    }
                }
                if (ecrMode !in listOf("intent", "demo")) {
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = ecrDevice,
                        onValueChange = { ecrDevice = it },
                        label = { Text("Device (socket IP:port / BT name)") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    when (ecrMode) {
                        "intent" -> "All-in-one terminal: SmartPay opens directly on this device for each sale. No cables, no ECR settings."
                        "demo" -> "Simulated approvals for training — no real payment is taken."
                        else -> "Separate payment terminal over the ECR SDK (socket / USB / Bluetooth)."
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = RfmColor.MutedFg,
                )
                if (ecrMode == "intent") {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        if (ae.rfmloyaltyco.terminal.ecr.SmartPayIntentBridge.isInstalled(app))
                            "✓ SmartPay detected on this terminal"
                        else
                            "⚠ SmartPay app not detected — payments will fail until it's installed",
                        style = MaterialTheme.typography.labelMedium,
                        color = if (ae.rfmloyaltyco.terminal.ecr.SmartPayIntentBridge.isInstalled(app)) RfmColor.Lime600 else RfmColor.Destructive,
                    )
                }
            }

            RfmCard {
                Text("Loyalty behaviour", style = MaterialTheme.typography.titleMedium, color = RfmColor.Ink)
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Earn on discounted amount", style = MaterialTheme.typography.bodyMedium, color = RfmColor.Ink)
                        Text("Off = earn on the gross bill", style = MaterialTheme.typography.labelMedium, color = RfmColor.MutedFg)
                    }
                    Switch(
                        checked = earnOnNet,
                        onCheckedChange = { earnOnNet = it },
                        colors = SwitchDefaults.colors(checkedTrackColor = RfmColor.Lime600),
                    )
                }
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Auto-print receipt", style = MaterialTheme.typography.bodyMedium, color = RfmColor.Ink)
                        Text("Prints as soon as payment is approved", style = MaterialTheme.typography.labelMedium, color = RfmColor.MutedFg)
                    }
                    Switch(
                        checked = autoPrint,
                        onCheckedChange = { autoPrint = it },
                        colors = SwitchDefaults.colors(checkedTrackColor = RfmColor.Lime600),
                    )
                }
                Spacer(Modifier.height(10.dp))
                SecondaryAction("Test print receipt") { testPrint = true }
                Spacer(Modifier.height(10.dp))
                Text(
                    serverCfg?.let { s ->
                        "Redemption valuation (from console): ${s.redemption.ratePoints} pts = ${s.currency} " +
                            "%,d.%02d".format(s.redemption.rateValueMinor / 100, s.redemption.rateValueMinor % 100) +
                            (if (s.redemption.enabled) "" else " · disabled")
                    } ?: "Redemption valuation syncs from the brand console after pairing.",
                    style = MaterialTheme.typography.labelMedium,
                    color = RfmColor.MutedFg,
                )
            }

            RfmCard {
                Text("Security", style = MaterialTheme.typography.titleMedium, color = RfmColor.Ink)
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = pin,
                    onValueChange = { pin = it.filter { c -> c.isDigit() }.take(8) },
                    label = { Text("Admin PIN") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Spacer(Modifier.height(12.dp))
                SecondaryAction("Re-pair terminal (new key)") { onRepair() }
            }

            RfmCard {
                Text("About", style = MaterialTheme.typography.titleMedium, color = RfmColor.Ink)
                Spacer(Modifier.height(6.dp))
                Text("API: ${cfg.baseUrl}", style = MaterialTheme.typography.labelSmall, color = RfmColor.MutedFg)
                Text("Key: ${cfg.publishableKeyId.ifBlank { "not paired" }}", style = MaterialTheme.typography.labelSmall, color = RfmColor.MutedFg)
            }
        }
    }
}
