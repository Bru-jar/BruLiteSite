import type { NextRequest } from "next/server";
import { readWebConfig } from "@/lib/matrix-web/auth";
import { signOut } from "@/lib/matrix-web/routes";

export function POST(request: NextRequest) {
  return signOut(request, readWebConfig());
}
