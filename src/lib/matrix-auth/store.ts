export type Query = (statement: string, parameters?: (string | number | null)[]) =>
  Promise<Record<string, unknown>[]>;

export function matrixAuthStore(query: Query) {
  return {
    async ready() {
      await query("SELECT 1 FROM matrix_auth.login_attempts, matrix_auth.sessions, matrix_auth.start_limits LIMIT 0");
    },
    async limit(bucket: number, subject: string, limit: number) {
      const rows = await query(
        'INSERT INTO matrix_auth.start_limits AS current (bucket, subject, used) VALUES ($1, $2, 1) ' +
        'ON CONFLICT (bucket, subject) DO UPDATE SET used = current.used + 1 WHERE current.used < $3 RETURNING used',
        [bucket, subject, limit],
      );
      return rows.length === 1;
    },
    async prune(bucket: number) {
      await query(
        'WITH a AS (DELETE FROM matrix_auth.login_attempts WHERE expires_at <= now()), ' +
        'b AS (DELETE FROM matrix_auth.sessions WHERE expires_at <= now()) ' +
        'DELETE FROM matrix_auth.start_limits WHERE bucket < $1', [bucket - 1],
      );
    },
    async start(id: string, state: string, verifier: string, code: string) {
      await query(
        "INSERT INTO matrix_auth.login_attempts (id, oauth_state_hash, verifier, approval_code_hash, phase) " +
        "VALUES ($1, $2, $3, $4, 'WAITING')", [id, state, verifier, code],
      );
    },
    async acceptCallback(state: string) {
      const [row] = await query(
        "UPDATE matrix_auth.login_attempts SET phase = 'PROCESSING', oauth_state_hash = NULL " +
        "WHERE oauth_state_hash = $1 AND phase = 'WAITING' AND expires_at > now() RETURNING id, verifier", [state],
      );
      return row ? { id: String(row.id), verifier: String(row.verifier) } : null;
    },
    async finishCallback(id: string, phase: "APPROVAL" | "DENIED" | "CANCELLED" | "FAILED", subject?: string, browser?: string) {
      const rows = await query(
        "UPDATE matrix_auth.login_attempts SET phase = $2, discord_id = $3, browser_hash = $4, verifier = NULL " +
        "WHERE id = $1 AND phase = 'PROCESSING' AND expires_at > now() RETURNING id",
        [id, phase, subject ?? null, browser ?? null],
      );
      return rows.length === 1;
    },
    async awaitingApproval(browser: string) {
      return (await query(
        "SELECT 1 FROM matrix_auth.login_attempts WHERE browser_hash = $1 AND phase = 'APPROVAL' AND expires_at > now()",
        [browser],
      )).length === 1;
    },
    async approve(browser: string, code: string) {
      const [row] = await query(
        "UPDATE matrix_auth.login_attempts SET " +
        "phase = CASE WHEN approval_code_hash = $2 THEN 'VERIFIED' WHEN wrong_codes >= 4 THEN 'FAILED' ELSE 'APPROVAL' END, " +
        "browser_hash = CASE WHEN approval_code_hash = $2 OR wrong_codes >= 4 THEN NULL ELSE browser_hash END, " +
        "wrong_codes = wrong_codes + 1 " +
        "WHERE browser_hash = $1 AND phase = 'APPROVAL' AND expires_at > now() RETURNING phase", [browser, code],
      );
      return row ? String(row.phase) : "EXPIRED";
    },
    async claim(id: string, token: string) {
      const rows = await query(
        "WITH granted AS (DELETE FROM matrix_auth.login_attempts " +
        "WHERE id = $1 AND phase = 'VERIFIED' AND expires_at > now() RETURNING discord_id) " +
        "INSERT INTO matrix_auth.sessions (token_hash, discord_id) SELECT $2, discord_id FROM granted RETURNING token_hash",
        [id, token],
      );
      return rows.length === 1;
    },
    async phase(id: string) {
      const [row] = await query(
        "SELECT phase FROM matrix_auth.login_attempts WHERE id = $1 AND expires_at > now()", [id],
      );
      return row && row.phase !== "VERIFIED" ? String(row.phase) : "EXPIRED";
    },
    async cancel(id: string) {
      await query("DELETE FROM matrix_auth.login_attempts WHERE id = $1", [id]);
    },
    async session(token: string, revoke: boolean) {
      const [row] = await query(revoke
        ? "DELETE FROM matrix_auth.sessions WHERE token_hash = $1 AND expires_at > now() RETURNING discord_id"
        : "SELECT discord_id FROM matrix_auth.sessions WHERE token_hash = $1 AND expires_at > now()", [token]);
      return row ? String(row.discord_id) : null;
    },
  };
}
