import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isModuleEnabled } from "@/lib/modules";
import { prisma } from "@/lib/prisma";

type ReadinessItem = {
  id: string;
  label: string;
  status: "pass" | "warn";
  detail: string;
};

const EXECUTION_PHASES = [
  {
    id: "PHASE_0",
    title: "Phase 0",
    summary: "Schema + hidden APIs (no UI exposure).",
  },
  {
    id: "PHASE_1",
    title: "Phase 1",
    summary: "Internal UI alpha with read-only preview mode.",
  },
  {
    id: "PHASE_2",
    title: "Phase 2",
    summary: "Controlled tenant beta with posting disabled by default.",
  },
  {
    id: "PHASE_3",
    title: "Phase 3",
    summary: "GA with accounting posting + exports.",
  },
] as const;

export async function GET() {
  const session = await getServerSession(authOptions);
  const typedSession = session as { workspaceId?: string } | null;
  const workspaceId = typedSession?.workspaceId;

  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isModuleEnabled(workspaceId, "PAYROLL"))) {
    return NextResponse.json({ error: "Payroll module is not enabled for this workspace.", code: "MODULE_DISABLED" }, { status: 403 });
  }

  try {
    const [employeeCount, attendanceCount, leaveRequestCount, businessProfile] = await Promise.all([
      prisma.employee.count({ where: { workspaceId } }).catch(() => 0),
      prisma.attendanceRecord.count({ where: { workspaceId } }).catch(() => 0),
      prisma.leaveRequest.count({ where: { workspaceId } }).catch(() => 0),
      prisma.businessProfile.findUnique({
        where: { workspaceId },
        select: { companyName: true, email: true, address: true },
      }).catch(() => null),
    ]);

    const checklist: ReadinessItem[] = [
      {
        id: "profile",
        label: "Business profile available",
        status:
          businessProfile?.companyName && businessProfile?.email && businessProfile?.address ? "pass" : "warn",
        detail: businessProfile?.companyName
          ? "Business identity metadata is present."
          : "Complete company profile fields before payroll go-live.",
      },
      {
        id: "workforce",
        label: "Employee base",
        status: employeeCount > 0 ? "pass" : "warn",
        detail: employeeCount > 0 ? `${employeeCount} employees available for payroll setup.` : "Add employees first.",
      },
      {
        id: "attendance",
        label: "Attendance history coverage",
        status: attendanceCount > 0 ? "pass" : "warn",
        detail:
          attendanceCount > 0
            ? `${attendanceCount} attendance records available for preview validations.`
            : "No attendance records found; preview calculations will be limited.",
      },
      {
        id: "leave",
        label: "Leave policy signal",
        status: leaveRequestCount > 0 ? "pass" : "warn",
        detail:
          leaveRequestCount > 0
            ? `${leaveRequestCount} leave requests detected for policy-linked payroll preview.`
            : "No leave request history found; verify leave policy mapping manually.",
      },
    ];

    const passed = checklist.filter((item) => item.status === "pass").length;
    const readinessScore = Math.round((passed / checklist.length) * 100);

    return NextResponse.json({
      executionPhases: EXECUTION_PHASES,
      readiness: {
        score: readinessScore,
        postingEnabled: false,
        postingStatusLabel: "Disabled by default",
        checklist,
      },
    });
  } catch (error) {
    console.error("[readiness-telemetry] Failed loading live database telemetry, using safe defaults:", error);
    
    // Safety fallback: allow setup wizard to render and progress without crashing
    const fallbackChecklist: ReadinessItem[] = [
      {
        id: "profile",
        label: "Business profile available",
        status: "warn",
        detail: "Standard profile check bypassed during transient latency.",
      },
      {
        id: "workforce",
        label: "Employee base",
        status: "warn",
        detail: "Unable to verify employee count.",
      },
      {
        id: "attendance",
        label: "Attendance history coverage",
        status: "warn",
        detail: "Unable to verify attendance history.",
      },
      {
        id: "leave",
        label: "Leave policy signal",
        status: "warn",
        detail: "Unable to verify leave request status.",
      },
    ];

    return NextResponse.json({
      executionPhases: EXECUTION_PHASES,
      readiness: {
        score: 0,
        postingEnabled: false,
        postingStatusLabel: "Unavailable",
        checklist: fallbackChecklist,
      },
    });
  }
}
