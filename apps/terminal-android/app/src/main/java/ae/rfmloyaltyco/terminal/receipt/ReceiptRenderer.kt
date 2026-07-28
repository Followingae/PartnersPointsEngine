package ae.rfmloyaltyco.terminal.receipt

import ae.rfmloyaltyco.terminal.R
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import androidx.core.content.res.ResourcesCompat
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.MultiFormatWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** One slip: acquirer payment data + loyalty, printed once. */
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
    val loyaltyId: String? = null,
    val memberPhoneMasked: String? = null,
    val eReceiptUrl: String? = null,
    // acquirer slip fields (from SmartPay)
    val cardType: String? = null,
    val voucherNo: String? = null,
    val referNo: String? = null,
    val batchNo: String? = null,
    val terminalNo: String? = null,
    val merchantNo: String? = null,
    val transTime: String? = null,
    val cardExpiry: String? = null,
    val responseCode: String? = null,
    val aid: String? = null,
    val tvr: String? = null,
    val tsi: String? = null,
    val appLabel: String? = null,
)

/**
 * Renders the receipt as a 384-dot monochrome bitmap — the same bitmap the
 * thermal head prints and the screen animates, so paper and pixels match.
 * Layout is deliberately tight: paper roll is a running cost.
 */
class ReceiptRenderer(private val context: Context) {

    private val display: Typeface = loadFont(R.font.bricolage_grotesque, Typeface.DEFAULT_BOLD)
    private val sans: Typeface = loadFont(R.font.hanken_grotesk, Typeface.DEFAULT)
    private val mono: Typeface = loadFont(R.font.ibm_plex_mono, Typeface.MONOSPACE)
    private val logo: Bitmap? = runCatching {
        BitmapFactory.decodeResource(context.resources, R.drawable.rfm_slip_logo)
    }.getOrNull()

    private fun loadFont(res: Int, fallback: Typeface): Typeface =
        runCatching { ResourcesCompat.getFont(context, res) }.getOrNull() ?: fallback

    fun render(d: ReceiptData): Bitmap {
        val bmp = Bitmap.createBitmap(WIDTH, 2200, Bitmap.Config.ARGB_8888)
        bmp.eraseColor(Color.WHITE)
        val c = Canvas(bmp)
        var y = 18f
        val black = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK }

        // ── RFM logo ─────────────────────────────────────────────────────────
        logo?.let { l ->
            val w = (WIDTH * 0.62f).toInt()
            val h = (l.height * (w.toFloat() / l.width)).toInt()
            c.drawBitmap(l, Rect(0, 0, l.width, l.height), Rect((WIDTH - w) / 2, y.toInt(), (WIDTH + w) / 2, y.toInt() + h), black)
            y += h + 10f
        }

        // ── merchant header ──────────────────────────────────────────────────
        y = center(c, d.brandName.ifBlank { "Partners Points" }, display, 30f, y, bold = true)
        y = center(c, listOfNotNull(d.branchName, d.terminalLabel).joinToString(" · "), sans, 16f, y)
        y += 6f
        y = rule(c, y)

        if (d.kind != "sale") {
            y += 6f
            y = center(c, if (d.kind == "void") "* * V O I D * *" else "* * R E F U N D * *", mono, 19f, y, bold = true)
            y += 2f
            y = rule(c, y)
        }

        // ── payment ──────────────────────────────────────────────────────────
        y += 8f
        y = row(c, "Subtotal", money(d.grossMinor, d.currency), y, sans, 17f)
        if (d.discountMinor > 0) y = row(c, "Points discount", "-" + money(d.discountMinor, d.currency), y, sans, 17f)
        y += 2f
        y = row(c, if (d.kind == "sale") "TOTAL" else "AMOUNT", money(d.netMinor, d.currency), y, display, 27f, bold = true)
        y += 4f

        val tender = if (d.paymentMethod == "cash") "CASH" else (d.cardType ?: "CARD")
        y = row(c, tender, d.maskedPan ?: "", y, mono, 15f)
        d.appLabel?.let { y = row(c, "App", it, y, mono, 14f) }
        listOfNotNull(
            d.authNo?.let { "Auth" to it },
            d.voucherNo?.let { "Voucher" to it },
            d.referNo?.let { "RRN" to it },
            d.batchNo?.let { "Batch" to it },
            d.merchantNo?.let { "MID" to it },
            d.terminalNo?.let { "TID" to it },
            d.aid?.let { "AID" to it },
            d.responseCode?.let { "Resp" to it },
        ).forEach { (k, v) -> y = row(c, k, v, y, mono, 14f) }
        y = center(c, d.transTime ?: timestamp(d.at), mono, 14f, y + 2f)

        if (d.paymentMethod != "cash" && d.kind == "sale") {
            y += 2f
            y = center(c, "APPROVED — NO SIGNATURE REQUIRED", mono, 13f, y)
        }
        y += 4f
        y = rule(c, y)

        // ── loyalty ──────────────────────────────────────────────────────────
        if (d.memberName != null) {
            y += 10f
            val top = y
            var by = y + 16f
            by = center(c, d.memberName, sans, 18f, by, bold = true)
            listOfNotNull(d.loyaltyId, d.memberPhoneMasked).takeIf { it.isNotEmpty() }?.let {
                by = center(c, it.joinToString("  ·  "), mono, 13f, by)
            }
            if (d.earnedPoints > 0) {
                by += 2f
                by = center(c, "+${fmt(d.earnedPoints)} ${d.pointsCode}", display, 34f, by, bold = true)
            }
            if (d.redeemedPoints > 0) by = center(c, "-${fmt(d.redeemedPoints)} ${d.pointsCode} redeemed", sans, 16f, by)
            d.balanceAfter?.let { by = center(c, "Balance  ${fmt(it)} ${d.pointsCode}", sans, 16f, by) }
            by += 10f
            c.drawRoundRect(
                RectF(12f, top, WIDTH - 12f, by), 18f, 18f,
                Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; style = Paint.Style.STROKE; strokeWidth = 2.5f },
            )
            y = by + 12f
        } else {
            y += 8f
            y = center(c, "Join and earn on every visit", sans, 16f, y)
            y += 4f
        }

        // ── eReceipt QR ──────────────────────────────────────────────────────
        runCatching {
            val payload = d.eReceiptUrl ?: d.orderNo
            val size = 230
            val matrix = MultiFormatWriter().encode(
                payload, BarcodeFormat.QR_CODE, size, size,
                mapOf(EncodeHintType.MARGIN to 1, EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M),
            )
            val left = (WIDTH - size) / 2
            val top = y.toInt() + 4
            for (qx in 0 until size) for (qy in 0 until size) {
                if (matrix.get(qx, qy)) c.drawPoint((left + qx).toFloat(), (top + qy).toFloat(), black)
            }
            y = (top + size).toFloat() + 4f
            if (d.eReceiptUrl != null) y = center(c, "Scan for your digital receipt", sans, 15f, y)
        }
        y = center(c, d.orderNo, mono, 13f, y)
        y += 6f
        y = rule(c, y)
        y += 4f
        y = center(c, "Thank you — see you again soon", sans, 15f, y)
        y += 16f

        val out = Bitmap.createBitmap(bmp, 0, 0, WIDTH, y.toInt().coerceAtMost(bmp.height))
        if (out !== bmp) bmp.recycle()
        return out
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private fun paint(tf: Typeface, size: Float, bold: Boolean = false) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.BLACK
        typeface = if (bold) Typeface.create(tf, Typeface.BOLD) else tf
        textSize = size
    }

    private fun center(c: Canvas, text: String, tf: Typeface, size: Float, y: Float, bold: Boolean = false): Float {
        if (text.isBlank()) return y
        val p = paint(tf, size, bold)
        c.drawText(text, (WIDTH - p.measureText(text)) / 2f, y + size, p)
        return y + size * 1.22f
    }

    private fun row(c: Canvas, left: String, right: String, y: Float, tf: Typeface, size: Float, bold: Boolean = false): Float {
        val p = paint(tf, size, bold)
        c.drawText(left, MARGIN, y + size, p)
        if (right.isNotBlank()) c.drawText(right, WIDTH - MARGIN - p.measureText(right), y + size, p)
        return y + size * 1.26f
    }

    private fun rule(c: Canvas, y: Float): Float {
        val p = Paint().apply {
            color = Color.BLACK; style = Paint.Style.STROKE; strokeWidth = 2f
            pathEffect = DashPathEffect(floatArrayOf(7f, 5f), 0f)
        }
        c.drawPath(Path().apply { moveTo(MARGIN, y); lineTo(WIDTH - MARGIN, y) }, p)
        return y + 3f
    }

    private fun money(minor: Long, currency: String) = "$currency %,d.%02d".format(minor / 100, minor % 100)
    private fun fmt(v: Long) = "%,d".format(v)
    private fun timestamp(at: Long) = SimpleDateFormat("dd MMM yyyy  HH:mm", Locale.US).format(Date(at))

    companion object {
        /** 58 mm thermal head = 384 dots. */
        const val WIDTH = 384
        private const val MARGIN = 16f
    }
}
