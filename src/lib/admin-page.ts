import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
export async function requireAdminPage() {
  try {
    return await requireAdmin();
  } catch {
    redirect("/dashboard");
  }
}
