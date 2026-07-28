package ae.rfmloyaltyco.terminal

import ae.rfmloyaltyco.terminal.checkout.CheckoutViewModel
import ae.rfmloyaltyco.terminal.theme.RfmTerminalTheme
import ae.rfmloyaltyco.terminal.ui.CustomerScreen
import ae.rfmloyaltyco.terminal.ui.HistoryScreen
import ae.rfmloyaltyco.terminal.ui.HomeScreen
import ae.rfmloyaltyco.terminal.ui.PairingScreen
import ae.rfmloyaltyco.terminal.ui.PayingScreen
import ae.rfmloyaltyco.terminal.ui.RefundScreen
import ae.rfmloyaltyco.terminal.ui.ResultScreen
import ae.rfmloyaltyco.terminal.ui.RewardsScreen
import ae.rfmloyaltyco.terminal.ui.SaleScreen
import ae.rfmloyaltyco.terminal.ui.SettingsScreen
import ae.rfmloyaltyco.terminal.ecr.SmartPayIntentBridge
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController

object Routes {
    const val HOME = "home"
    const val SALE = "sale"
    const val CUSTOMER = "customer"
    const val REWARDS = "rewards"
    const val PAYING = "paying"
    const val RESULT = "result"
    const val BALANCE = "balance"
    const val REFUND = "refund"
    const val HISTORY = "history"
    const val SETTINGS = "settings"
    const val PAIRING = "pairing"
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            RfmTerminalTheme {
                val nav = rememberNavController()
                val checkout: CheckoutViewModel = viewModel()
                val state by checkout.state.collectAsStateWithLifecycle()
                val app = application as TerminalApp

                // App-to-app SmartPay: the Activity owns the result launcher; the
                // bridge marshals transport requests here and awaits the outcome.
                val payLauncher = rememberLauncherForActivityResult(
                    ActivityResultContracts.StartActivityForResult(),
                ) { res -> SmartPayIntentBridge.deliver(res.resultCode, res.data) }

                LaunchedEffect(Unit) {
                    SmartPayIntentBridge.launchRequests.collect { intent ->
                        runCatching { payLauncher.launch(intent) }
                            .onFailure { SmartPayIntentBridge.deliverFailure(it.message ?: "Could not open SmartPay") }
                    }
                }

                // saga-driven navigation: paying + outcome screens follow the state machine
                LaunchedEffect(state.paying, state.outcome) {
                    val here = nav.currentDestination?.route
                    if (state.paying && here != Routes.PAYING) nav.navigate(Routes.PAYING)
                    if (!state.paying && state.outcome != null && here != Routes.RESULT) {
                        nav.navigate(Routes.RESULT) { popUpTo(Routes.HOME) }
                    }
                    if (!state.paying && state.outcome == null && here == Routes.PAYING) nav.popBackStack()
                }

                NavHost(navController = nav, startDestination = Routes.HOME) {
                    composable(Routes.HOME) {
                        HomeScreen(
                            app = app,
                            onNewSale = { checkout.resetSale(); nav.navigate(Routes.SALE) },
                            onBalanceCheck = { nav.navigate(Routes.BALANCE) },
                            onRefund = { nav.navigate(Routes.REFUND) },
                            onHistory = { nav.navigate(Routes.HISTORY) },
                            onSettings = { nav.navigate(Routes.SETTINGS) },
                            onPair = { nav.navigate(Routes.PAIRING) },
                        )
                    }
                    composable(Routes.SALE) {
                        SaleScreen(
                            vm = checkout,
                            onBack = { nav.popBackStack() },
                            onNext = { nav.navigate(Routes.CUSTOMER) },
                        )
                    }
                    composable(Routes.CUSTOMER) {
                        CustomerScreen(
                            vm = checkout,
                            mode = CustomerScreen_Mode_CHECKOUT,
                            onBack = { nav.popBackStack() },
                            onProceed = { nav.navigate(Routes.REWARDS) },
                            onSkip = { checkout.clearMember(); nav.navigate(Routes.REWARDS) },
                        )
                    }
                    composable(Routes.REWARDS) {
                        RewardsScreen(vm = checkout, onBack = { nav.popBackStack() })
                    }
                    composable(Routes.PAYING) {
                        PayingScreen(vm = checkout)
                    }
                    composable(Routes.RESULT) {
                        ResultScreen(
                            vm = checkout,
                            app = app,
                            onDone = { success ->
                                checkout.dismissOutcome(success)
                                if (success) {
                                    nav.popBackStack(Routes.HOME, inclusive = false)
                                } else {
                                    nav.popBackStack() // back to rewards for retry
                                }
                            },
                        )
                    }
                    composable(Routes.BALANCE) {
                        CustomerScreen(
                            vm = checkout,
                            mode = CustomerScreen_Mode_BALANCE,
                            onBack = { checkout.clearMember(); nav.popBackStack() },
                            onProceed = {},
                            onSkip = { checkout.clearMember(); nav.popBackStack() },
                        )
                    }
                    composable(Routes.REFUND) {
                        RefundScreen(app = app, onBack = { nav.popBackStack() })
                    }
                    composable(Routes.HISTORY) {
                        HistoryScreen(app = app, onBack = { nav.popBackStack() })
                    }
                    composable(Routes.SETTINGS) {
                        SettingsScreen(app = app, onBack = { nav.popBackStack() }, onRepair = { nav.navigate(Routes.PAIRING) })
                    }
                    composable(Routes.PAIRING) {
                        PairingScreen(app = app, onDone = { nav.popBackStack(Routes.HOME, inclusive = false) })
                    }
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (isFinishing) (application as TerminalApp).ecr().shutdown()
    }
}

const val CustomerScreen_Mode_CHECKOUT = "checkout"
const val CustomerScreen_Mode_BALANCE = "balance"
