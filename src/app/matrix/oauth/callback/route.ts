import type { NextRequest } from "next/server";
import { readWebConfig } from "@/lib/matrix-web/auth";
import { finishOAuth } from "@/lib/matrix-web/routes";

export function GET(request: NextRequest) {
  return finishOAuth(request, readWebConfig());
}
