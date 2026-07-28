package ae.rfmloyaltyco.terminal.ecr

import android.content.Context
import android.util.Log
import com.ftsafe.smartpay.ecr.api.ECRSetting
import com.ftsafe.smartpay.ecr.api.IFtECR
import com.ftsafe.smartpay.ecr.impl.FtECRImpl
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Real SmartPay link via the Feitian ECR SDK (AAR v1.2.2), acting as the ECR
 * (initiator) role. Comm mode comes from settings:
 *
 *  - socket      → COMM_SOCKET client to SmartPay's socket server (127.0.0.1 when
 *                  both apps share the terminal; SmartPay: Settings → ECR)
 *  - serial_usb  → COMM_SERIAL_PORT_USB (docked ECR setups)
 *  - bt4         → COMM_BLUETOOTH4_MASTER (device name in `device`)
 */
class FeitianEcrTransport(
    private val context: Context,
    private val mode: String,
    private val device: String,
) : EcrTransport {

    private val ecr: IFtECR = FtECRImpl.getInstance()
    private val initialized = AtomicBoolean(false)
    @Volatile private var connectedDevice: String? = null

    private val commType: Int
        get() = when (mode) {
            "socket" -> ECRSetting.COMM_SOCKET
            "serial_usb" -> ECRSetting.COMM_SERIAL_PORT_USB
            "bt4" -> ECRSetting.COMM_BLUETOOTH4_MASTER
            else -> ECRSetting.COMM_SOCKET
        }

    override fun isLinked(): Boolean = connectedDevice != null

    override suspend fun connect(): String? = withContext(Dispatchers.IO) {
        if (connectedDevice != null) return@withContext null

        if (initialized.compareAndSet(false, true)) {
            // socket device may be "host:port" — SmartPay's ECR screen shows its port
            if (commType == ECRSetting.COMM_SOCKET) {
                device.substringAfter(':', "").toIntOrNull()?.let { port ->
                    runCatching { ECRSetting.setSocketPort(context.applicationContext, port) }
                }
            }
            val initError = withTimeoutOrNull(INIT_TIMEOUT_MS) {
                suspendCancellableCoroutine { cont ->
                    ecr.initialize(context.applicationContext, commType) { error, data ->
                        if (cont.isActive) {
                            cont.resume(if (error == 0) null else "${EcrTransport.errorMessage(error)} ($data)")
                        }
                    }
                }
            }
            if (initError != null) {
                initialized.set(false)
                return@withContext initError
            }
        }

        val target = when (mode) {
            "serial_usb" -> null // SDK resolves the port itself
            else -> device.substringBefore(':').ifBlank { "127.0.0.1" }
        }
        val result = withTimeoutOrNull(CONNECT_TIMEOUT_MS) {
            suspendCancellableCoroutine { cont ->
                ecr.connect(target) { error, data ->
                    if (cont.isActive) {
                        if (error == 0) {
                            connectedDevice = data ?: target ?: ""
                            cont.resume(null)
                        } else if (error == 70) {
                            connectedDevice = null
                            cont.resume("SmartPay disconnected")
                        } else {
                            cont.resume(EcrTransport.errorMessage(error))
                        }
                    } else {
                        // late connection events keep our link state fresh
                        connectedDevice = if (error == 0) (data ?: target ?: "") else null
                    }
                }
            }
        } ?: "Timed out connecting to SmartPay"
        result
    }

    override suspend fun purchase(amountMinor: Long, orderNo: String): EcrPaymentResult =
        transactionCall(orderNo, PAYMENT_TIMEOUT_MS) { dev, cb -> ecr.purchase(dev, amountMinor, orderNo, cb) }

    override suspend fun refund(amountMinor: Long, orderNo: String, originalOrderNo: String): EcrPaymentResult =
        transactionCall(orderNo, PAYMENT_TIMEOUT_MS) { dev, cb -> ecr.refund(dev, amountMinor, orderNo, originalOrderNo, cb) }

    override suspend fun voidPurchase(orderNo: String, originalOrderNo: String): EcrPaymentResult =
        transactionCall(orderNo, PAYMENT_TIMEOUT_MS) { dev, cb -> ecr.purchaseVoid(dev, orderNo, originalOrderNo, cb) }

    override suspend fun cancel(originalOrderNo: String) {
        val dev = connectedDevice ?: return
        runCatching { ecr.cancel(dev, originalOrderNo) { _, _ -> } }
    }

    private suspend fun transactionCall(
        orderNo: String,
        timeoutMs: Long,
        invoke: (String, IFtECR.ECRResultCallBack) -> Unit,
    ): EcrPaymentResult = withContext(Dispatchers.IO) {
        val linkError = connect()
        if (linkError != null) {
            return@withContext EcrPaymentResult(false, EcrPaymentResult.Status.LINK_ERROR, orderNo, linkError)
        }
        val dev = connectedDevice
            ?: return@withContext EcrPaymentResult(false, EcrPaymentResult.Status.LINK_ERROR, orderNo, "SmartPay not connected")

        withTimeoutOrNull(timeoutMs) {
            suspendCancellableCoroutine { cont ->
                try {
                    val callback = IFtECR.ECRResultCallBack { error, data ->
                        if (!cont.isActive) return@ECRResultCallBack
                        val result = when (error) {
                            0 -> EcrTransport.parseResponse(orderNo, data)
                            0x3004 -> EcrPaymentResult(false, EcrPaymentResult.Status.CANCELLED, orderNo, EcrTransport.errorMessage(error))
                            0x3005 -> EcrPaymentResult(false, EcrPaymentResult.Status.CANCELLED, orderNo, EcrTransport.errorMessage(error))
                            0x3003, 0x0003 -> EcrPaymentResult(false, EcrPaymentResult.Status.TIMEOUT, orderNo, EcrTransport.errorMessage(error))
                            else -> EcrPaymentResult(false, EcrPaymentResult.Status.DECLINED, orderNo, EcrTransport.errorMessage(error), raw = data)
                        }
                        cont.resume(result)
                    }
                    invoke(dev, callback)
                } catch (e: Exception) {
                    Log.e(TAG, "ECR call failed", e)
                    if (cont.isActive) {
                        cont.resume(EcrPaymentResult(false, EcrPaymentResult.Status.LINK_ERROR, orderNo, e.message ?: "ECR call failed"))
                    }
                }
            }
        } ?: EcrPaymentResult(false, EcrPaymentResult.Status.TIMEOUT, orderNo, "No response from SmartPay — check the payment screen")
    }

    override fun shutdown() {
        runCatching {
            connectedDevice?.let { ecr.disconnect(it) }
            ecr.release()
        }
        connectedDevice = null
        initialized.set(false)
    }

    companion object {
        private const val TAG = "FeitianEcr"
        private const val INIT_TIMEOUT_MS = 6_000L
        private const val CONNECT_TIMEOUT_MS = 8_000L

        /** Card present + PIN + processing can legitimately take a while. */
        private const val PAYMENT_TIMEOUT_MS = 120_000L
    }
}
