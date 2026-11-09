import type { NextRequest } from "next/server";
import { readWebConfig } from "@/lib/matrix-web/auth";
import { startOAuth } from "@/lib/matrix-web/routes";

export function GET(request: NextRequest) {
  return startOAuth(request, readWebConfig());
}
