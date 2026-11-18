# Matrix hosted routing preview

The launcher opts in with the JVM property matrix.walk.hostedPreview=true. The optional matrix.walk.hostedPreviewCompare=true property logs the full hosted request and validation time alongside a local computation on the same endpoints. The hosted destination is fixed to https://www.matrixclient.net/api/matrix/routes/preview. The launcher validates the map version and every collision edge and retains local fallback.

## Worker

Run the Java 24 worker with jdk.httpserver enabled. Supply the worker JAR and Matrix SDK JAR on the classpath, then pass the reviewed collision archive and the port as arguments.

    java --add-modules jdk.httpserver -cp 'worker.jar:matrix-sdk.jar' dev.matrix.desktop.launcher.PreviewRouteWorker collision.zip 8080

Set MATRIX_ROUTE_PREVIEW_WORKER_TOKEN to a Base64url-encoded 32-byte random service credential without padding. Set MATRIX_ROUTE_PREVIEW_WORKER_BIND=0.0.0.0 inside a container whose ingress terminates TLS, or use the default 127.0.0.1 bind behind a same-machine TLS reverse proxy. Publish the HTTPS POST path /preview/v1/route through that ingress. Keep the worker's plain HTTP port private. The worker rejects direct calls that lack the service credential.

## Gateway

Set MATRIX_ROUTE_PREVIEW_WORKER_URL to the full HTTPS worker endpoint and set MATRIX_ROUTE_PREVIEW_WORKER_TOKEN to the same service credential in the Matrix Vercel project. The route uses the existing desktop session and account allowlist in Neon. It forwards only the binary route request and the worker credential. A missing configuration or failed lookup returns a non-success status so the launcher falls back locally.

Verify that an unauthenticated request receives 401 when the deployment configuration and database are healthy. Verify both same-plane routes using the authenticated launcher and compare its hosted and local timing lines. Read exact player position independently after each walk.
