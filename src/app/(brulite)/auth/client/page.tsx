import { Card } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { ClientPairConfirm } from "@/components/client-pair-confirm";
import { redirect } from "next/navigation";

export const metadata = { title: "Link BruLite client" };

export default async function ClientAuthPage({
  searchParams,
}: PageProps<"/auth/client">) {
  const { code } = await searchParams;
  const session = await getSession();

  if (typeof code !== "string" || !code) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 sm:px-6">
        <Card className="text-center text-muted">
          Missing pairing code — start the sign-in from inside the BruLite
          client.
        </Card>
      </div>
    );
  }

  if (!session) {
    redirect(`/api/auth/discord?pair=${encodeURIComponent(code)}`);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-24 sm:px-6">
      <Card className="text-center">
        <h1 className="text-xl font-bold">Link your BruLite client</h1>
        <p className="mt-2 text-sm text-muted">
          Authorize this device to sign in as{" "}
          <span className="font-medium text-foreground">{session.username}</span>.
        </p>
        <ClientPairConfirm code={code} />
      </Card>
    </div>
  );
}
