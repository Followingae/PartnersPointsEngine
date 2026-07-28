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
    )

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
                if (text.isBlank()) JSONObject() else JSONObject(text)
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
)

data class Quote(
    val earnPoints: Long,
    val earnBase: Long,
    val earnMultiplier: Double,
    val redeemAffordable: Boolean?,
)

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
