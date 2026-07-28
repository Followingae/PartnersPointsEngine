package ae.rfmloyaltyco.terminal.data

import ae.rfmloyaltyco.terminal.api.TerminalApi
import android.content.Context
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject

/**
 * Store-and-forward queue for loyalty ops that could not reach the API at sale
 * time (network blip after an approved payment, or an offline earn).
 *
 * Member tokens are short-lived, so each queued op stores the raw identifier and
 * is replayed as resolve → transaction with its ORIGINAL idempotency key — the
 * server dedupes, so replays are safe. Redemptions are never queued (holds need
 * the live ledger).
 */
class OfflineOutbox(context: Context, private val api: TerminalApi) {

    private val file = File(context.filesDir, "outbox.json")
    private val _pending = MutableStateFlow(load())
    val pending: StateFlow<List<JSONObject>> = _pending

    @Synchronized
    fun enqueueEarn(identifierType: String, identifierValue: String, amountMinor: Long, idempotencyKey: String, sourceEvent: String) {
        val op = JSONObject()
            .put("identifierType", identifierType)
            .put("identifierValue", identifierValue)
            .put("amountMinor", amountMinor)
            .put("idempotencyKey", idempotencyKey)
            .put("sourceEvent", sourceEvent)
            .put("queuedAt", System.currentTimeMillis())
        val next = _pending.value + op
        _pending.value = next
        persist(next)
    }

    /** Replays everything replayable; keeps ops that still fail with network errors. */
    suspend fun replayAll(): Int {
        val current = _pending.value
        if (current.isEmpty()) return 0
        val remaining = mutableListOf<JSONObject>()
        var replayed = 0
        for (op in current) {
            try {
                val token = api.resolve(op.getString("identifierType"), op.getString("identifierValue"))
                api.earn(
                    memberToken = token,
                    amountMinor = op.getLong("amountMinor"),
                    idempotencyKey = op.getString("idempotencyKey"),
                    sourceEvent = op.optString("sourceEvent", "offline-replay"),
                )
                replayed++
            } catch (e: TerminalApi.ApiException) {
                // 4xx = permanently unprocessable (unknown member, bad request) — drop it,
                // the idempotency key preserves auditability server-side if it ever landed.
                if (e.status in 500..599) remaining.add(op) else replayed++
            } catch (_: Exception) {
                remaining.add(op) // still offline
            }
        }
        synchronized(this) {
            // ops queued while we were replaying stay in the queue
            val queuedMeanwhile = _pending.value.filter { p -> current.none { it.getString("idempotencyKey") == p.getString("idempotencyKey") } }
            val next = remaining + queuedMeanwhile
            _pending.value = next
            persist(next)
        }
        return replayed
    }

    private fun load(): List<JSONObject> = try {
        if (!file.exists()) emptyList()
        else {
            val arr = JSONArray(file.readText())
            (0 until arr.length()).map { arr.getJSONObject(it) }
        }
    } catch (_: Exception) {
        emptyList()
    }

    private fun persist(ops: List<JSONObject>) {
        try {
            val arr = JSONArray()
            ops.forEach { arr.put(it) }
            file.writeText(arr.toString())
        } catch (_: Exception) {
        }
    }
}
