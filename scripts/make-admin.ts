/**
 * Promote an existing user to the platform ADMIN role (the database half of super-admin access).
 *
 *   npm run admin:promote -- you@example.com
 *
 * The other half is the server setting SUPERADMIN_EMAILS (comma separated). Both are required, on purpose: a database
 * change alone, or an environment change alone, never grants access to the admin console.
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    console.error("Usage: npm run admin:promote -- you@example.com");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({ where: { email: { equals: email } }, select: { id: true, email: true, role: true } });
    if (!user) {
      console.error(`No user with email ${email}. Sign in once with that account first, then run this again.`);
      process.exit(2);
    }
    if (user.role === "ADMIN") console.log(`${user.email} already has the ADMIN role.`);
    else {
      await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
      console.log(`${user.email} now has the ADMIN role.`);
    }
    const listed = (process.env.SUPERADMIN_EMAILS ?? "").toLowerCase().split(",").map((e) => e.trim()).includes(email);
    console.log(listed ? "SUPERADMIN_EMAILS already includes this email in this shell." : `Next: make sure the server has SUPERADMIN_EMAILS=${email} (comma separate several) and restart it.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
