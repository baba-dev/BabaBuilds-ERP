process.env.NEXT_RUNTIME = 'nodejs';
import { PrismaClient } from "@prisma/client";
import { buildDashboardPayload } from "../app/api/dashboard/route";

const prisma = new PrismaClient();

async function main() {
  const ws = await prisma.workspace.findFirst();
  if (!ws) {
    console.log("No workspace found");
    return;
  }
  
  console.log("Testing dashboard payload for Workspace:", ws.id);
  
  try {
    const fy = "26-27";
    const user = await prisma.user.findFirst();
    const payload = await buildDashboardPayload(ws.id, user?.id ?? null, fy);
    console.log("Successfully built payload!");
  } catch (err) {
    console.error("Dashboard payload failed:", err);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
