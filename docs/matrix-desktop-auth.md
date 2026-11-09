# Matrix desktop sign-in on Vercel

The Matrix launcher opens Discord in the system browser. After OAuth, this site asks for the six-digit code displayed by the launcher. The launcher collects a Matrix session from the backend and verifies that session before opening the workspace.

## Configure the first hosted test

1. Use a separate Neon database or staging branch for Matrix. Run [the Matrix schema](../scripts/matrix-auth.sql) in that database as its owner. The service connection needs access to the three tables in the matrix_auth schema. The site uses MATRIX_DATABASE_URL for Matrix.
2. In the connected Vercel project, add these server environment variables to the deployment environment.

   | Variable | Value |
   | --- | --- |
   | MATRIX_AUTH_ORIGIN | Exact public HTTPS origin, without a trailing slash |
   | MATRIX_DISCORD_CLIENT_ID | Public application ID of the Matrix Discord app |
   | MATRIX_DISCORD_ALLOWED_USER_ID | The Discord account allowed into the first test |
   | MATRIX_DISCORD_CLIENT_SECRET | OAuth2 client secret, stored as a sensitive variable |
   | MATRIX_DATABASE_URL | Matrix Neon connection URL, stored as a sensitive variable |

3. Add the exact callback to the Matrix Discord app. For the first hosted target it is https://brulitesite.vercel.app/api/matrix/auth/callback.
4. Deploy from the reviewed GitHub commit. Check /api/matrix/auth/health on the launcher origin. It returns READY after the service can read all three tables. A 503 means configuration or database setup needs attention.
5. Open the hosted Matrix build from Windows Start. Approve Discord in the browser, enter the Matrix code, and confirm the workspace opens.

The desktop launcher must be able to reach the HTTPS API directly. If Vercel Deployment Protection covers a preview URL, use an appropriate public test origin. The Discord allowlist governs Matrix access.

## Session boundaries

Pairing attempts expire in five minutes. Discord codes and browser approvals are single use. The server stores only hashed Matrix pairing and session credentials and discards Discord access tokens after checking identity. Session collection consumes the pairing and creates a one-hour session in one database statement. Closing the launcher requests revocation. The first test asks for a fresh sign-in on each launch.

Matrix credentials and data belong in the Matrix environment variables and database. Existing BruLite desktop sessions, website OAuth, Stripe billing, and migrations use their original configuration.
