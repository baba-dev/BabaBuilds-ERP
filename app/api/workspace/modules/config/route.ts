import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/security/activity-log";
import { getModuleAvailability } from "@/lib/modules";
import { isConfigurableModule, MODULE_OPTION_SCHEMAS, mergeModuleConfig } from "@/lib/module-config";
import { requireSettingsManager } from "@/lib/settings/access";

const body = z.object({ moduleKey: z.string(), options: z.record(z.string(), z.unknown()) });

/** Sets a module's options (for example AR auto-reminders). The module has to be on; other config values are kept. */
export async function PUT(request: Request) {
  const auth = await requireSettingsManager();
  if (!auth.ok) return auth.response;
  const { workspaceId, userId, email } = auth.actor;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isConfigurableModule(parsed.data.moduleKey)) return NextResponse.json({ error: "This module has no options.", code: "INVALID_BODY" }, { status: 400 });
  const { moduleKey } = parsed.data;
  const options = MODULE_OPTION_SCHEMAS[moduleKey].safeParse(parsed.data.options);
  if (!options.success) return NextResponse.json({ error: "Invalid option.", code: "INVALID_BODY" }, { status: 400 });

  if ((await getModuleAvailability(workspaceId, moduleKey)) !== "enabled") return NextResponse.json({ error: "Turn the module on first.", code: "MODULE_DISABLED" }, { status: 409 });

  const row = await prisma.workspaceModule.findUnique({ where: { workspaceId_moduleKey: { workspaceId, moduleKey } }, select: { configJson: true } });
  const next = mergeModuleConfig(row?.configJson, options.data);
  await prisma.workspaceModule.update({ where: { workspaceId_moduleKey: { workspaceId, moduleKey } }, data: { configJson: next as Prisma.InputJsonValue } });
  await logActivity({ action: "settings_module_option", status: "SUCCESS", workspaceId, actor: { userId, email }, entity: { type: "workspace_module", id: moduleKey }, metadata: { module: moduleKey, options: options.data }, request });
  return NextResponse.json({ success: true, moduleKey, options: options.data });
}
