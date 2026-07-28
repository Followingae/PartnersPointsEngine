package ae.rfmloyaltyco.terminal.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Full-width bottom-pinned primary action — 64dp tall for glove-friendly taps. */
@Composable
fun PrimaryAction(
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    color: Color = RfmColor.Ink,
    contentColor: Color = Color.White,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.fillMaxWidth().height(64.dp),
        shape = RoundedCornerShape(20.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = color,
            contentColor = contentColor,
            disabledContainerColor = color.copy(alpha = 0.35f),
            disabledContentColor = contentColor.copy(alpha = 0.7f),
        ),
    ) {
        if (loading) {
            CircularProgressIndicator(Modifier.size(22.dp), color = contentColor, strokeWidth = 2.5.dp)
        } else {
            Text(label, style = MaterialTheme.typography.titleMedium)
        }
    }
}

@Composable
fun SecondaryAction(label: String, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().height(56.dp),
        shape = RoundedCornerShape(18.dp),
        colors = ButtonDefaults.buttonColors(containerColor = RfmColor.Muted, contentColor = RfmColor.Ink),
    ) { Text(label, style = MaterialTheme.typography.titleSmall) }
}

@Composable
fun RfmCard(modifier: Modifier = Modifier, padding: Dp = 20.dp, content: @Composable ColumnScope.() -> Unit) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = RfmColor.Card,
        border = androidx.compose.foundation.BorderStroke(1.dp, RfmColor.Border.copy(alpha = 0.7f)),
        shadowElevation = 1.dp,
    ) { Column(Modifier.padding(padding), content = content) }
}

@Composable
fun Chip(text: String, bg: Color, fg: Color, modifier: Modifier = Modifier) {
    Box(
        modifier
            .background(bg, CircleShape)
            .padding(horizontal = 12.dp, vertical = 5.dp),
    ) { Text(text, color = fg, style = MaterialTheme.typography.labelMedium) }
}

@Composable
fun StatusDot(ok: Boolean, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(8.dp).background(if (ok) RfmColor.Lime600 else RfmColor.Coral, CircleShape),
        )
        Spacer(Modifier.size(6.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = RfmColor.MutedFg)
    }
}

/** Screen chrome: title bar with back button, content, bottom action slot. */
@Composable
fun TerminalScaffold(
    title: String,
    subtitle: String? = null,
    onBack: (() -> Unit)? = null,
    bottomBar: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize().background(RfmColor.Canvas)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onBack != null) {
                IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = RfmColor.Ink)
                }
            } else {
                Spacer(Modifier.size(12.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.headlineSmall, color = RfmColor.Ink)
                if (subtitle != null) {
                    Text(subtitle, style = MaterialTheme.typography.labelMedium, color = RfmColor.MutedFg)
                }
            }
        }
        Column(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp), content = content)
        if (bottomBar != null) {
            Box(Modifier.fillMaxWidth().padding(PaddingValues(16.dp))) { bottomBar() }
        }
    }
}

/** 3×4 keypad shared by the amount and phone entry screens. */
@Composable
fun Keypad(
    onDigit: (Char) -> Unit,
    onBackspace: () -> Unit,
    leftKey: String = "·",
    onLeftKey: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val rows = listOf(listOf('1', '2', '3'), listOf('4', '5', '6'), listOf('7', '8', '9'))
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        rows.forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { d -> KeypadKey(d.toString(), Modifier.weight(1f)) { onDigit(d) } }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            KeypadKey(leftKey, Modifier.weight(1f), muted = true) { onLeftKey?.invoke() }
            KeypadKey("0", Modifier.weight(1f)) { onDigit('0') }
            KeypadKey("⌫", Modifier.weight(1f), muted = true) { onBackspace() }
        }
    }
}

@Composable
private fun KeypadKey(label: String, modifier: Modifier = Modifier, muted: Boolean = false, onClick: () -> Unit) {
    Surface(
        modifier = modifier.aspectRatio(1.55f).clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = if (muted) RfmColor.Muted else RfmColor.Card,
        border = androidx.compose.foundation.BorderStroke(1.dp, RfmColor.Border.copy(alpha = 0.6f)),
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
            Text(
                label,
                fontSize = 26.sp,
                fontFamily = DisplayFamily,
                color = RfmColor.Ink,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
fun HomeTile(icon: ImageVector, label: String, modifier: Modifier = Modifier, tint: Color = RfmColor.Ink, onClick: () -> Unit) {
    Surface(
        modifier = modifier.height(96.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(20.dp),
        color = RfmColor.Card,
        border = androidx.compose.foundation.BorderStroke(1.dp, RfmColor.Border.copy(alpha = 0.7f)),
    ) {
        Column(
            Modifier.fillMaxSize().padding(14.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(26.dp))
            Text(label, style = MaterialTheme.typography.titleSmall, color = RfmColor.Ink)
        }
    }
}
