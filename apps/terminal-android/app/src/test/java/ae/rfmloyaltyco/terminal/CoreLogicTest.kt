package ae.rfmloyaltyco.terminal

import ae.rfmloyaltyco.terminal.api.RedemptionRate
import ae.rfmloyaltyco.terminal.api.TerminalApi
import ae.rfmloyaltyco.terminal.checkout.CheckoutViewModel
import ae.rfmloyaltyco.terminal.ecr.EcrTransport
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CoreLogicTest {

    @Test
    fun `phone input normalizes to E164 like the backend identifier hashes expect`() {
        assertEquals("+971501234567", TerminalApi.normalizePhone("0501234567"))
        assertEquals("+971501234567", TerminalApi.normalizePhone("971501234567"))
        assertEquals("+971501234567", TerminalApi.normalizePhone("+971 50 123 4567"))
        assertEquals("+971501234567", TerminalApi.normalizePhone("00971501234567"))
        assertEquals("+971501234567", TerminalApi.normalizePhone("501234567"))
    }

    @Test
    fun `ecr order numbers satisfy the 6-24 char SDK contract`() {
        repeat(50) {
            val n = CheckoutViewModel.newOrderNo()
            assertTrue(n.length in 6..24)
            assertTrue(n.all { it.isLetterOrDigit() || it in "_-*" })
        }
    }

    @Test
    fun `redemption valuation mirrors the engine exactly`() {
        // same cases as apps/api/test/terminal.e2e.test.ts — the two implementations must agree
        val rate = RedemptionRate(
            enabled = true, ratePoints = 100, rateValueMinor = 100, minRedeemPoints = 200,
            maxPercentOfBillBps = 5000, roundToMinor = 25, presetsPoints = listOf(500, 1000), configured = true,
        )
        assertEquals(550L, rate.valueMinor(550, 2000))   // AED 5.50, under the 50% cap
        assertEquals(125L, rate.valueMinor(130, 2000))   // AED 1.30 → rounds down to 1.25
        assertEquals(100L, rate.valueMinor(10000, 200))  // capped at 50% of AED 2.00
        assertEquals(0L, RedemptionRate.DEFAULT.copy(enabled = false).valueMinor(1000, 10000))
    }

    @Test
    fun `smartpay response parsing maps trans_status`() {
        val ok = EcrTransport.parseResponse(
            "RFM1",
            """{"trans_status":1,"order_no":"RFM1","card_no":"622848******8866","auth_no":"000123","voucher_no":"000031"}""",
        )
        assertTrue(ok.approved)
        assertEquals("622848******8866", ok.maskedPan)
        assertEquals("000123", ok.authNo)

        val fail = EcrTransport.parseResponse("RFM2", """{"trans_status":2,"error_info":"card declined"}""")
        assertFalse(fail.approved)
        assertEquals("card declined", fail.message)

        val garbage = EcrTransport.parseResponse("RFM3", "not-json")
        assertFalse(garbage.approved)
    }
}
