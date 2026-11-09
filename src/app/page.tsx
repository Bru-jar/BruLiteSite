import type { Metadata } from "next";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { DiscordMark, MatrixBrand } from "@/components/nav";
import { readInviteUrl, startPath } from "@/lib/matrix-web/auth";

export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

const notices = new Map([
  ["not_member", "Join the Matrix Discord server, then sign in with the same account."],
  ["cancelled", "Discord sign-in was cancelled."],
  ["expired", "Your Discord sign-in expired. Please try again."],
  ["failed", "Discord sign-in couldn’t be completed. Please try again."],
  ["unavailable", "Matrix sign-in is currently unavailable."],
  ["signed_out", "You’ve signed out of Matrix."],
  ["signout_failed", "Sign-out couldn’t be completed. Return to the beta and try again."],
]);

export default async function Home({ searchParams }: PageProps<"/">) {
  const { status } = await searchParams;
  const notice = typeof status === "string" ? notices.get(status) : undefined;
  const inviteUrl = readInviteUrl();

  return (
    <div className="site-container flex-1">
      <header className="matrix-launch-header">
        <MatrixBrand />
        <span className="matrix-launch-badge"><span aria-hidden="true" /> Coming soon</span>
      </header>
      <main className="matrix-hero" aria-labelledby="matrix-title">
        <div className="matrix-hero-copy">
          <p className="matrix-eyebrow"><span aria-hidden="true" /> Old School RuneScape</p>
          <h1 id="matrix-title">Mobile <strong>assistance<span>.</span></strong></h1>
          <p className="matrix-intro">Matrix is built for Old School RuneScape on mobile. Follow development and get launch updates in our Discord.</p>
          {notice && <p className="matrix-notice" role="status">{notice}</p>}
          <div className="matrix-actions">
            {inviteUrl && (
              <a className="matrix-cta matrix-cta-primary" href={inviteUrl} target="_blank" rel="noreferrer">
                <DiscordMark className="size-5" /> Join the Matrix Discord <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            )}
            {notice && status !== "signed_out" && (
              <a className="matrix-cta matrix-cta-secondary" href={startPath}>Beta sign-in <ArrowUpRight size={17} aria-hidden="true" /></a>
            )}
          </div>
        </div>
        <figure className="matrix-mascot">
          <Image
            src="/matrix-mascot.webp"
            width={1024}
            height={1024}
            alt="Matrix’s emerald hooded mascot with glowing green eyes"
            sizes="(max-width: 760px) 88vw, (max-width: 1350px) 43vw, 550px"
            loading="eager"
            fetchPriority="high"
          />
        </figure>
      </main>
    </div>
  );
}
