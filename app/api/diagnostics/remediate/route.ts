import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);
const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const { remediationId } = await req.json();

    const remediation = await prisma.systemRemediation.findUnique({
      where: { id: remediationId }
    });

    if (!remediation) {
      return NextResponse.json({ success: false, error: "Remediation not found" }, { status: 404 });
    }

    if (remediation.status !== "PENDING_APPROVAL") {
      return NextResponse.json({ success: false, error: "Remediation is not pending approval" }, { status: 400 });
    }

    // Mark as executing
    await prisma.systemRemediation.update({
      where: { id: remediationId },
      data: { status: "EXECUTING", executedAt: new Date() }
    });

    let executionLog = "";
    let success = false;

    try {
      if (remediation.actionType === "CODE_PATCH") {
        // Save patch to a temp file and run git apply
        const patchPath = path.join(process.cwd(), `tmp-remediation-${Date.now()}.patch`);
        await fs.writeFile(patchPath, remediation.content);
        const { stdout, stderr } = await execAsync(`git apply ${patchPath}`);
        executionLog = `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
        await fs.unlink(patchPath).catch(() => {});
        success = true;

      } else if (remediation.actionType === "DATA_SCRIPT") {
        // Highly dangerous in a real production env, but for this self-healing POC we evaluate the prisma script
        // We wrap it in an async IIFE and pass prisma
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const scriptFn = new AsyncFunction('prisma', remediation.content);
        await scriptFn(prisma);
        executionLog = "Data script executed successfully.";
        success = true;

      } else if (remediation.actionType === "SYSTEM_RESTART") {
        const { stdout, stderr } = await execAsync(remediation.content);
        executionLog = `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
        success = true;

      } else if (remediation.actionType === "SECURITY_BAN") {
        // E.g., cscli decisions add --ip 1.2.3.4
        const { stdout, stderr } = await execAsync(remediation.content);
        executionLog = `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
        success = true;
      }
    } catch (execError: any) {
      success = false;
      executionLog = `Execution Error: ${execError.message || String(execError)}`;
    }

    await prisma.systemRemediation.update({
      where: { id: remediationId },
      data: {
        status: success ? "SUCCESS" : "FAILED",
        executionLog
      }
    });

    return NextResponse.json({ success, executionLog });

  } catch (err) {
    console.error("Error executing remediation:", err);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
