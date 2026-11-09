import Image from "next/image";
import { DiscordMark } from "@/components/nav";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  oauth_denied: "Discord sign-in was cancelled.",
  oauth_failed: "Discord sign-in failed — please try again.",
  guild_required:
    "We couldn't add you to the BruLite Discord server. Please try again or join manually first.",
};

export default async function SignInPage({
  searchParams,
}: PageProps<"/auth/signin">) {
  const { error, next, pair } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : null;

  const params = new URLSearchParams();
  if (typeof next === "string") params.set("next", next);
  if (typeof pair === "string") params.set("pair", pair);
  const href = `/api/auth/discord${params.size ? `?${params}` : ""}`;

  return (
    <div className="relative mx-auto flex max-w-md flex-col items-center px-4 py-28 sm:px-6">
      <div className="pointer-events-none absolute -top-10 left-1/2 h-56 w-[28rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
      <div className="gradient-border relative w-full rounded-2xl bg-surface/70 p-8 text-center backdrop-blur-sm">
        <Image
          src="/logo.png"
          alt="BruLite"
          width={64}
          height={64}
          className="mx-auto rounded-xl ring-1 ring-white/15"
        />
        <h1 className="mt-5 text-xl font-bold">Sign in to BruLite</h1>
        <p className="mt-2 text-sm text-muted">
          We use your Discord account — you&apos;ll join the BruLite server
          automatically.
        </p>
        {message && (
          <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {message}
          </p>
        )}
        <a
          href={href}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-primary-bright to-primary px-4 py-2.5 font-medium text-white shadow-lg shadow-primary/30 transition-all hover:brightness-110 active:scale-[0.98]"
        >
          <DiscordMark className="h-5 w-5" />
          Continue with Discord
        </a>
      </div>
    </div>
  );
}
