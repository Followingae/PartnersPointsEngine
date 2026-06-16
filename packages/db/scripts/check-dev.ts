/** Polls the dev DB until the seed has run, then prints a quick summary. */
import { Client } from 'pg';

const URL = 'postgresql://postgres:postgres@localhost:5432/postgres';

async function main(): Promise<void> {
  const deadline = Date.now() + 90_000;
  for (;;) {
    try {
      const c = new Client({ connectionString: URL });
      await c.connect();
      const members = await c.query('SELECT count(*)::int AS n FROM customer_membership');
      if (members.rows[0].n > 0) {
        const brands = await c.query('SELECT count(*)::int AS n FROM brand');
        const journals = await c.query('SELECT count(*)::int AS n FROM journal');
        const liability = await c.query(
          "SELECT coalesce(sum(posted_credits-posted_debits-pending_debits),0)::bigint AS n FROM account_balance ab JOIN ledger_account la ON la.id=ab.account_id WHERE la.account_type='points_liability'",
        );
        console.log('DEV DB READY:', {
          brands: brands.rows[0].n,
          members: members.rows[0].n,
          journals: journals.rows[0].n,
          pointsLiability: String(liability.rows[0].n),
        });
        await c.end();
        return;
      }
      await c.end();
    } catch {
      // not ready yet
    }
    if (Date.now() > deadline) throw new Error('dev DB did not become ready in time');
    await new Promise((r) => setTimeout(r, 2000));
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
