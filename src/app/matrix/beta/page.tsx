import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Check, LogOut } from "lucide-react";
import { readBetaAccess, readWebConfig, sessionCookie } from "@/lib/matrix-web/auth";
import { MatrixFrame } from "../matrix-frame";

export default async function MatrixBeta() {
  const config = readWebConfig();
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!config || !token) redirect("/matrix");

  const access = await readBetaAccess(config, token);
  if (access.status === "signed_out") redirect("/matrix");
  if (access.status !== "member") redirect("/matrix?status=" + access.status);

  return (
    <MatrixFrame>
      <section className="matrix-beta">
        <div className="matrix-kicker"><span aria-hidden="true" /> Private workspace</div>
        <h1>Matrix beta<span>.</span></h1>
        <p className="matrix-intro">Welcome, {access.session.displayName}.</p>
        <div className="matrix-account">
          <div className="matrix-account-icon"><Check aria-hidden="true" size={23} /></div>
          <div>
            <h2>Beta access confirmed</h2>
            <p>You’re signed in as a member of the Matrix Discord server.</p>
          </div>
        </div>
        <form action="/matrix/signout" method="post">
          <button className="matrix-button matrix-button-quiet" type="submit">
            <LogOut aria-hidden="true" size={17} /> Sign out
          </button>
        </form>
      </section>
    </MatrixFrame>
  );
}
