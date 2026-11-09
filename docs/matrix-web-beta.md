# Matrix website closed beta

The public landing is at `/matrix`. The server checks the browser session and current Discord allowlist before rendering `/matrix/beta`. BruLite pages keep their existing URLs. The installed Matrix launcher still uses `/api/matrix/auth/*`.

## Preview setup

1. Choose one stable preview origin. Use an HTTPS origin for Vercel or `http://localhost:3000` for local development. For Vercel, scope the following values to the preview environment and its review branch. The selected origin must be reachable by reviewers and accept browser navigation to the OAuth callback.
2. Run [matrix-web.sql](../scripts/matrix-web.sql) against the isolated preview Neon database. Grant the runtime database role schema usage and select, insert, and delete on `matrix_web.sessions` if it differs from the schema owner.
3. Set the server variables below. Use only the existing Matrix owner’s Discord ID initially. Add tester IDs only after approval.

   | Variable | Value |
   | --- | --- |
   | `MATRIX_WEB_ORIGIN` | Exact preview origin |
   | `MATRIX_WEB_DISCORD_CLIENT_ID` | OAuth client ID for Matrix web. The existing Matrix Discord app can be used. |
   | `MATRIX_WEB_DISCORD_CLIENT_SECRET` | The matching OAuth client secret, stored as a sensitive variable |
   | `MATRIX_WEB_DISCORD_ALLOWED_USER_IDS` | Comma-separated Discord user IDs. Empty or malformed configuration denies access. |
   | `MATRIX_WEB_DATABASE_URL` | Isolated Neon connection string, stored as a sensitive variable |

4. Add `<MATRIX_WEB_ORIGIN>/matrix/oauth/callback` as an exact redirect URI on the chosen Discord app. Keep the existing `https://brulitesite.vercel.app/api/matrix/auth/callback` registration for the launcher.
5. Open `/matrix` on the preview. Direct signed-out navigation to `/matrix/beta` should return to the landing. Verify the owner reaches the beta after Discord sign-in, an unlisted Discord account sees the invitation notice, and sign-out returns to the landing and revokes the session. Check the launcher health on its existing origin separately.

For a visual preview without OAuth configuration, run `npm run dev` and visit `http://localhost:3000/matrix`. Configured OAuth uses Discord’s [authorization code flow](https://docs.discord.com/developers/topics/oauth2#authorization-code-grant) with PKCE and the `identify` scope. The site uses host-only, HTTP-only cookies and stores hashed web session credentials for one hour. Removing an ID from the allowlist denies that account on the next request after the new configuration is active. Expired rows are removed when new sessions are created. The site discards Discord access and refresh tokens after checking identity.
