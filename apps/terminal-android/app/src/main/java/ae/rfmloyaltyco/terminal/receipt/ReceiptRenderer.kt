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
import android.graphics.Typeface
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.MultiFormatWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** One stamp card's state as printed. */
data class ReceiptStamp(val name: String, val progress: Int, val target: Int)

/**
 * The loyalty slip. Card/acquirer data lives on SmartPay's own printout — this
 * slip is purely the customer's loyalty record.
 */
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
    val memberName: String?,
    val earnedPoints: Long,
    val redeemedPoints: Long,
    val balanceAfter: Long?,
    val pointsCode: String,
    val kind: String = "sale", // sale | void
    val loyaltyId: String? = null,
    val memberPhoneMasked: String? = null,
    val eReceiptUrl: String? = null,
    val stamps: List<ReceiptStamp> = emptyList(),
    val unlocked: List<String> = emptyList(),
    /** Rewards handed over on this sale — printed with their numbers. */
    val vouchers: List<ReceiptVoucher> = emptyList(),
)

/** A reward applied to the sale, as it appears on the slip. */
data class ReceiptVoucher(
    val code: String,
    val rewardName: String,
    val discountMinor: Long,
)

/**
 * Renders the slip as a 384-dot monochrome bitmap. Uses the platform's own
 * hinted fonts (as SmartPay's printouts do) — decorative TTFs smear at thermal
 * resolution — and thresholds to pure black/white so nothing bleeds.
 */
class ReceiptRenderer(private val context: Context) {

    private val heading: Typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
    private val body: Typeface = Typeface.SANS_SERIF
    private val mono: Typeface = Typeface.MONOSPACE
    private val logo: Bitmap? = runCatching {
        BitmapFactory.decodeResource(context.resources, R.drawable.rfm_slip_logo)
    }.getOrNull()

    fun render(d: ReceiptData): Bitmap {
        val bmp = Bitmap.createBitmap(WIDTH, 2200, Bitmap.Config.ARGB_8888)
        bmp.eraseColor(Color.WHITE)
        val c = Canvas(bmp)
        var y = 18f
        val black = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK }

        logo?.let { l ->
            val w = (WIDTH * 0.58f).toInt()
            val h = (l.height * (w.toFloat() / l.width)).toInt()
            c.drawBitmap(l, Rect(0, 0, l.width, l.height), Rect((WIDTH - w) / 2, y.toInt(), (WIDTH + w) / 2, y.toInt() + h), black)
            y += h + 12f
        }

        y = center(c, d.brandName, heading, 30f, y)
        y = center(c, listOfNotNull(d.branchName, d.terminalLabel).joinToString(" · "), body, 17f, y)
        y = center(c, timestamp(d.at), mono, 16f, y)
        y += 8f
        y = rule(c, y)

        if (d.kind != "sale") {
            y += 8f
            y = center(c, "* *  V O I D  * *", heading, 22f, y)
            y += 4f
            y = rule(c, y)
        }

        // ── customer ─────────────────────────────────────────────────────────
        if (d.memberName != null) {
            y += 12f
            y = center(c, d.memberName, heading, 24f, y)
            listOfNotNull(d.loyaltyId, d.memberPhoneMasked).takeIf { it.isNotEmpty() }?.let {
                y = center(c, it.joinToString("   "), mono, 15f, y)
            }
            y += 8f
            y = rule(c, y)

            // ── the point of the slip: what they earned and spent ────────────
            if (d.earnedPoints > 0) {
                y += 14f
                y = center(c, "POINTS EARNED", body, 18f, y)
                y = center(c, "+${fmt(d.earnedPoints)}", heading, 62f, y)
                y = center(c, d.pointsCode, body, 17f, y)
                y += 6f
            }
            if (d.redeemedPoints > 0) {
                y += 8f
                y = center(c, "POINTS REDEEMED", body, 18f, y)
                y = center(c, "-${fmt(d.redeemedPoints)}", heading, 44f, y)
                y += 4f
            }
            d.balanceAfter?.let {
                y += 6f
                y = center(c, "BALANCE  ${fmt(it)} ${d.pointsCode}", heading, 26f, y)
                y += 6f
            }

            // ── stamp cards ─────────────────────────────────────────────────
            d.stamps.forEach { s ->
                y += 10f
                y = rule(c, y)
                y += 10f
                y = center(c, s.name.uppercase(), body, 17f, y)
                y = center(c, stampRow(s.progress, s.target), heading, 26f, y)
                val left = (s.target - s.progress).coerceAtLeast(0)
                y = center(
                    c,
                    if (left == 0) "REWARD READY" else "$left more to go",
                    body, 17f, y,
                )
                y += 4f
            }

            d.unlocked.forEach { u ->
                y += 8f
                y = center(c, "UNLOCKED: ${u.uppercase()}", heading, 20f, y)
            }

            y += 10f
            y = rule(c, y)
        }

        // ── purchase context (no card/acquirer data — that's SmartPay's slip) ─
        y += 10f
        y = row(c, "Bill", money(d.grossMinor, d.currency), y, body, 18f)
        if (d.discountMinor > 0) y = row(c, "Points discount", "-" + money(d.discountMinor, d.currency), y, body, 18f)
        // Each reward gets its own line with its number, so the slip is proof of
        // which voucher was used here — the customer's and the merchant's copy agree.
        for (v in d.vouchers) {
            val amount = if (v.discountMinor > 0) "-" + money(v.discountMinor, d.currency) else "Applied"
            y = row(c, v.rewardName.take(22), amount, y, body, 18f)
            y = row(c, "  Voucher ${v.code}", "", y, mono, 16f)
        }
        y = row(c, "Paid", money(d.netMinor, d.currency), y, heading, 20f)
        y += 8f
        y = rule(c, y)

        // ── eReceipt QR ──────────────────────────────────────────────────────
        runCatching {
            val payload = d.eReceiptUrl ?: d.orderNo
            val size = 230
            val matrix = MultiFormatWriter().encode(
                payload, BarcodeFormat.QR_CODE, size, size,
                mapOf(EncodeHintType.MARGIN to 1, EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M),
            )
            val left = (WIDTH - size) / 2
            val top = y.toInt() + 8
            for (qx in 0 until size) for (qy in 0 until size) {
                if (matrix.get(qx, qy)) c.drawPoint((left + qx).toFloat(), (top + qy).toFloat(), black)
            }
            y = (top + size).toFloat() + 6f
            if (d.eReceiptUrl != null) y = center(c, "Scan for your digital receipt", body, 17f, y)
        }
        y = center(c, d.orderNo, mono, 14f, y)
        y += 8f
        y = rule(c, y)
        y += 6f
        y = center(c, "Thank you — see you again soon", body, 17f, y)
        y += 18f

        val cropped = Bitmap.createBitmap(bmp, 0, 0, WIDTH, y.toInt().coerceAtMost(bmp.height))
        if (cropped !== bmp) bmp.recycle()
        return threshold(cropped)
    }

    /** ●●●●●○○○○ — reads at a glance across the counter. */
    private fun stampRow(progress: Int, target: Int): String {
        if (target <= 0) return ""
        val filled = progress.coerceIn(0, target)
        return "●".repeat(filled) + "○".repeat(target - filled) + "   $filled/$target"
    }

    /** Pure black/white — thermal heads smear antialiased grey. */
    private fun threshold(src: Bitmap): Bitmap {
        val w = src.width
        val h = src.height
        val px = IntArray(w * h)
        src.getPixels(px, 0, w, 0, 0, w, h)
        for (i in px.indices) {
            val p = px[i]
            val lum = ((p shr 16 and 0xFF) * 77 + (p shr 8 and 0xFF) * 151 + (p and 0xFF) * 28) shr 8
            px[i] = if (lum < 150) 0xFF000000.toInt() else 0xFFFFFFFF.toInt()
        }
        val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        out.setPixels(px, 0, w, 0, 0, w, h)
        src.recycle()
        return out
    }

    private fun paint(tf: Typeface, size: Float) = Paint().apply {
        isAntiAlias = false
        isSubpixelText = false
        color = Color.BLACK
        typeface = tf
        textSize = size
    }

    private fun center(c: Canvas, text: String, tf: Typeface, size: Float, y: Float): Float {
        if (text.isBlank()) return y
        val p = paint(tf, size)
        c.drawText(text, (WIDTH - p.measureText(text)) / 2f, y + size, p)
        return y + size * 1.24f
    }

    private fun row(c: Canvas, left: String, right: String, y: Float, tf: Typeface, size: Float): Float {
        val p = paint(tf, size)
        c.drawText(left, MARGIN, y + size, p)
        if (right.isNotBlank()) c.drawText(right, WIDTH - MARGIN - p.measureText(right), y + size, p)
        return y + size * 1.3f
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
