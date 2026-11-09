import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowUpRight, Check, LogOut } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { landingPath, readBetaAccess, readWebConfig, sessionCookie, signOutPath, startPath } from "@/lib/matrix-web/auth";

export const metadata = { title: "Beta workspace", robots: { index: false, follow: false } };

export default async function MatrixBeta() {
  const config = readWebConfig();
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!config) redirect(landingPath);
  if (!token) redirect(startPath);

  const access = await readBetaAccess(config, token);
  if (access.status === "signed_out") redirect(startPath);
  if (access.status !== "member") redirect(landingPath + "?status=" + access.status);

  return (
    <section className="site-container py-16 sm:py-24">
      <p className="matrix-eyebrow"><span aria-hidden="true" /> Private workspace</p>
      <h1 className="mt-4 text-5xl font-semibold tracking-tighter sm:text-7xl">Matrix beta<span className="text-accent">.</span></h1>
      <p className="mt-5 max-w-xl break-words text-lg text-muted">Welcome, {access.session.displayName}.</p>
      <Card className="mt-9 flex max-w-xl items-center gap-4 border-primary/25">
        <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/15 text-accent"><Check aria-hidden="true" size={22} /></div>
        <div>
          <h2 className="font-semibold">Beta access confirmed</h2>
          <p className="mt-1 text-sm text-muted">You’re signed in as a member of the Matrix Discord server.</p>
        </div>
      </Card>
      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Link href="/dashboard" className="matrix-cta matrix-cta-secondary">Membership dashboard <ArrowUpRight size={16} aria-hidden="true" /></Link>
        <form action={signOutPath} method="post">
          <Button variant="ghost" type="submit"><LogOut aria-hidden="true" size={17} /> Sign out of beta</Button>
        </form>
      </div>
    </section>
  );
}
