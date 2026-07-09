# zhongcheng-law-firm

Cloudflare Pages site for the Zhongcheng Law Firm project.

## Admin Access

The `/admin` page and `/api/admin/logs` endpoint are protected with Cloudflare Access JWT validation.

Set these Pages environment variables:

- `CF_ACCESS_DOMAIN` - your Zero Trust team domain, for example `https://<team>.cloudflareaccess.com`
- `CF_ACCESS_AUD` - the Access application audience tag
- `CF_ACCESS_ALLOWED_EMAILS` - comma-separated admin emails, defaults to `shakechen@126.com,shake.chen@gmail.com`

Cloudflare Zero Trust dashboard setup:

1. Go to `Zero Trust -> Access -> Applications`.
2. Create a `Self-hosted` application for the site.
3. Protect the `/admin*` path.
4. Allow only the identities you want to use.
