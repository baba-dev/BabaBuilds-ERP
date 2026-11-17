import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Client generation needs no DB; migrate/diff must receive DATABASE_URL explicitly.
const databaseUrl = process.env.DATABASE_URL;
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
