package ae.rfmloyaltyco.terminal

import ae.rfmloyaltyco.terminal.api.TerminalApi
import ae.rfmloyaltyco.terminal.data.HistoryStore
import ae.rfmloyaltyco.terminal.data.OfflineOutbox
import ae.rfmloyaltyco.terminal.data.SettingsStore
import ae.rfmloyaltyco.terminal.ecr.DemoEcrTransport
import ae.rfmloyaltyco.terminal.ecr.EcrTransport
import ae.rfmloyaltyco.terminal.ecr.FeitianEcrTransport
import ae.rfmloyaltyco.terminal.ecr.SmartPayIntentTransport
import ae.rfmloyaltyco.terminal.receipt.ReceiptPrinter
import ae.rfmloyaltyco.terminal.receipt.ReceiptRenderer
import android.app.Application

class TerminalApp : Application() {

    lateinit var settings: SettingsStore
        private set
    lateinit var api: TerminalApi
        private set
    lateinit var history: HistoryStore
        private set
    lateinit var outbox: OfflineOutbox
        private set
    lateinit var receiptRenderer: ReceiptRenderer
        private set

    @Volatile private var ecrTransport: EcrTransport? = null
    @Volatile private var ecrKey: String = ""

    override fun onCreate() {
        super.onCreate()
        settings = SettingsStore(this)
        api = TerminalApi(settings)
        history = HistoryStore(this)
        outbox = OfflineOutbox(this, api)
        receiptRenderer = ReceiptRenderer(this)
    }

    /**
     * Always drive the real thermal printer when the Feitian print service is
     * present — payments in demo mode still print real receipts. Simulation is
     * only the fallback on non-Feitian hardware (handled inside print()).
     */
    fun receiptPrinter(): ReceiptPrinter = ReceiptPrinter(this, demo = false)

    /** ECR transport for the current settings; rebuilt when the ECR config changes. */
    fun ecr(): EcrTransport {
        val cfg = settings.snapshot()
        val key = "${cfg.ecrMode}|${cfg.ecrDevice}"
        val current = ecrTransport
        if (current != null && key == ecrKey) return current
        synchronized(this) {
            val again = ecrTransport
            if (again != null && key == ecrKey) return again
            again?.shutdown()
            val built = when (cfg.ecrMode) {
                "demo" -> DemoEcrTransport()
                // same-device app-to-app (default on all-in-one SmartPOS)
                "intent" -> SmartPayIntentTransport(this)
                // separate-terminal ECR SDK transports
                else -> FeitianEcrTransport(this, cfg.ecrMode, cfg.ecrDevice)
            }
            ecrTransport = built
            ecrKey = key
            return built
        }
    }
}
