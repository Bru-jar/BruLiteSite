const prefix = "matrix/osrs-242.2/x86_64";
const packages = {
  "base.apk": {
    size: 7299007,
    sha256: "3e64464b6d1ba204283d97d5863faa7d8ec07cc44247ac541cc4af0894cb6214",
  },
  "split_config.x86_64.apk": {
    size: 6763235,
    sha256: "3e1c7af926d0c7aa1d5daa9fc4a4d5d5d99147f562a19406a4cca1c83a93ed0d",
  },
} as const;

type PrivatePackage = { stream: ReadableStream<Uint8Array>; size: number };
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function deliverMatrixPackage(
  request: Request,
  name: string,
  verify: (authorization: string) => Promise<Response>,
  read: (pathname: string, signal: AbortSignal) => Promise<PrivatePackage | null>,
) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)) {
    return new Response(null, { status: 401, headers });
  }
  try {
    const session = await verify(authorization);
    if (session.status !== 200) {
      return new Response(null, { status: session.status === 401 ? 401 : 503, headers });
    }
    if (!Object.hasOwn(packages, name)) return new Response(null, { status: 404, headers });
    const entry = packages[name as keyof typeof packages];
    const object = await read(`${prefix}/${entry.sha256}/${name}`, request.signal);
    if (!object || object.size !== entry.size) {
      if (object) await object.stream.cancel();
      return new Response(null, { status: 503, headers });
    }
    return new Response(object.stream, {
      headers: { ...headers, "Content-Type": "application/octet-stream" },
    });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
