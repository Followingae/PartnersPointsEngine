package ae.rfmloyaltyco.terminal.receipt

import ae.rfmloyaltyco.terminal.R
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import androidx.core.content.res.ResourcesCompat
import com.google.zxing.BarcodeFormat
import com.google.zxing.MultiFormatWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Everything a loyalty receipt shows. */
data class ReceiptData(
    val brandName: String,
    val branchName: String?,
    val terminalLabel: String,
    val at: Long,
    val orderNo: String,
    val grossMinor: Long,
    val discountMinor: Long,
    val netMinor: Long,
    val currency: String,
    val paymentMethod: String, // card | cash
    val maskedPan: String?,
    val authNo: String?,
    val memberName: String?,
    val earnedPoints: Long,
    val redeemedPoints: Long,
    val balanceAfter: Long?,
    val pointsCode: String,
    val kind: String = "sale", // sale | refund | void
)

/**
 * Renders the receipt as a 384-dot-wide monochrome bitmap — the exact bitmap
 * the thermal head prints AND the exact bitmap shown on screen, so the printing
 * animation matches the paper dot-for-dot.
 *
 * Typography mirrors the console: Bricolage Grotesque display, Hanken Grotesk
 * body, IBM Plex Mono for machine data.
 */
class ReceiptRenderer(private val context: Context) {

    private val display: Typeface = loadFont(R.font.bricolage_grotesque, Typeface.DEFAULT_BOLD)
    private val sans: Typeface = loadFont(R.font.hanken_grotesk, Typeface.DEFAULT)
    private val mono: Typeface = loadFont(R.font.ibm_plex_mono, Typeface.MONOSPACE)

    private fun loadFont(res: Int, fallback: Typeface): Typeface =
        runCatching { ResourcesCompat.getFont(context, res) }.getOrNull() ?: fallback

    fun render(d: ReceiptData): Bitmap {
        // Draw tall, crop to content height at the end.
        val bmp = Bitmap.createBitmap(WIDTH, 1400, Bitmap.Config.ARGB_8888)
        bmp.eraseColor(Color.WHITE)
        val c = Canvas(bmp)
        var y = 34f

        val black = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK }

        // ── header ───────────────────────────────────────────────────────────
        y = drawCentered(c, d.brandName.ifBlank { "Partners Points" }, display, 34f, y, bold = true)
        y += 2f
        y = drawCentered(c, listOfNotNull(d.branchName, d.terminalLabel).joinToString(" · "), sans, 18f, y)
        y = drawCentered(c, timestamp(d.at), mono, 16f, y)
        y += 10f
        y = dashedRule(c, y)

        if (d.kind != "sale") {
            y += 8f
            y = drawCentered(c, if (d.kind == "void") "* * *  VOID  * * *" else "* * *  REFUND  * * *", mono, 20f, y, bold = true)
            y += 4f
        }

        // ── amounts ──────────────────────────────────────────────────────────
        y += 14f
        y = row(c, "Subtotal", money(d.grossMinor, d.currency), y, sans, 19f)
        if (d.discountMinor > 0) {
            y = row(c, "Points discount", "− " + money(d.discountMinor, d.currency), y, sans, 19f)
        }
        y += 6f
        // total: big display numerals
        y = row(c, if (d.kind == "sale") "TOTAL" else "AMOUNT", money(d.netMinor, d.currency), y, display, 30f, bold = true)
        y += 4f
        val tender = if (d.paymentMethod == "cash") "Cash" else listOfNotNull("Card", d.maskedPan).joinToString(" ")
        y = row(c, tender, d.authNo?.let { "Auth $it" } ?: "", y, mono, 16f)
        y += 8f
        y = dashedRule(c, y)

        // ── loyalty block ────────────────────────────────────────────────────
        if (d.memberName != null && (d.earnedPoints > 0 || d.redeemedPoints > 0 || d.balanceAfter != null)) {
            y += 16f
            val blockTop = y
            var by = y + 24f
            by = drawCentered(c, d.memberName, sans, 20f, by, bold = true)
            if (d.earnedPoints > 0) {
                by += 4f
                by = drawCentered(c, "+${fmt(d.earnedPoints)} ${d.pointsCode}", display, 40f, by, bold = true)
            }
            if (d.redeemedPoints > 0) {
                by = drawCentered(c, "−${fmt(d.redeemedPoints)} ${d.pointsCode} redeemed", sans, 18f, by)
            }
            if (d.balanceAfter != null) {
                by += 2f
                by = drawCentered(c, "Balance  ${fmt(d.balanceAfter)} ${d.pointsCode}", sans, 18f, by)
            }
            by += 14f
            // rounded frame around the loyalty block, console-card style
            val frame = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                style = Paint.Style.STROKE
                strokeWidth = 2.5f
            }
            c.drawRoundRect(RectF(14f, blockTop, WIDTH - 14f, by), 22f, 22f, frame)
            y = by + 18f
        } else {
            y += 8f
            y = drawCentered(c, "Join Partners Points — earn on every visit", sans, 17f, y)
            y += 8f
        }

        // ── QR (order reference for support/refunds) ─────────────────────────
        runCatching {
            val size = 120
            val matrix = MultiFormatWriter().encode(d.orderNo, BarcodeFormat.QR_CODE, size, size)
            val left = (WIDTH - size) / 2
            val top = y.toInt() + 6
            for (qx in 0 until size) {
                for (qy in 0 until size) {
                    if (matrix.get(qx, qy)) c.drawPoint((left + qx).toFloat(), (top + qy).toFloat(), black)
                }
            }
            y = (top + size).toFloat() + 8f
        }
        y = drawCentered(c, d.orderNo, mono, 15f, y)
        y += 10f
        y = dashedRule(c, y)
        y += 6f
        y = drawCentered(c, "Powered by Partners Points", mono, 14f, y)
        y += 26f

        val cropped = Bitmap.createBitmap(bmp, 0, 0, WIDTH, y.toInt().coerceAtMost(bmp.height))
        if (cropped !== bmp) bmp.recycle()
        return cropped
    }

    // ── drawing helpers ──────────────────────────────────────────────────────

    private fun paint(tf: Typeface, size: Float, bold: Boolean = false): Paint =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            typeface = if (bold) Typeface.create(tf, Typeface.BOLD) else tf
            textSize = size
        }

    private fun drawCentered(c: Canvas, text: String, tf: Typeface, size: Float, y: Float, bold: Boolean = false): Float {
        if (text.isBlank()) return y
        val p = paint(tf, size, bold)
        val w = p.measureText(text)
        c.drawText(text, (WIDTH - w) / 2f, y + size, p)
        return y + size * 1.35f
    }

    private fun row(c: Canvas, left: String, right: String, y: Float, tf: Typeface, size: Float, bold: Boolean = false): Float {
        val p = paint(tf, size, bold)
        c.drawText(left, MARGIN, y + size, p)
        if (right.isNotBlank()) {
            val w = p.measureText(right)
            c.drawText(right, WIDTH - MARGIN - w, y + size, p)
        }
        return y + size * 1.45f
    }

    private fun dashedRule(c: Canvas, y: Float): Float {
        val p = Paint().apply {
            color = Color.BLACK
            style = Paint.Style.STROKE
            strokeWidth = 2f
            pathEffect = DashPathEffect(floatArrayOf(8f, 6f), 0f)
        }
        val path = Path().apply { moveTo(MARGIN, y); lineTo(WIDTH - MARGIN, y) }
        c.drawPath(path, p)
        return y + 4f
    }

    private fun money(minor: Long, currency: String): String = "$currency %,d.%02d".format(minor / 100, minor % 100)
    private fun fmt(v: Long): String = "%,d".format(v)
    private fun timestamp(at: Long): String = SimpleDateFormat("dd MMM yyyy  HH:mm", Locale.US).format(Date(at))

    companion object {
        /** 58 mm thermal head = 384 dots. */
        const val WIDTH = 384
        private const val MARGIN = 18f
    }
}
