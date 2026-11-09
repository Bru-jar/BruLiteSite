# Matrix Android package delivery

Matrix Home travels inside the Windows MSI. The launcher downloads the OSRS 242.2 x86_64 base and split APKs when the PC has no local package folder or verified cache. The downloads use an active Matrix desktop session. Matrix checks the length and SHA-256 of each file and finishes both checks before it creates a MuMu instance.

Connect a dedicated **private** Vercel Blob store to the BruLiteSite production environment with the `MATRIX_PACKAGE` prefix. Vercel supplies its token as `MATRIX_PACKAGE_READ_WRITE_TOKEN`. The existing `BLOB_READ_WRITE_TOKEN` belongs to the store behind the BruLite image proxy.

Once redistribution is authorized, upload the exact release files with the pathnames below. Preserve the pathnames, with no random suffix. A new Android release should use a new path and launcher pins.

| File | Bytes | Private Blob pathname |
| --- | ---: | --- |
| Base | 7,299,007 | `matrix/osrs-242.2/x86_64/3e64464b6d1ba204283d97d5863faa7d8ec07cc44247ac541cc4af0894cb6214/base.apk` |
| x86_64 split | 6,763,235 | `matrix/osrs-242.2/x86_64/3e1c7af926d0c7aa1d5daa9fc4a4d5d5d99147f562a19406a4cca1c83a93ed0d/split_config.x86_64.apk` |

After deployment, verify that the package endpoint returns 401 without a session. Use a signed-in launcher with an empty package cache and no local package folder to check automatic download and first boot. Promote the new Windows release only once both private objects are available.
