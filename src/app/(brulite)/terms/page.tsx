import { Card, PageHeader } from "@/components/ui";
import { TERMS_VERSION } from "@/lib/terms";

export const metadata = { title: "Terms of Service" };

/**
 * ⚠️ PLACEHOLDER — review with legal counsel before launch. Must cover
 * applicable UK/EU/US consumer and digital-content rights.
 */
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <PageHeader
        title="Terms of Service"
        subtitle={`Version ${TERMS_VERSION} — last updated ${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`}
      />
      <Card className="space-y-6 text-sm leading-relaxed text-muted">
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            1. The service
          </h2>
          <p>
            BruLite provides access to a third-party client for Old School
            RuneScape and related plugins (&quot;the Software&quot;). BruLite
            is not affiliated with or endorsed by Jagex Ltd. A paid membership
            grants you a non-exclusive, non-transferable, revocable licence to
            use the Software for personal use while your membership is active.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            2. Accounts &amp; Discord
          </h2>
          <p>
            Access requires a Discord account and membership of the BruLite
            Discord server. You are responsible for your Discord account. We
            may suspend or terminate access for breach of these terms, abuse of
            the Software, or fraud.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            3. Subscriptions &amp; billing
          </h2>
          <p>
            Memberships are billed in USD via Stripe on a monthly or yearly
            recurring basis until cancelled. You can cancel anytime from your
            Dashboard (Manage Billing); cancellation takes effect at the end of
            the current paid period — access continues until then.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            4. Refunds &amp; chargebacks
          </h2>
          <p>
            Once access has been delivered to your account, purchases are
            non-refundable except where required by applicable consumer law
            (including UK/EU digital-content rights) or where manually
            authorised by BruLite staff. Filing a chargeback or payment
            dispute results in immediate suspension of access while the
            dispute is resolved.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            5. Acceptable use
          </h2>
          <p>
            You may not resell, share, or sublicense your access; reverse
            engineer the licensing system; or use the Software to violate
            Jagex&apos;s rules. Third-party client usage is at your own risk —
            Jagex may action your game account.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            6. Changes
          </h2>
          <p>
            We may update these terms. Material changes will be announced on
            Discord, and continued use (or a required re-acceptance at
            checkout) constitutes acceptance.
          </p>
        </section>
      </Card>
    </div>
  );
}
