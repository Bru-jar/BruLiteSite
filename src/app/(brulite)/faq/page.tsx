import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { FaqAccordion } from "@/components/faq-accordion";
import { Reveal } from "@/components/reveal";
import { getSession } from "@/lib/auth";

export const metadata = { title: "FAQ" };
export const dynamic = "force-dynamic";

const faqs = [
  {
    q: "How do I get access to BruLite?",
    a: "Sign in with your Discord account (you'll automatically join our server), pick a membership on the Pricing page, and download the client from your Dashboard.",
  },
  {
    q: "How does the client verify my membership?",
    a: "When you launch BruLite it opens your browser to link with your Discord account. The client receives a short-lived token and checks your membership against our API — the Discord role alone doesn't grant access.",
  },
  {
    q: "Can I cancel my subscription?",
    a: "Yes, anytime from your Dashboard via Manage Billing. Your access continues until the end of the paid billing period.",
  },
  {
    q: "What happens if my payment fails?",
    a: "Your subscription enters a past-due state and Stripe retries the payment. Access continues until the paid period ends; keep an eye on your billing emails.",
  },
  {
    q: "What is the refund policy?",
    a: "Once you've received access, purchases are generally non-refundable except where required by law or authorised by staff. See the Terms of Service for full details including digital-content rights.",
  },
  {
    q: "Is BruLite affiliated with Jagex?",
    a: "No. BruLite is a third-party client and is not affiliated with or endorsed by Jagex Ltd. Use of third-party clients is at your own risk.",
  },
  {
    q: "Where do I report a bug or request a feature?",
    a: "Use the Support page after signing in — tickets go straight to the team via Discord.",
  },
];

export default async function FaqPage() {
  const session = await getSession();

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <PageHeader
        centered
        eyebrow="Support"
        title="Frequently asked questions"
        subtitle="Everything about membership, the client, and how support works."
      />
      <Reveal>
        <FaqAccordion items={faqs} />
      </Reveal>

      <Reveal delay={150}>
        <Card className="mt-10 flex flex-col items-center gap-3 py-8 text-center">
          <p className="font-medium">Still stuck?</p>
          <p className="max-w-md text-sm text-muted">
            Open a ticket and it lands straight in our Discord — attach a
            screenshot and the team can reply in the thread.
          </p>
          <Link
            href={session ? "/support" : "/api/auth/discord?next=/support"}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-gradient-to-b from-primary-bright to-primary px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-primary/30 transition-all hover:brightness-110"
          >
            {session ? "Go to Support" : "Sign in to open a ticket"}{" "}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      </Reveal>
    </div>
  );
}
