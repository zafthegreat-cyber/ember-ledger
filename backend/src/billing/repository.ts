import type { Pool, PoolClient } from "pg";
import type { AuthPrincipal } from "../auth/authPrincipal";
import { BillingError } from "./config";

export type BillingAccount = { id: string; customer_id: string | null; adult_approved: boolean };
export type BillingGrant = { source: string; entitlement: string; validUntil: number | null };

export interface BillingTransaction {
  account: BillingAccount;
  setCustomer(id: string): Promise<void>;
  seen(eventId: string): Promise<boolean>;
  record(eventId: string, eventType: string): Promise<void>;
  replaceSubscriptions(grants: BillingGrant[]): Promise<void>;
  grantPurchase(grant: BillingGrant): Promise<void>;
  revokePurchase(source: string): Promise<void>;
  grants(): Promise<BillingGrant[]>;
}

export interface BillingRepository {
  forPrincipal<T>(principal: AuthPrincipal, work: (tx: BillingTransaction) => Promise<T>): Promise<T>;
  forCustomer<T>(customerId: string, work: (tx: BillingTransaction) => Promise<T>): Promise<T | null>;
}

/** Private Postgres schema; browsers never receive DB access or write entitlements. */
export function createBillingRepository(pool: Pool): BillingRepository {
  function transaction(client: PoolClient, account: BillingAccount): BillingTransaction {
    return {
      account,
      async setCustomer(id) {
        await client.query("update code3_billing.accounts set customer_id=$2 where id=$1", [account.id, id]);
        account.customer_id = id;
      },
      async seen(id) { return Boolean((await client.query("select 1 from code3_billing.events where event_id=$1", [id])).rowCount); },
      async record(id, type) {
        await client.query("insert into code3_billing.events(event_id,event_type,account_id) values($1,$2,$3)", [id, type, account.id]);
      },
      async replaceSubscriptions(grants) {
        await client.query("delete from code3_billing.grants where account_id=$1 and kind='subscription'", [account.id]);
        for (const grant of grants) {
          await client.query("insert into code3_billing.grants(account_id,source,entitlement,kind,valid_until) values($1,$2,$3,'subscription',to_timestamp($4))", [account.id, grant.source, grant.entitlement, grant.validUntil]);
        }
      },
      async grantPurchase(grant) {
        await client.query("insert into code3_billing.grants(account_id,source,entitlement,kind) values($1,$2,$3,'purchase') on conflict(account_id,source,entitlement) do nothing", [account.id, grant.source, grant.entitlement]);
      },
      async revokePurchase(source) { await client.query("delete from code3_billing.grants where account_id=$1 and source=$2 and kind='purchase'", [account.id, source]); },
      async grants() {
        const result = await client.query("select source,entitlement,extract(epoch from valid_until)::float8 as \"validUntil\" from code3_billing.grants where account_id=$1 and (valid_until is null or valid_until>now()) order by entitlement", [account.id]);
        return result.rows;
      },
    };
  }
  async function run<T>(query: string, values: string[], work: (tx: BillingTransaction) => Promise<T>): Promise<T | null> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      // The row lock serializes checkout creation and webhook synchronization for this customer.
      const result = await client.query<BillingAccount>(query, values);
      const value = result.rows[0] ? await work(transaction(client, result.rows[0])) : null;
      await client.query("commit");
      return value;
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  }
  return {
    async forPrincipal(principal, work) {
      const result = await run("select id,customer_id,adult_approved from code3_billing.accounts where provider=$1 and subject=$2 for update", [principal.provider, principal.subject], work);
      if (result === null) throw new BillingError("billing_enrollment_required", 403, "An approved adult billing account is required for sandbox purchases.");
      return result;
    },
    forCustomer(customer, work) {
      return run("select id,customer_id,adult_approved from code3_billing.accounts where customer_id=$1 for update", [customer], work);
    },
  };
}
