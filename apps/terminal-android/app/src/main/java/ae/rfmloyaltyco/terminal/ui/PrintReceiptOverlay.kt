package ae.rfmloyaltyco.terminal.ui

import ae.rfmloyaltyco.terminal.TerminalApp
import ae.rfmloyaltyco.terminal.receipt.ReceiptData
import ae.rfmloyaltyco.terminal.receipt.ReceiptPrinter
import ae.rfmloyaltyco.terminal.theme.RfmColor
import ae.rfmloyaltyco.terminal.theme.SecondaryAction
import android.graphics.Bitmap
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The theatre piece: the exact bitmap being printed slides UP off the top of the
 * screen at the same speed the paper feeds out of the printer above the display
 * (F-series print head ≈ 70 mm/s). The animation duration comes from the
 * printer's own physics estimate; the hardware callback snap-finishes it.
 */
@Composable
fun PrintReceiptOverlay(
    app: TerminalApp,
    data: ReceiptData,
    onDone: () -> Unit,
) {
    val bitmap = remember(data) { app.receiptRenderer.render(data) }
    val printer = remember { app.receiptPrinter() }
    val durationMs = remember(bitmap) { printer.estimateDurationMs(bitmap) }

    var printDone by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    // 0f = receipt resting on "the printer slot" (top of screen), 1f = fully fed out.
    val progress = remember { Animatable(0f) }

    LaunchedEffect(bitmap) {
        // Fire hardware + animation together so paper and pixels move as one.
        launch {
            when (val outcome = printer.print(bitmap)) {
                is ReceiptPrinter.Outcome.Failed -> error = outcome.message
                else -> Unit
            }
            printDone = true
        }
        delay(150) // spin-up beat before paper starts moving
        progress.animateTo(1f, tween(durationMs.toInt(), easing = LinearEasing))
    }

    LaunchedEffect(printDone) {
        if (printDone && error == null) {
            if (progress.value < 1f) progress.animateTo(1f, tween(250))
            delay(400)
            onDone()
        }
    }

    val density = LocalDensity.current
    // Receipt rendered at ~55% screen width; travel = its own height + a bit of slack.
    val receiptWidthDp = 220.dp
    val aspect = bitmap.height.toFloat() / bitmap.width.toFloat()
    val receiptHeightDp = receiptWidthDp * aspect
    val travelPx = with(density) { (receiptHeightDp + 60.dp).toPx() }

    Box(Modifier.fillMaxSize().background(RfmColor.Ink.copy(alpha = 0.96f))) {
        // printer slot lip at the very top of the screen
        Box(
            Modifier
                .align(Alignment.TopCenter)
                .width(receiptWidthDp + 28.dp)
                .height(10.dp)
                .background(Color.Black),
        )

        // the receipt, emerging upward "into" the physical slot
        Column(
            Modifier
                .align(Alignment.TopCenter)
                .offset { IntOffset(0, (60 - travelPx * progress.value).toInt()) },
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = "Receipt",
                modifier = Modifier.width(receiptWidthDp),
                contentScale = ContentScale.FillWidth,
            )
            TornEdge(receiptWidthDp)
        }

        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (error == null) {
                Text(
                    "Printing receipt…",
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White,
                    textAlign = TextAlign.Center,
                )
                Text(
                    "Tear at the top when it stops",
                    style = MaterialTheme.typography.labelMedium,
                    color = Color.White.copy(alpha = 0.6f),
                )
            } else {
                Text(
                    error ?: "",
                    style = MaterialTheme.typography.titleMedium,
                    color = RfmColor.Coral,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(14.dp))
                SecondaryAction("Close") { onDone() }
            }
        }
    }
}

/** Zig-zag torn-paper bottom edge. */
@Composable
private fun TornEdge(width: androidx.compose.ui.unit.Dp) {
    Canvas(Modifier.width(width).height(7.dp)) {
        val teeth = 26
        val step = size.width / teeth
        val path = Path().apply {
            moveTo(0f, 0f)
            for (i in 0 until teeth) {
                lineTo(step * i + step / 2f, size.height)
                lineTo(step * (i + 1), 0f)
            }
            close()
        }
        drawPath(path, Color.White)
    }
}
