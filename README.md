# Mint Metrics

Deploy settings for Cloudflare Pages:

- Framework preset: React (Vite)
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: leave blank if these files are at the repo root. If this whole folder is uploaded as a folder, set root directory to `MintMetrics_GitHub_Source_CF_Fix`.

This package is adjusted to avoid Cloudflare's `npm clean-install` issue by removing `package-lock.json` and pinning Node with `.node-version`.
