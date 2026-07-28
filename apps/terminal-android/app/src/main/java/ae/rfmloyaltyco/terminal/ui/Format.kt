package ae.rfmloyaltyco.terminal.ui

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

fun formatAmount(minor: Long): String = "%,d.%02d".format(minor / 100, minor % 100)

fun formatAmountWithCurrency(minor: Long, currency: String): String = "$currency ${formatAmount(minor)}"

fun formatPoints(points: Long): String = "%,d".format(points)

fun formatTime(epochMs: Long): String =
    SimpleDateFormat("d MMM · HH:mm", Locale.US).format(Date(epochMs))
