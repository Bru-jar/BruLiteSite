import type { WebConfig } from "./auth";

export const discord = "https://discord.com";

export function isDiscordId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{16,19}$/.test(value);
}

export function discordRequest(path: string, options: RequestInit) {
  return fetch(discord + "/api/v10" + path, {
    ...options, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
  });
}

export async function guildMembership(
  config: Pick<WebConfig, "guildId" | "botToken">,
  discordId: string,
  request = discordRequest,
) {
  if (!isDiscordId(discordId)) return "unavailable";
  try {
    const response = await request(`/guilds/${config.guildId}/members/${discordId}`, {
      headers: { Authorization: "Bot " + config.botToken },
    });
    if (response.status === 404) {
      return (await response.json())?.code === 10007 ? "not_member" : "unavailable";
    }
    await response.body?.cancel();
    return response.status === 200 ? "member" : "unavailable";
  } catch {
    return "unavailable";
  }
}
