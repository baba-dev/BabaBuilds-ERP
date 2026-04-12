This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Auth provider configuration

`validateAuthEnvOrThrow` always requires these core NextAuth variables in all modes:

- `NEXTAUTH_URL=https://erp.bababuilds.com`
- `NEXTAUTH_SECRET=<strong random value>`

Provider-specific variables are only required when that provider is enabled.

### Mode A: Email-only auth

Use this when you only want magic-link sign in.

- Set `AUTH_EMAIL_ENABLED=true`
- Set `AUTH_GOOGLE_ENABLED=false` (optional but recommended for explicitness)
- Provide SMTP/email vars:
  - `EMAIL_SERVER_HOST=<smtp host>`
  - `EMAIL_SERVER_PORT=<smtp port>`
  - `EMAIL_SERVER_USER=<smtp username>`
  - `EMAIL_SERVER_PASSWORD=<smtp password>`
  - `EMAIL_FROM=<sender address>`

### Mode B: Google + Email auth

Use this when you want both OAuth and magic-link sign in.

- Set `AUTH_GOOGLE_ENABLED=true`
- Set `AUTH_EMAIL_ENABLED=true`
- Provide Google OAuth vars:
  - `GOOGLE_CLIENT_ID=<google oauth client id>`
  - `GOOGLE_CLIENT_SECRET=<google oauth client secret>`
- Provide SMTP/email vars:
  - `EMAIL_SERVER_HOST=<smtp host>`
  - `EMAIL_SERVER_PORT=<smtp port>`
  - `EMAIL_SERVER_USER=<smtp username>`
  - `EMAIL_SERVER_PASSWORD=<smtp password>`
  - `EMAIL_FROM=<sender address>`

For Google OAuth, ensure the Google Cloud Console OAuth client includes this redirect URI:

- `https://erp.bababuilds.com/api/auth/callback/google`

### Deployment checks

Before promoting to staging/production:

1. If running behind a reverse proxy/CDN, preserve forwarded headers:
   - `X-Forwarded-Proto`
   - `X-Forwarded-Host`
2. Validate login flow end-to-end:
   - `/login` → provider flow (Google or email link) → callback success → dashboard load.

### Auth/login route note

- Canonical authenticated entry route is `/dashboard` (served by `app/(dashboard)/dashboard/page.tsx`).
- Keep login and post-auth redirects pointing to `/dashboard` rather than `/` or an implicit `app/(dashboard)/page.tsx`.
- Legacy user preference values of `/` for `defaultLandingPage` are normalized to `/dashboard` in the profile API and migrated in Prisma SQL.

## Frontend polish rollout

Use these artifacts to coordinate phased UI delivery and design QA gates:

- [Component adoption matrix](docs/frontend/component-adoption-matrix.md)
- [Visual QA checklist](docs/frontend/visual-qa-checklist.md)

## Auth/email dependency constraints

To keep email sign-in and verification-token delivery compatible with `next-auth@4.24.13`, keep `nodemailer` on the `^7.0.7` major range (the peer dependency expected by this `next-auth` release).

When updating mailer dependencies, align `@types/nodemailer` to the same runtime major as `nodemailer` to avoid drift between compile-time types and runtime APIs.
