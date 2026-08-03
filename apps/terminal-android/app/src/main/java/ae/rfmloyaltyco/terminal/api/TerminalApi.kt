package ae.rfmloyaltyco.terminal.api

import ae.rfmloyaltyco.terminal.data.SettingsStore
import java.io.IOException
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/**
 * HMAC-signed client for the /v1/terminal gateway. Mirrors packages/sdk-terminal:
 *   canonical = METHOD \n path \n ts \n nonce \n sha256hex(rawBody)
 *   Authorization: Loyalty-HMAC publishableKeyId=…,ts=…,nonce=…,sig=…
 */
class TerminalApi(private val settings: SettingsStore) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    class ApiException(val status: Int, val errorMessage: String) : IOException("HTTP $status: $errorMessage")

    // ── endpoints ────────────────────────────────────────────────────────────

    /** Terminal boot config: brand identity + the server-owned redemption valuation. */
    suspend fun fetchConfig(): ServerConfig = parseServerConfig(request("GET", "/config", null))

    suspend fun resolve(type: String, value: String): String {
        val res = post("/members/resolve", JSONObject().put("type", type).put("value", value))
        return res.getString("memberToken")
    }

    /** At-till enrollment for a new phone number. Idempotent server-side. */
    suspend fun enroll(phone: String, fullName: String?): String {
        val body = JSONObject().put("phone", phone)
        if (!fullName.isNullOrBlank()) body.put("fullName", fullName.trim())
        return post("/members/enroll", body).getString("memberToken")
    }

    /** Persist the eReceipt behind the printed QR (idempotent by token). */
    suspend fun createReceipt(payload: JSONObject) {
        post("/receipts", payload)
    }

    suspend fun memberContext(memberToken: String): MemberContext {
        val res = post("/members/context", JSONObject().put("memberToken", memberToken))
        return MemberContext(
            displayName = res.optString("displayName").ifBlank { "Member" },
            loyaltyId = res.optString("loyaltyId"),
            tier = res.optString("tier").ifBlank { null },
            activePoints = res.optJSONObject("balance")?.optString("active")?.toLongOrNull() ?: 0L,
            availablePoints = res.optJSONObject("balance")?.optString("available")?.toLongOrNull() ?: 0L,
            joinedAt = res.optString("joinedAt").ifBlank { null },
            challenges = res.optJSONArray("challenges").let { arr ->
                if (arr == null) emptyList() else (0 until arr.length()).mapNotNull { i ->
                    val o = arr.optJSONObject(i) ?: return@mapNotNull null
                    val target = o.optLong("target")
                    if (target <= 0L) null else MemberChallenge(
                        name = o.optString("name").ifBlank { "Challenge" },
                        unit = o.optString("unit").ifBlank { "progress" },
                        isStampCard = o.optBoolean("isStampCard"),
                        progress = o.optLong("progress"),
                        target = target,
                        rewardName = o.optString("rewardName").ifBlank { null },
                        rewardPoints = o.optLong("rewardPoints"),
                    )
                }
            },
        )
    }

    suspend fun quote(memberToken: String, amountMinor: Long, redeemPoints: Long? = null): Quote {
        val body = JSONObject()
            .put("memberToken", memberToken)
            .put("amountMinor", amountMinor)
            .put("isVisit", true)
        if (redeemPoints != null) body.put("redeemPoints", redeemPoints)
        val res = post("/quotes", body)
        val earn = res.optJSONObject("earn")
        val redeem = res.optJSONObject("redeem")
        return Quote(
            earnPoints = earn?.optLong("points") ?: 0L,
            earnBase = earn?.optLong("base") ?: 0L,
            earnMultiplier = earn?.optDouble("multiplier", 1.0) ?: 1.0,
            redeemAffordable = redeem?.optBoolean("affordable"),
            bonuses = parseBonuses(earn?.optJSONArray("bonuses")),
        )
    }

    suspend fun earn(memberToken: String, amountMinor: Long, idempotencyKey: String, sourceEvent: String): Txn =
        txn(
            JSONObject()
                .put("intent", "earn")
                .put("memberToken", memberToken)
                .put("idempotencyKey", idempotencyKey)
                .put("amountMinor", amountMinor)
                .put("isVisit", true)
                .put("sourceEvent", sourceEvent),
        )

    suspend fun redeemAuthorize(memberToken: String, points: Long, idempotencyKey: String, sourceEvent: String): Txn =
        txn(
            JSONObject()
                .put("intent", "redeem")
                .put("memberToken", memberToken)
                .put("idempotencyKey", idempotencyKey)
                .put("points", points)
                .put("sourceEvent", sourceEvent),
        )

    private suspend fun txn(body: JSONObject): Txn = parseTxn(post("/transactions", body))

    suspend fun capture(txnId: String): Txn = parseTxn(post("/transactions/$txnId/capture", JSONObject()))

    suspend fun void(txnId: String): Txn = parseTxn(post("/transactions/$txnId/void", JSONObject()))

    suspend fun get(txnId: String): Txn = parseTxn(request("GET", "/transactions/$txnId", null))

    /** Replays one queued offline op; server dedupes by idempotency key. */
    suspend fun replay(op: JSONObject): Txn = parseTxn(post("/transactions", op))

    suspend fun ping(): Boolean = try {
        // No dedicated health route on the terminal surface: a signed 404 still
        // proves connectivity + valid credentials (401 = bad key).
        request("GET", "/transactions/00000000-0000-0000-0000-000000000000", null)
        true
    } catch (e: ApiException) {
        e.status == 404 || e.status == 400
    } catch (_: Exception) {
        false
    }

    /**
     * A campaign row is only worth showing if it says what it did — a name with
     * neither a factor nor points is noise on a receipt somebody keeps.
     */
    private fun parseBonuses(arr: JSONArray?): List<EarnBonus> {
        if (arr == null) return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            val o = arr.optJSONObject(i) ?: return@mapNotNull null
            val name = o.optString("name")
            if (name.isBlank()) return@mapNotNull null
            val factor = if (o.has("factor")) o.optDouble("factor", 1.0).takeIf { it != 1.0 } else null
            val points = if (o.has("points")) o.optLong("points").takeIf { it > 0L } else null
            if (factor == null && points == null) null else EarnBonus(name, factor, points)
        }
    }

    private fun parseTxn(res: JSONObject) = Txn(
        id = res.getString("id"),
        intent = res.getString("intent"),
        state = res.getString("state"),
        points = res.optString("points").toLongOrNull(),
        amountMinor = res.optString("amountMinor").toLongOrNull(),
        completed = res.optJSONArray("completed")?.let { arr ->
            (0 until arr.length()).mapNotNull { i ->
                arr.optJSONObject(i)?.let { o ->
                    CompletedChallenge(
                        name = o.optString("name"),
                        rewardPoints = o.optString("rewardPoints").toLongOrNull() ?: 0L,
                        badgeName = o.optString("badgeName").ifBlank { null },
                        voucherCode = o.optString("voucherCode").ifBlank { null },
                    )
                }
            }
        } ?: emptyList(),
        stamps = res.optJSONArray("stamps")?.let { arr ->
            (0 until arr.length()).mapNotNull { i ->
                arr.optJSONObject(i)?.let { o ->
                    StampCard(
                        name = o.optString("name"),
                        progress = o.optInt("progress"),
                        target = o.optInt("target"),
                    )
                }
            }
        } ?: emptyList(),
        bonuses = parseBonuses(res.optJSONArray("bonuses")),
    )

    /** Rewards this member can use right now (so the cashier can just tap one). */
    suspend fun memberVouchers(memberToken: String): List<AvailableVoucher> {
        val res = request("POST", "/members/vouchers", JSONObject().put("memberToken", memberToken).toString())
        val arr = res.optJSONArray("items") ?: res.optJSONArray("data")
        // endpoint returns a bare array; the helper wraps non-objects under "items"
        val list = arr ?: return emptyList()
        return (0 until list.length()).mapNotNull { i ->
            list.optJSONObject(i)?.let { o ->
                AvailableVoucher(
                    code = o.optString("code"),
                    rewardName = o.optString("rewardName").ifBlank { "Reward" },
                    discountMinor = o.optLong("discountMinor"),
                )
            }
        }
    }

    /** Redeem a reward voucher the customer presents at the till. */
    suspend fun redeemVoucher(code: String, memberToken: String?): VoucherRedemption {
        val body = JSONObject().put("code", code)
        if (!memberToken.isNullOrBlank()) body.put("memberToken", memberToken)
        val res = post("/vouchers/redeem", body)
        return VoucherRedemption(
            code = res.optString("code"),
            rewardName = res.optString("rewardName").ifBlank { "Reward" },
            kind = res.optString("kind").ifBlank { "voucher" },
            discountMinor = res.optLong("discountMinor"),
        )
    }

    // ── transport ────────────────────────────────────────────────────────────

    private suspend fun post(path: String, body: JSONObject): JSONObject = request("POST", path, body.toString())

    private suspend fun request(method: String, path: String, rawBody: String?): JSONObject =
        withContext(Dispatchers.IO) {
            val cfg = settings.snapshot()
            val base = cfg.baseUrl.trimEnd('/')
            val url = base + path
            val signedPath = urlPath(url)
            val raw = rawBody ?: ""
            val ts = (System.currentTimeMillis() / 1000).toString()
            val nonce = UUID.randomUUID().toString()
            val canonical = listOf(method, signedPath, ts, nonce, sha256Hex(raw)).joinToString("\n")
            val sig = hmacHex(cfg.secret, canonical)

            val req = Request.Builder()
                .url(url)
                .header("Content-Type", "application/json")
                .header(
                    "Authorization",
                    "Loyalty-HMAC publishableKeyId=${cfg.publishableKeyId},ts=$ts,nonce=$nonce,sig=$sig",
                )
                .header("Loyalty-Version", "v1")
                .method(method, if (method == "GET") null else raw.toRequestBody(JSON))
                .build()

            client.newCall(req).execute().use { res ->
                val text = res.body?.string().orEmpty()
                if (!res.isSuccessful) {
                    val msg = try {
                        val j = JSONObject(text)
                        j.optJSONObject("error")?.optString("message")
                            ?: j.optString("message").ifBlank { null }
                            ?: text.take(200)
                    } catch (_: Exception) {
                        text.take(200)
                    }
                    throw ApiException(res.code, msg.ifBlank { "request failed" })
                }
                when {
                    text.isBlank() -> JSONObject()
                    // some endpoints return a bare array — wrap it so callers
                    // always get an object back
                    text.trimStart().startsWith("[") -> JSONObject().put("items", org.json.JSONArray(text))
                    else -> JSONObject(text)
                }
            }
        }

    private fun urlPath(url: String): String {
        val noScheme = url.substringAfter("://")
        val slash = noScheme.indexOf('/')
        return if (slash >= 0) noScheme.substring(slash).substringBefore('?') else "/"
    }

    private fun sha256Hex(s: String): String =
        MessageDigest.getInstance("SHA-256").digest(s.toByteArray(Charsets.UTF_8)).toHex()

    private fun hmacHex(secret: String, payload: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        return mac.doFinal(payload.toByteArray(Charsets.UTF_8)).toHex()
    }

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

    companion object {
        private val JSON = "application/json".toMediaType()

        /** Shared with SettingsStore so the cached copy parses identically. */
        fun parseServerConfig(res: JSONObject): ServerConfig {
            val brand = res.optJSONObject("brand") ?: JSONObject()
            val terminal = res.optJSONObject("terminal")
            val r = res.optJSONObject("redemption") ?: JSONObject()
            return ServerConfig(
                brandName = brand.optString("name"),
                currency = brand.optString("currency", "AED"),
                pointsCode = brand.optString("pointsCurrencyCode", "PTS"),
                terminalLabel = terminal?.optString("label")?.ifBlank { null },
                branchName = terminal?.optString("branchName")?.ifBlank { null },
                redemption = RedemptionRate(
                    enabled = r.optBoolean("enabled", true),
                    ratePoints = r.optString("ratePoints").toLongOrNull() ?: 100L,
                    rateValueMinor = r.optString("rateValueMinor").toLongOrNull() ?: 100L,
                    minRedeemPoints = r.optString("minRedeemPoints").toLongOrNull() ?: 0L,
                    maxPercentOfBillBps = r.optInt("maxPercentOfBillBps", 10000),
                    roundToMinor = r.optInt("roundToMinor", 1),
                    presetsPoints = r.optJSONArray("presetsPoints")?.let { arr ->
                        (0 until arr.length()).map { arr.optLong(it) }.filter { it > 0 }
                    } ?: emptyList(),
                    configured = r.optBoolean("configured", false),
                ),
                raw = res.toString(),
            )
        }

        /** Normalize cashier phone input to the E.164 form identifiers are hashed with. */
        fun normalizePhone(input: String): String {
            val d = input.filter { it.isDigit() || it == '+' }
            return when {
                d.startsWith("+") -> d
                d.startsWith("00") -> "+" + d.drop(2)
                d.startsWith("05") -> "+971" + d.drop(1)
                d.startsWith("971") -> "+$d"
                d.startsWith("5") && d.length == 9 -> "+971$d"
                else -> "+$d"
            }
        }

        fun newIdempotencyKey(): String = UUID.randomUUID().toString()
    }
}

data class MemberContext(
    val displayName: String,
    val loyaltyId: String,
    val tier: String?,
    val activePoints: Long,
    val availablePoints: Long,
    val joinedAt: String?,
    /** Live challenge progress, so the cashier can say how close they are. */
    val challenges: List<MemberChallenge> = emptyList(),
)

/**
 * One challenge this member is part-way through.
 *
 * The till only ever reads this. `unit` is "visits" for a visits-based
 * challenge, which is the difference between "8 of 10 visits" and a bare
 * "8 of 10" that means nothing to a customer standing at a counter.
 */
data class MemberChallenge(
    val name: String,
    val unit: String,
    val isStampCard: Boolean,
    val progress: Long,
    val target: Long,
    val rewardName: String?,
    val rewardPoints: Long,
) {
    val remaining: Long get() = (target - progress).coerceAtLeast(0L)
    val complete: Boolean get() = progress >= target
}

data class Quote(
    val earnPoints: Long,
    val earnBase: Long,
    val earnMultiplier: Double,
    val redeemAffordable: Boolean?,
    /** Campaigns making this earn bigger than usual — happy hours and the like. */
    val bonuses: List<EarnBonus> = emptyList(),
)

/**
 * A named campaign behind an earn.
 *
 * The engine has always applied these; nothing ever said so. A doubled figure
 * with no explanation beside it looks the same to a customer as a promotion
 * that silently failed to run, and the same to the merchant running it.
 */
data class EarnBonus(
    val name: String,
    /** 2.0 for a double-points hour; null when the rule only adds flat points. */
    val factor: Double?,
    /** Flat points added on top; null for a pure multiplier. */
    val points: Long?,
) {
    /** "2x points" / "+50 points" — trailing zeroes read as precision that isn't there. */
    val label: String
        get() = when {
            factor != null && factor != 1.0 -> {
                val x = if (factor % 1.0 == 0.0) factor.toLong().toString()
                        else factor.toString().trimEnd('0').trimEnd('.')
                "${x}x points"
            }
            points != null && points > 0L -> "+$points points"
            else -> "Applied"
        }
}

/** Server-owned points→money valuation. All surfaces share this exact math. */
data class RedemptionRate(
    val enabled: Boolean,
    val ratePoints: Long,
    val rateValueMinor: Long,
    val minRedeemPoints: Long,
    val maxPercentOfBillBps: Int,
    val roundToMinor: Int,
    val presetsPoints: List<Long>,
    val configured: Boolean,
) {
    /** Mirrors the engine's redemptionValueMinor: floor rate → round down → cap. */
    fun valueMinor(points: Long, amountMinor: Long? = null): Long {
        if (!enabled || ratePoints <= 0 || points <= 0) return 0
        var value = points * rateValueMinor / ratePoints
        val step = maxOf(roundToMinor, 1).toLong()
        value = value / step * step
        if (amountMinor != null && amountMinor >= 0) {
            val cap = amountMinor * maxPercentOfBillBps / 10000
            if (value > cap) value = cap
        }
        return value
    }

    /** Points needed to fund a discount (ceiling), for the "Max" chip. */
    fun pointsForValue(valueMinor: Long): Long =
        if (rateValueMinor <= 0) 0 else (valueMinor * ratePoints + rateValueMinor - 1) / rateValueMinor

    companion object {
        val DEFAULT = RedemptionRate(true, 100, 100, 0, 10000, 1, listOf(500, 1000, 2000), configured = false)
    }
}

data class ServerConfig(
    val brandName: String,
    val currency: String,
    val pointsCode: String,
    val terminalLabel: String?,
    val branchName: String?,
    val redemption: RedemptionRate,
    val raw: String,
)

data class Txn(
    val id: String,
    val intent: String,
    val state: String,
    val points: Long?,
    val amountMinor: Long?,
    val completed: List<CompletedChallenge> = emptyList(),
    val stamps: List<StampCard> = emptyList(),
    val bonuses: List<EarnBonus> = emptyList(),
)

/** A challenge/stamp card the member just completed. */
data class CompletedChallenge(
    val name: String,
    val rewardPoints: Long,
    val badgeName: String?,
    val voucherCode: String?,
)

/** Live stamp-card state, printed on the slip. */
data class StampCard(val name: String, val progress: Int, val target: Int)

data class VoucherRedemption(
    val code: String,
    val rewardName: String,
    val kind: String,
    val discountMinor: Long,
)

/** A reward the identified customer already holds. */
data class AvailableVoucher(
    val code: String,
    val rewardName: String,
    val discountMinor: Long,
)
