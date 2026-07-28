-- Rewards carried an empty payload, so every voucher redeemed at the till took
-- AED 0.00 off the bill. createCatalogItem never accepted a value; this backfills
-- the existing catalogue by recovering the amount from unambiguous names
-- ("AED 20 Voucher" -> 2000 minor units), matching rewardPayload() in the API.
-- Item-style rewards (Free Coffee) intentionally keep no amount: the cashier
-- hands over the item rather than discounting a sum.

update reward_catalog_item
   set payload = jsonb_build_object(
         'discountMinor',
         (round(
            substring(name from '(?:[Aa][Ee][Dd]|[Dd][Hh][Ss]?)[[:space:]]*([0-9]+(\.[0-9]{1,2})?)')::numeric
            * 100))::int,
         'inferredFromName', true),
       updated_at = now()
 where kind in ('voucher', 'discount')
   and (payload->>'discountMinor') is null
   and substring(name from '(?:[Aa][Ee][Dd]|[Dd][Hh][Ss]?)[[:space:]]*([0-9]+(\.[0-9]{1,2})?)') is not null;
