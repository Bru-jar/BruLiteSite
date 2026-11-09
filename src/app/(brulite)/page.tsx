import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, ArrowUpRight, Layers3, LifeBuoy, LockKeyhole, WalletCards } from "lucide-react";
import { CodeRain } from "@/components/code-rain";
import { DiscordMark } from "@/components/nav";
import { betaPath, readBetaAccess, readInviteUrl, readWebConfig, sessionCookie, startPath } from "@/lib/matrix-web/auth";

const notices = new Map([
  ["not_member", "Join the Matrix Discord server, then sign in with the same account."],
  ["cancelled", "Discord sign-in was cancelled. You can try again when you’re ready."],
  ["expired", "This sign-in request expired or was invalid. Start again below."],
  ["failed", "Discord sign-in couldn’t be completed. Please try again."],
  ["unavailable", "Matrix sign-in is currently unavailable."],
  ["signed_out", "You’ve signed out of Matrix."],
  ["signout_failed", "Sign-out couldn’t be completed. Return to the beta and try again."],
]);

const sections = [
  { href: "/plugins", label: "Plugins", description: "Explore the tools included with membership.", Icon: Layers3 },
  { href: "/pricing", label: "Membership", description: "Compare monthly and yearly plans.", Icon: WalletCards },
  { href: "/support", label: "Support", description: "Report an issue or request a feature.", Icon: LifeBuoy },
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const [{ status }, cookieStore] = await Promise.all([searchParams, cookies()]);
  const token = cookieStore.get(sessionCookie)?.value;
  const config = token ? readWebConfig() : null;
  const access = config && token ? await readBetaAccess(config, token) : null;
  const notice = typeof status === "string" ? notices.get(status) : undefined;
  const inviteUrl = readInviteUrl();
  const joinFirst = status === "not_member" && inviteUrl;

  return (
    <div className="matrix-home">
      <section id="access" className="matrix-hero site-container" aria-labelledby="matrix-title">
        <div className="matrix-hero-copy">
          <p className="matrix-eyebrow"><span aria-hidden="true" /> Old School RuneScape client</p>
          <h1 id="matrix-title">Enter the <strong>Matrix<span>.</span></strong></h1>
          <p className="matrix-intro">A client built around plugins. Sign in with your Discord account to access the Matrix beta.</p>
          {notice && <p className="matrix-notice" role="status">{notice}</p>}
          <div className="matrix-actions">
            {joinFirst && (
              <a className="matrix-cta matrix-cta-primary" href={inviteUrl} target="_blank" rel="noreferrer">
                Join the Discord server <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            )}
            {access?.status === "member" ? (
              <Link className="matrix-cta matrix-cta-primary" href={betaPath} prefetch={false}>
                Open the beta <ArrowRight size={17} aria-hidden="true" />
              </Link>
            ) : (
              <a className={joinFirst ? "matrix-cta matrix-cta-secondary" : "matrix-cta matrix-cta-primary"} href={startPath}>
                <DiscordMark className="size-5" /> Sign in with Discord <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            )}
            {!joinFirst && <Link href="/plugins" className="matrix-cta matrix-cta-secondary">Explore plugins</Link>}
          </div>
          {!joinFirst && (
            <p className="matrix-access-note">
              <LockKeyhole size={14} aria-hidden="true" /> Discord membership required for the beta
              {inviteUrl && <a href={inviteUrl} target="_blank" rel="noreferrer">Join Discord <ArrowUpRight size={12} aria-hidden="true" /></a>}
            </p>
          )}
        </div>
        <CodeRain />
      </section>
      <section className="matrix-directory site-container" aria-label="Explore Matrix">
        {sections.map(({ href, label, description, Icon }) => (
          <Link key={href} href={href} className="matrix-directory-link">
            <Icon size={21} aria-hidden="true" className="matrix-directory-icon" />
            <span><strong>{label}</strong><span>{description}</span></span>
            <ArrowUpRight size={16} aria-hidden="true" className="matrix-directory-arrow" />
          </Link>
        ))}
      </section>
    </div>
  );
}
