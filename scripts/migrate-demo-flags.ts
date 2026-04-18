import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const defaultExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const workspaceResult = await prisma.workspace.updateMany({
    where: {
      isDemo: false,
      OR: [
        { name: "BabaBuilds Demo Enterprise" },
        {
          users: {
            some: {
              user: {
                OR: [{ email: { endsWith: "@bababuilds.demo" } }, { role: "DEMO" }],
              },
            },
          },
        },
      ],
    },
    data: {
      isDemo: true,
      demoTemplateKey: "legacy-seeded",
      demoExpiresAt: defaultExpiry,
    },
  });

  const userResult = await prisma.user.updateMany({
    where: {
      isDemo: false,
      OR: [{ email: { endsWith: "@bababuilds.demo" } }, { role: "DEMO" }],
    },
    data: {
      isDemo: true,
      demoTemplateKey: "legacy-seeded",
      demoExpiresAt: defaultExpiry,
    },
  });

  console.log(
    `Demo flags migration complete. Updated ${userResult.count} users and ${workspaceResult.count} workspaces.`,
  );
}

main()
  .catch((error) => {
    console.error("Failed to migrate demo flags:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
