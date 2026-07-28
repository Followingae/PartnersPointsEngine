-- Restores rewards that were marked redeemed by the old till flow without a sale
-- ever completing against them. Under that flow "USE" burned the voucher on tap,
-- so a cashier who backed out cost the customer the reward outright.
--
-- Scoped deliberately: only vouchers whose redemption has no captured terminal
-- transaction for the same membership within two minutes after it. A reward that
-- really was handed over has such a sale and is left alone.

UPDATE voucher v
   SET status = 'issued',
       redeemed_at = NULL
 WHERE v.status = 'redeemed'
   AND v.redeemed_at IS NOT NULL
   AND (v.expires_at IS NULL OR v.expires_at > now())
   AND NOT EXISTS (
         SELECT 1
           FROM terminal_transaction tt
          WHERE tt.membership_id = v.membership_id
            AND tt.state = 'captured'
            AND tt.amount_minor IS NOT NULL
            AND tt.amount_minor > 0
            AND tt.created_at BETWEEN v.redeemed_at AND v.redeemed_at + interval '2 minutes'
       );
