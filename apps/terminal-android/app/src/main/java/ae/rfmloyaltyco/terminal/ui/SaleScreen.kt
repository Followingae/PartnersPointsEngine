package ae.rfmloyaltyco.terminal.ui

import ae.rfmloyaltyco.terminal.checkout.CheckoutViewModel
import ae.rfmloyaltyco.terminal.theme.Keypad
import ae.rfmloyaltyco.terminal.theme.PrimaryAction
import ae.rfmloyaltyco.terminal.theme.RfmColor
import ae.rfmloyaltyco.terminal.theme.TerminalScaffold
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun SaleScreen(vm: CheckoutViewModel, onBack: () -> Unit, onNext: () -> Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    val cfg = vm.config

    TerminalScaffold(
        title = "New sale",
        subtitle = "Enter the bill amount",
        onBack = onBack,
        bottomBar = {
            PrimaryAction("Continue", enabled = state.amountMinor > 0) { onNext() }
        },
    ) {
        Spacer(Modifier.weight(0.6f))
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(cfg.currency, style = MaterialTheme.typography.titleMedium, color = RfmColor.MutedFg)
                Text(
                    formatAmount(state.amountMinor),
                    style = MaterialTheme.typography.displayLarge,
                    color = RfmColor.Ink,
                )
            }
        }
        Spacer(Modifier.weight(1f))
        Keypad(
            onDigit = vm::onAmountDigit,
            onBackspace = vm::onAmountBackspace,
            leftKey = "00",
            onLeftKey = { vm.onAmountDigit('0'); vm.onAmountDigit('0') },
        )
        Spacer(Modifier.height(8.dp))
    }
}
