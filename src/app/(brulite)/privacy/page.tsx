import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Privacy Policy" };

/** ⚠️ PLACEHOLDER — review before launch. */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <PageHeader title="Privacy Policy" />
      <Card className="space-y-6 text-sm leading-relaxed text-muted">
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            What we collect
          </h2>
          <p>
            When you sign in with Discord we store your Discord user ID,
            username, avatar, and email (if provided). When you purchase, Stripe
            processes your payment details — we never see or store card numbers.
            We store your subscription status, support tickets you submit, and
            Terms of Service acceptance records (including IP address).
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            How we use it
          </h2>
          <p>
            To verify your identity, manage your membership and client access,
            provide support, and fulfil legal obligations. We do not sell your
            data.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Third parties
          </h2>
          <p>
            Discord (authentication &amp; community), Stripe (payments), Neon
            (database), Vercel (hosting). Each processes data under their own
            policies.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Contact &amp; removal
          </h2>
          <p>
            Contact us on the Discord server to request a copy or deletion of
            your data, subject to our legal retention obligations (e.g.
            payment/dispute records).
          </p>
        </section>
      </Card>
    </div>
  );
}
