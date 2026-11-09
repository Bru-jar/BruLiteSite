import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { readInviteUrl } from "@/lib/matrix-web/auth";
import { MatrixFrame } from "./matrix-frame";

const messages = new Map([
  ["not_member", "Join the Matrix Discord server, then return here and sign in with the same account."],
  ["cancelled", "Discord sign-in was cancelled. You can try again when you’re ready."],
  ["expired", "This sign-in request expired or was invalid. Start again below."],
  ["failed", "Discord sign-in couldn’t be completed. Please try again."],
  ["unavailable", "Matrix sign-in is currently unavailable."],
  ["signed_out", "You’ve signed out of Matrix."],
  ["signout_failed", "Sign-out couldn’t be completed. Return to the beta and try again."],
]);

function DiscordMark() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.3 5.2a19.5 19.5 0 0 0-4.8-1.5l-.6 1.2a18 18 0 0 0-5.8 0l-.6-1.2a19.5 19.5 0 0 0-4.8 1.5C.7 9.6-.1 13.9.3 18.1a20 20 0 0 0 5.9 3l1.2-1.9-1.8-.9.4-.3c3.8 1.8 8.2 1.8 12 0l.4.3-1.8.9 1.2 1.9a20 20 0 0 0 5.9-3c.5-4.9-.9-9.2-3.4-12.9ZM8 15.5c-1.2 0-2.1-1.1-2.1-2.4 0-1.3.9-2.4 2.1-2.4 1.2 0 2.2 1.1 2.1 2.4 0 1.3-.9 2.4-2.1 2.4Zm8 0c-1.2 0-2.1-1.1-2.1-2.4 0-1.3.9-2.4 2.1-2.4 1.2 0 2.2 1.1 2.1 2.4 0 1.3-.9 2.4-2.1 2.4Z" />
    </svg>
  );
}

export default async function MatrixLanding({ searchParams }: PageProps<"/matrix">) {
  const { status } = await searchParams;
  const notice = typeof status === "string" ? messages.get(status) : undefined;
  const inviteUrl = readInviteUrl();
  const showJoinAction = status === "not_member" && inviteUrl;
  return (
    <MatrixFrame rain>
      <section className="matrix-hero">
        <div className="matrix-kicker"><span aria-hidden="true" /> Private access</div>
        <h1>Enter the<br /><strong>Matrix<span>.</span></strong></h1>
        <p className="matrix-intro">The beta is open to members of the Matrix Discord server. Sign in with Discord to enter.</p>
        {notice && <p className="matrix-notice" role="status">{notice}</p>}
        <div className="matrix-actions">
          {showJoinAction && (
            <a className="matrix-button" href={inviteUrl} target="_blank" rel="noreferrer">
              <DiscordMark /> Join the Discord server <ArrowUpRight aria-hidden="true" size={17} />
            </a>
          )}
          <a className={showJoinAction ? "matrix-button matrix-button-quiet" : "matrix-button"} href="/matrix/oauth/start">
            <DiscordMark /> Sign in with Discord <ArrowUpRight aria-hidden="true" size={17} />
          </a>
        </div>
        {!showJoinAction && (
          <p className="matrix-access-note">
            <LockKeyhole aria-hidden="true" size={14} />
            {inviteUrl ? (
              <a href={inviteUrl} target="_blank" rel="noreferrer">Join the Discord server</a>
            ) : "Discord server membership required"}
          </p>
        )}
      </section>
    </MatrixFrame>
  );
}
