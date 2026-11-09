# Matrix website closed beta

The public landing is at `/matrix`. Any member of the configured Discord server can sign in. The server checks the browser session and current Discord membership before rendering `/matrix/beta`. Visitors outside the server see an invite and can return to sign in after joining. BruLite pages keep their existing URLs. The installed Matrix launcher still uses `/api/matrix/auth/*`.

## Preview setup

1. Choose one stable preview origin. Use an HTTPS origin for Vercel or `http://localhost:3000` for local development. For Vercel, scope the following values to the preview environment and its review branch. The selected origin must be reachable by reviewers and accept browser navigation to the OAuth callback.
2. Run [matrix-web.sql](../scripts/matrix-web.sql) against the isolated preview Neon database. Grant the runtime database role schema usage and select, insert, and delete on `matrix_web.sessions` if it differs from the schema owner.
3. Install or select a bot already in the Matrix Discord server, then set the server variables below. Matrix web uses the bot to look up individual members. Use a stable Discord invite for that same server.

   | Variable | Value |
   | --- | --- |
   | `MATRIX_WEB_ORIGIN` | Exact preview origin |
   | `MATRIX_WEB_DISCORD_CLIENT_ID` | OAuth client ID for Matrix web. The existing Matrix Discord app can be used. |
   | `MATRIX_WEB_DISCORD_CLIENT_SECRET` | The matching OAuth client secret, stored as a sensitive variable |
   | `MATRIX_WEB_DISCORD_GUILD_ID` | ID of the Matrix Discord server |
   | `MATRIX_WEB_DISCORD_BOT_TOKEN` | Token for the bot in that server, stored as a sensitive variable |
   | `MATRIX_WEB_DISCORD_INVITE_URL` | Public invite for that server using `https://discord.gg/…` or `https://discord.com/invite/…` |
   | `MATRIX_WEB_DATABASE_URL` | Isolated Neon connection string, stored as a sensitive variable |

4. Add `<MATRIX_WEB_ORIGIN>/matrix/oauth/callback` as an exact redirect URI on the chosen Discord app. Keep the existing `https://brulitesite.vercel.app/api/matrix/auth/callback` registration for the launcher.
5. Open `/matrix` on the preview. Direct signed-out navigation to `/matrix/beta` should return to the landing. Verify a regular server member can sign in and a non-member sees the invite. After joining the server, the same account should be able to sign in. Verify that leaving the server denies access on the next protected request and sign-out revokes the browser session. Check the launcher health on its existing origin separately.

For a visual preview without OAuth configuration, run `npm run dev` and visit `http://localhost:3000/matrix`. Configured OAuth uses Discord’s [authorization code flow](https://docs.discord.com/developers/topics/oauth2#authorization-code-grant) with PKCE and the `identify` scope. Matrix checks [guild membership](https://docs.discord.com/developers/resources/guild#get-guild-member) on sign-in and every protected request. A lookup failure denies access. The site uses host-only, HTTP-only cookies and stores hashed web session credentials for one hour. Expired rows are removed when new sessions are created. The site discards Discord access and refresh tokens after checking identity.
