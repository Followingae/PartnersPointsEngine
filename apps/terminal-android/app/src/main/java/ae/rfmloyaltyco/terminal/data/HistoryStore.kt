package ae.rfmloyaltyco.terminal.data

import android.content.Context
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject

/** One completed (or attempted) sale as the cashier sees it. */
data class TxnRecord(
    val localId: String,
    val at: Long,
    val kind: String, // sale | refund | void
    val grossMinor: Long,
    val netMinor: Long,
    val redeemPoints: Long,
    val earnPoints: Long,
    val memberName: String?,
    val memberPhone: String?,
    val ecrOrderNo: String,
    val originalOrderNo: String? = null,
    val paymentMethod: String, // card | cash
    val maskedPan: String? = null,
    val authNo: String? = null,
    val status: String, // approved | declined | cancelled | failed | pending_sync
    val loyaltyEarnTxnId: String? = null,
    val loyaltyRedeemTxnId: String? = null,
    val note: String? = null,
    val eReceiptToken: String? = null,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("localId", localId).put("at", at).put("kind", kind)
        .put("grossMinor", grossMinor).put("netMinor", netMinor)
        .put("redeemPoints", redeemPoints).put("earnPoints", earnPoints)
        .put("memberName", memberName).put("memberPhone", memberPhone)
        .put("ecrOrderNo", ecrOrderNo).put("originalOrderNo", originalOrderNo)
        .put("paymentMethod", paymentMethod).put("maskedPan", maskedPan)
        .put("authNo", authNo).put("status", status)
        .put("loyaltyEarnTxnId", loyaltyEarnTxnId).put("loyaltyRedeemTxnId", loyaltyRedeemTxnId)
        .put("note", note).put("eReceiptToken", eReceiptToken)

    companion object {
        fun fromJson(j: JSONObject): TxnRecord = TxnRecord(
            localId = j.getString("localId"),
            at = j.getLong("at"),
            kind = j.optString("kind", "sale"),
            grossMinor = j.optLong("grossMinor"),
            netMinor = j.optLong("netMinor"),
            redeemPoints = j.optLong("redeemPoints"),
            earnPoints = j.optLong("earnPoints"),
            memberName = j.optString("memberName").ifBlank { null },
            memberPhone = j.optString("memberPhone").ifBlank { null },
            ecrOrderNo = j.optString("ecrOrderNo"),
            originalOrderNo = j.optString("originalOrderNo").ifBlank { null },
            paymentMethod = j.optString("paymentMethod", "card"),
            maskedPan = j.optString("maskedPan").ifBlank { null },
            authNo = j.optString("authNo").ifBlank { null },
            status = j.optString("status", "approved"),
            loyaltyEarnTxnId = j.optString("loyaltyEarnTxnId").ifBlank { null },
            loyaltyRedeemTxnId = j.optString("loyaltyRedeemTxnId").ifBlank { null },
            note = j.optString("note").ifBlank { null },
            eReceiptToken = j.optString("eReceiptToken").ifBlank { null },
        )
    }
}

/** Local receipt journal (newest first, capped). Backed by a JSON file. */
class HistoryStore(context: Context) {

    private val file = File(context.filesDir, "txn_history.json")
    private val _records = MutableStateFlow(load())
    val records: StateFlow<List<TxnRecord>> = _records

    @Synchronized
    fun add(record: TxnRecord) {
        val next = (listOf(record) + _records.value).take(MAX)
        _records.value = next
        persist(next)
    }

    @Synchronized
    fun update(localId: String, mutate: (TxnRecord) -> TxnRecord) {
        val next = _records.value.map { if (it.localId == localId) mutate(it) else it }
        _records.value = next
        persist(next)
    }

    fun find(localId: String): TxnRecord? = _records.value.firstOrNull { it.localId == localId }

    private fun load(): List<TxnRecord> = try {
        if (!file.exists()) emptyList()
        else {
            val arr = JSONArray(file.readText())
            (0 until arr.length()).map { TxnRecord.fromJson(arr.getJSONObject(it)) }
        }
    } catch (_: Exception) {
        emptyList()
    }

    private fun persist(records: List<TxnRecord>) {
        try {
            val arr = JSONArray()
            records.forEach { arr.put(it.toJson()) }
            file.writeText(arr.toString())
        } catch (_: Exception) {
            // history is best-effort; never crash a sale over it
        }
    }

    companion object {
        private const val MAX = 300
    }
}
