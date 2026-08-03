package ae.rfmloyaltyco.terminal.ui

import ae.rfmloyaltyco.terminal.CustomerScreen_Mode_BALANCE
import ae.rfmloyaltyco.terminal.api.MemberChallenge
import ae.rfmloyaltyco.terminal.checkout.CheckoutViewModel
import ae.rfmloyaltyco.terminal.theme.Chip
import ae.rfmloyaltyco.terminal.theme.Keypad
import ae.rfmloyaltyco.terminal.theme.PrimaryAction
import ae.rfmloyaltyco.terminal.theme.RfmCard
import ae.rfmloyaltyco.terminal.theme.RfmColor
import ae.rfmloyaltyco.terminal.theme.SecondaryAction
import ae.rfmloyaltyco.terminal.theme.TerminalScaffold
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * Customer recognition — phone keypad first (fastest for cashiers), QR scan as
 * the alternative, skip always visible. In balance mode it's a standalone
 * balance-check surface.
 */
@Composable
fun CustomerScreen(
    vm: CheckoutViewModel,
    mode: String,
    onBack: () -> Unit,
    onProceed: () -> Unit,
    onSkip: () -> Unit,
) {
    val state by vm.state.collectAsStateWithLifecycle()
    var phone by remember { mutableStateOf("") }
    var newName by remember { mutableStateOf("") }
    var scanning by remember { mutableStateOf(false) }
    val balanceMode = mode == CustomerScreen_Mode_BALANCE

    if (scanning) {
        ScanScreen(
            title = "Scan member QR",
            onResult = { value ->
                scanning = false
                vm.lookup("qr", value)
            },
            onCancel = { scanning = false },
        )
        return
    }

    TerminalScaffold(
        title = if (balanceMode) "Check balance" else "Customer",
        subtitle = if (balanceMode) "Find a member" else "Add loyalty to this sale",
        onBack = onBack,
        bottomBar = {
            Column {
                if (state.member != null && !balanceMode) {
                    PrimaryAction("Continue") { onProceed() }
                } else if (!balanceMode) {
                    val digits = phone.length
                    PrimaryAction(
                        if (digits > 0) "Find member" else "Skip loyalty",
                        loading = state.lookupBusy,
                        color = if (digits > 0) RfmColor.Ink else RfmColor.Muted,
                        contentColor = if (digits > 0) androidx.compose.ui.graphics.Color.White else RfmColor.Ink,
                    ) {
                        if (digits > 0) vm.lookup("phone", phone) else onSkip()
                    }
                } else {
                    PrimaryAction("Find member", enabled = phone.isNotEmpty(), loading = state.lookupBusy) {
                        vm.lookup("phone", phone)
                    }
                }
            }
        },
    ) {
        val member = state.member
        if (member != null) {
            MemberCard(
                name = member.context?.displayName ?: "Member",
                tier = member.context?.tier,
                loyaltyId = member.context?.loyaltyId,
                availablePoints = member.context?.availablePoints,
                worthMinor = member.context?.availablePoints?.let { state.rate.valueMinor(it) },
                currency = vm.config.currency,
                earnPreview = if (balanceMode) null else state.quote?.earnPoints,
                challenges = member.context?.challenges ?: emptyList(),
            )
            Spacer(Modifier.height(12.dp))
            SecondaryAction("Different customer") { vm.clearMember(); phone = "" }
        } else if (state.lookupNotFound) {
            // New number → enrol on the spot; profile completes later in the app.
            Spacer(Modifier.height(6.dp))
            RfmCard {
                Text("New member", style = MaterialTheme.typography.headlineSmall, color = RfmColor.Ink)
                Spacer(Modifier.height(4.dp))
                Text(
                    "${state.lastLookupPhone ?: ""} isn't enrolled yet. Create their account now — they finish sign-up in the Partners Points app.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = RfmColor.MutedFg,
                )
                Spacer(Modifier.height(14.dp))
                androidx.compose.material3.OutlinedTextField(
                    value = newName,
                    onValueChange = { newName = it },
                    label = { Text("Customer name (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Spacer(Modifier.height(14.dp))
                PrimaryAction("Create member & continue", loading = state.lookupBusy) {
                    vm.enroll(newName.ifBlank { null })
                }
                Spacer(Modifier.height(8.dp))
                SecondaryAction("Different number") { vm.clearMember(); phone = "" }
            }
        } else {
            Spacer(Modifier.height(6.dp))
            Text(
                if (phone.isEmpty()) "Mobile number" else formatPhonePreview(phone),
                style = MaterialTheme.typography.headlineLarge,
                color = if (phone.isEmpty()) RfmColor.MutedFg.copy(alpha = 0.5f) else RfmColor.Ink,
                modifier = Modifier.fillMaxWidth(),
            )
            state.lookupError?.let { err ->
                Spacer(Modifier.height(8.dp))
                Text(err, style = MaterialTheme.typography.bodyMedium, color = RfmColor.Destructive)
            }
            Spacer(Modifier.height(16.dp))
            Keypad(
                onDigit = { if (phone.length < 14) phone += it },
                onBackspace = { phone = phone.dropLast(1) },
                leftKey = "+",
                onLeftKey = { if (phone.isEmpty()) phone = "+" },
            )
            Spacer(Modifier.height(12.dp))
            SecondaryAction("Scan member QR instead") { scanning = true }
        }
    }
}

/**
 * One line the cashier can say out loud.
 *
 * "Two more visits and your next coffee is free" is the whole point of a stamp
 * card, and the till is the only place anyone is standing close enough to hear
 * it. Visits count in visits; anything else counts in whatever it counts in,
 * which is why the unit comes from the server rather than being assumed here.
 */
private fun challengeLine(c: MemberChallenge): String {
    val unit = if (c.unit == "visits") "visits" else null
    val progress = if (unit != null) {
        "${c.progress} of ${c.target} $unit"
    } else {
        "${c.progress} of ${c.target}"
    }
    if (c.complete) {
        val prize = c.rewardName ?: if (c.rewardPoints > 0) "${formatPoints(c.rewardPoints)} points" else null
        return if (prize != null) "$progress — $prize is ready" else "$progress — complete"
    }
    val left = c.remaining
    val more = when {
        unit != null && left == 1L -> "1 more visit"
        unit != null -> "$left more visits"
        left == 1L -> "1 more"
        else -> "$left more"
    }
    val prize = c.rewardName ?: if (c.rewardPoints > 0) "${formatPoints(c.rewardPoints)} points" else null
    return if (prize != null) "$progress · $more for $prize" else "$progress · $more to go"
}

@Composable
private fun ChallengeProgress(challenges: List<MemberChallenge>) {
    if (challenges.isEmpty()) return
    Spacer(Modifier.height(16.dp))
    challenges.forEach { c ->
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.weight(1f)) {
                Text(c.name, style = MaterialTheme.typography.labelMedium, color = RfmColor.MutedFg)
                Text(
                    challengeLine(c),
                    style = MaterialTheme.typography.titleSmall,
                    color = if (c.complete) RfmColor.Lime600 else RfmColor.Ink,
                )
            }
            if (c.complete) {
                Chip("Ready", bg = RfmColor.Lime200, fg = RfmColor.Lime900)
            }
        }
        // Stamps read as stamps: a row of dots the customer can count from
        // across the counter, filled for what they've collected.
        if (c.isStampCard && c.target <= 20L) {
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                (1..c.target.toInt()).forEach { i ->
                    Box(
                        Modifier
                            .size(14.dp)
                            .clip(CircleShape)
                            .background(if (i <= c.progress) RfmColor.Ink else RfmColor.Muted),
                    )
                }
            }
        }
        Spacer(Modifier.height(10.dp))
    }
}

@Composable
fun MemberCard(
    name: String,
    tier: String?,
    loyaltyId: String?,
    availablePoints: Long?,
    earnPreview: Long?,
    worthMinor: Long? = null,
    currency: String = "AED",
    challenges: List<MemberChallenge> = emptyList(),
) {
    RfmCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(name, style = MaterialTheme.typography.headlineSmall, color = RfmColor.Ink)
                if (loyaltyId != null) {
                    Text(loyaltyId, style = MaterialTheme.typography.labelSmall, color = RfmColor.MutedFg)
                }
            }
            if (tier != null) {
                Chip(tier.replaceFirstChar { it.uppercase() }, bg = RfmColor.Lime200, fg = RfmColor.Lime900)
            }
        }
        Spacer(Modifier.height(16.dp))
        Row {
            Column(Modifier.weight(1f)) {
                Text("Available points", style = MaterialTheme.typography.labelMedium, color = RfmColor.MutedFg)
                Text(
                    availablePoints?.let { formatPoints(it) } ?: "—",
                    style = MaterialTheme.typography.displayMedium,
                    color = RfmColor.Ink,
                )
                if (worthMinor != null && worthMinor > 0) {
                    Text(
                        "worth ${formatAmountWithCurrency(worthMinor, currency)}",
                        style = MaterialTheme.typography.titleSmall,
                        color = RfmColor.Lime600,
                    )
                }
            }
            if (earnPreview != null && earnPreview > 0) {
                Column(horizontalAlignment = Alignment.End) {
                    Text("Earns on this sale", style = MaterialTheme.typography.labelMedium, color = RfmColor.MutedFg)
                    Text(
                        "+${formatPoints(earnPreview)}",
                        style = MaterialTheme.typography.headlineMedium,
                        color = RfmColor.Lime600,
                    )
                }
            }
        }
        ChallengeProgress(challenges)
    }
}

private fun formatPhonePreview(p: String): String = p.chunked(3).joinToString(" ")
