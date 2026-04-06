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

## Google OAuth deployment checklist

Use this checklist before promoting to staging/production:

1. Google Cloud Console OAuth client has this authorized redirect URI:
   - `https://erp.bababuilds.com/api/auth/callback/google`
2. Deployment environment contains:
   - `NEXTAUTH_URL=https://erp.bababuilds.com`
   - `NEXTAUTH_SECRET=<strong random value>`
   - `GOOGLE_CLIENT_ID=<google oauth client id>`
   - `GOOGLE_CLIENT_SECRET=<google oauth client secret>`
3. If running behind a reverse proxy/CDN, preserve forwarded headers:
   - `X-Forwarded-Proto`
   - `X-Forwarded-Host`
4. Validate login flow end-to-end:
   - `/login` → Google consent → callback success → dashboard load.

### Auth/login route note

- Canonical authenticated entry route is `/dashboard` (served by `app/(dashboard)/dashboard/page.tsx`).
- Keep login and post-auth redirects pointing to `/dashboard` rather than `/` or an implicit `app/(dashboard)/page.tsx`.

## Frontend polish rollout

Use these artifacts to coordinate phased UI delivery and design QA gates:

- [Component adoption matrix](docs/frontend/component-adoption-matrix.md)
- [Visual QA checklist](docs/frontend/visual-qa-checklist.md)
