import { NextResponse } from "next/server";
import { handleAdminApiError, verifySuperAdmin } from "../authz";
import { prisma } from "@/lib/prisma";
import os from 'os';

export async function GET() {
  try {
    await verifySuperAdmin();

    // 1. Database Ping
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - start;

    // 2. OS Metrics
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePercent = ((usedMem / totalMem) * 100).toFixed(2);
    
    const cpus = os.cpus();
    const loadAvg = os.loadavg(); // Returns an array [1, 5, 15] minutes of load averages

    const uptime = os.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);

    return NextResponse.json({
      databaseLatency: `${dbLatency}ms`,
      memory: {
        total: `${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
        used: `${(usedMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
        percent: memUsagePercent
      },
      cpu: {
        cores: cpus.length,
        model: cpus[0].model,
        loadAverage: loadAvg.map(l => l.toFixed(2)).join(', ')
      },
      uptime: `${hours}h ${minutes}m`,
      status: dbLatency < 200 ? "Healthy" : "Degraded"
    });
  } catch (error) {
    return handleAdminApiError(error, "Server Error");
  }
}
