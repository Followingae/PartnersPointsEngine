package ae.rfmloyaltyco.terminal.ui

import ae.rfmloyaltyco.terminal.TerminalApp
import ae.rfmloyaltyco.terminal.data.SettingsStore
import ae.rfmloyaltyco.terminal.theme.PrimaryAction
import ae.rfmloyaltyco.terminal.theme.RfmCard
import ae.rfmloyaltyco.terminal.theme.RfmColor
import ae.rfmloyaltyco.terminal.theme.SecondaryAction
import ae.rfmloyaltyco.terminal.theme.TerminalScaffold
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Terminal pairing: scan the provisioning QR issued by the superadmin console
 * (JSON: baseUrl, publishableKeyId, secret, label) — or type it in.
 */
@Composable
fun PairingScreen(app: TerminalApp, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var baseUrl by remember { mutableStateOf(app.settings.snapshot().baseUrl.ifBlank { SettingsStore.DEFAULT_BASE_URL }) }
    var pk by remember { mutableStateOf("") }
    var secret by remember { mutableStateOf("") }
    var label by remember { mutableStateOf(app.settings.snapshot().terminalLabel) }
    var scanning by remember { mutableStateOf(false) }
    var testing by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    if (scanning) {
        ScanScreen(
            title = "Scan the provisioning QR",
            onResult = { text ->
                scanning = false
                runCatching {
                    val j = JSONObject(text)
                    baseUrl = j.optString("baseUrl", baseUrl)
                    pk = j.optString("publishableKeyId", j.optString("pk", pk))
                    secret = j.optString("secret", secret)
                    label = j.optString("label", label)
                }.onFailure { message = "That QR isn't a provisioning code" }
            },
            onCancel = { scanning = false },
        )
        return
    }

    TerminalScaffold(
        title = "Pair terminal",
        subtitle = "Superadmin console → Merchants → Terminals → Issue key",
        onBack = onDone,
        bottomBar = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                message?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = if (it.startsWith("Paired")) RfmColor.Lime900 else RfmColor.Destructive)
                }
                PrimaryAction("Save & test connection", enabled = pk.isNotBlank() && secret.isNotBlank(), loading = testing) {
                    app.settings.savePairing(baseUrl.trim(), pk.trim(), secret.trim(), label.trim().ifBlank { "Terminal" })
                    testing = true
                    message = null
                    scope.launch {
                        val ok = runCatching { app.api.ping() }.getOrDefault(false)
                        testing = false
                        message = if (ok) "Paired — loyalty service reachable" else "Saved, but the loyalty service can't be reached (check network / key)"
                        if (ok) onDone()
                    }
                }
            }
        },
    ) {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            RfmCard {
                SecondaryAction("Scan provisioning QR") { scanning = true }
                Spacer(Modifier.height(10.dp))
                Text("…or enter the key manually", style = MaterialTheme.typography.labelMedium, color = RfmColor.MutedFg)
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(value = baseUrl, onValueChange = { baseUrl = it }, label = { Text("API base URL") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = pk, onValueChange = { pk = it }, label = { Text("Publishable key (pk_…)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = secret, onValueChange = { secret = it }, label = { Text("Secret (sk_…)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = label, onValueChange = { label = it }, label = { Text("Terminal label (e.g. JLT · Lane 1)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            }
            Text(
                "The secret is stored encrypted with this device's hardware keystore and never leaves the terminal.",
                style = MaterialTheme.typography.labelMedium,
                color = RfmColor.MutedFg,
            )
        }
    }
}
