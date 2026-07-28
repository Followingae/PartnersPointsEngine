package ae.rfmloyaltyco.terminal.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ae.rfmloyaltyco.terminal.R

// ── RFM console palette (packages/config/tailwind-preset.cjs) ────────────────
object RfmColor {
    val Ink = Color(0xFF101012)
    val InkSoft = Color(0xFF17171B)
    val InkMuted = Color(0xFF2A2A30)
    val Canvas = Color(0xFFFBFAF7)
    val Card = Color(0xFFFFFFFF)
    val Border = Color(0xFFE7E5DE)
    val Muted = Color(0xFFF0EFE9)
    val MutedFg = Color(0xFF6E6E6B)
    val Lime = Color(0xFFC6E23C)
    val Lime200 = Color(0xFFE4F49B)
    val Lime600 = Color(0xFF9BBE1E)
    val Lime900 = Color(0xFF4A5A18)
    val Coral = Color(0xFFFF8A7A)
    val Blush = Color(0xFFFF6FA5)
    val Teal = Color(0xFF73E8D4)
    val TealDeep = Color(0xFF0F6B66)
    val Sky = Color(0xFF5BA8FB)
    val Destructive = Color(0xFFDE2626)
}

val DisplayFamily = FontFamily(Font(R.font.bricolage_grotesque, FontWeight.Normal))
val SansFamily = FontFamily(Font(R.font.hanken_grotesk, FontWeight.Normal))
val MonoFamily = FontFamily(
    Font(R.font.ibm_plex_mono, FontWeight.Normal),
    Font(R.font.ibm_plex_mono_medium, FontWeight.Medium),
)

private val RfmTypography = Typography(
    displayLarge = TextStyle(fontFamily = DisplayFamily, fontWeight = FontWeight.Bold, fontSize = 56.sp, letterSpacing = (-1).sp),
    displayMedium = TextStyle(fontFamily = DisplayFamily, fontWeight = FontWeight.Bold, fontSize = 44.sp, letterSpacing = (-0.8).sp),
    headlineLarge = TextStyle(fontFamily = DisplayFamily, fontWeight = FontWeight.Bold, fontSize = 32.sp, letterSpacing = (-0.5).sp),
    headlineMedium = TextStyle(fontFamily = DisplayFamily, fontWeight = FontWeight.Bold, fontSize = 26.sp, letterSpacing = (-0.4).sp),
    headlineSmall = TextStyle(fontFamily = DisplayFamily, fontWeight = FontWeight.SemiBold, fontSize = 22.sp),
    titleLarge = TextStyle(fontFamily = SansFamily, fontWeight = FontWeight.Bold, fontSize = 20.sp),
    titleMedium = TextStyle(fontFamily = SansFamily, fontWeight = FontWeight.SemiBold, fontSize = 17.sp),
    titleSmall = TextStyle(fontFamily = SansFamily, fontWeight = FontWeight.SemiBold, fontSize = 15.sp),
    bodyLarge = TextStyle(fontFamily = SansFamily, fontSize = 17.sp),
    bodyMedium = TextStyle(fontFamily = SansFamily, fontSize = 15.sp),
    bodySmall = TextStyle(fontFamily = SansFamily, fontSize = 13.sp),
    labelLarge = TextStyle(fontFamily = SansFamily, fontWeight = FontWeight.SemiBold, fontSize = 16.sp),
    labelMedium = TextStyle(fontFamily = SansFamily, fontWeight = FontWeight.Medium, fontSize = 13.sp),
    labelSmall = TextStyle(fontFamily = MonoFamily, fontWeight = FontWeight.Medium, fontSize = 12.sp),
)

private val RfmShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(32.dp),
)

private val LightColors = lightColorScheme(
    primary = RfmColor.Ink,
    onPrimary = Color.White,
    primaryContainer = RfmColor.Lime,
    onPrimaryContainer = RfmColor.Ink,
    secondary = RfmColor.Lime600,
    onSecondary = Color.White,
    background = RfmColor.Canvas,
    onBackground = RfmColor.Ink,
    surface = RfmColor.Card,
    onSurface = RfmColor.Ink,
    surfaceVariant = RfmColor.Muted,
    onSurfaceVariant = RfmColor.MutedFg,
    outline = RfmColor.Border,
    error = RfmColor.Destructive,
    onError = Color.White,
)

@Composable
fun RfmTerminalTheme(content: @Composable () -> Unit) {
    // Console parity: the merchant dashboard is light-only.
    isSystemInDarkTheme() // intentionally ignored
    MaterialTheme(colorScheme = LightColors, typography = RfmTypography, shapes = RfmShapes, content = content)
}
