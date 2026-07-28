package ae.rfmloyaltyco.terminal.ui

import ae.rfmloyaltyco.terminal.checkout.CheckoutViewModel
import ae.rfmloyaltyco.terminal.theme.RfmColor
import ae.rfmloyaltyco.terminal.theme.SecondaryAction
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun PayingScreen(vm: CheckoutViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    Column(
        Modifier.fillMaxSize().background(RfmColor.Ink).padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator(Modifier.size(56.dp), color = RfmColor.Lime, strokeWidth = 4.dp)
        Spacer(Modifier.height(28.dp))
        Text(
            state.payingMessage.ifBlank { "Processing…" },
            style = MaterialTheme.typography.headlineSmall,
            color = androidx.compose.ui.graphics.Color.White,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(48.dp))
        SecondaryAction("Cancel payment") { vm.cancelPayment() }
    }
}
