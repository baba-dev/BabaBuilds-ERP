import Groq from "groq-sdk";
import { PrismaClient, RemediationType } from "@prisma/client";
import { sendSystemDiagnosticAlert } from "./notifier";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "dummy", 
});

export async function analyzeSystemError(logId: string) {
  try {
    const errorLog = await prisma.systemErrorLog.findUnique({
      where: { id: logId }
    });

    if (!errorLog) return null;

    // Update status to analyzing
    await prisma.systemErrorLog.update({
      where: { id: logId },
      data: { status: "ANALYZING" }
    });

    const prompt = `
You are an expert Systems Reliability Engineer and Next.js / TypeScript developer.
Analyze the following error log and provide a plain English diagnosis.
Additionally, if this error can be programmatically fixed, generate an auto-remediation payload.

Error Type: ${errorLog.errorType}
Message: ${errorLog.message}
Route: ${errorLog.route || "Unknown"}
Environment: ${errorLog.environment || "Unknown"}
Source File: ${errorLog.sourceFile || "Unknown"}

Stack Trace:
${errorLog.stackTrace || "None"}

Please output your analysis as a JSON object with exactly these keys:
1. "aiDiagnosis": A string explaining what went wrong in simple terms.
2. "aiConfidence": A number from 0 to 100 representing how confident you are in this diagnosis.
3. "remediationType": Optional. Enum: "CODE_PATCH", "DATA_SCRIPT", "SYSTEM_RESTART", "SECURITY_BAN". Omit if not fixable by these.
4. "remediationContent": Optional. If CODE_PATCH, provide a git diff. If DATA_SCRIPT, provide a Prisma JS script. If SYSTEM_RESTART, provide a shell command like 'pm2 restart app'. If SECURITY_BAN, provide 'cscli decisions add --ip <IP>'.
5. "remediationDescription": Optional. Plain English description of what the remediation does.

Return ONLY the JSON. No markdown wrappers.
    `.trim();

    let diagnosisData: any = {
      aiDiagnosis: "Unable to reach LLM or invalid API key.",
      aiConfidence: 0,
      remediationType: null,
      remediationContent: null,
      remediationDescription: null
    };

    if (process.env.GROQ_API_KEY) {
      try {
        const completion = await groq.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          model: "llama3-8b-8192", 
          temperature: 0.1,
        });

        const content = completion.choices[0]?.message?.content || "{}";
        
        try {
          let jsonStr = content.trim();
          if (jsonStr.startsWith("\`\`\`json")) jsonStr = jsonStr.replace(/^\`\`\`json/, "");
          if (jsonStr.endsWith("\`\`\`")) jsonStr = jsonStr.replace(/\`\`\`$/, "");
          
          const parsed = JSON.parse(jsonStr.trim());
          if (parsed.aiDiagnosis) {
            diagnosisData = parsed;
          }
        } catch (parseError) {
          console.error("Failed to parse Groq response:", content);
        }
      } catch (apiError) {
        console.error("Groq API error:", apiError);
      }
    } else {
        console.warn("No GROQ_API_KEY found, using mock AI response.");
        diagnosisData = {
            aiDiagnosis: "Mock Analysis: Missing 'status' field in the database.",
            aiConfidence: 90,
            remediationType: "DATA_SCRIPT",
            remediationContent: "await prisma.invoice.updateMany({ data: { status: 'PENDING' }, where: { status: null } });",
            remediationDescription: "Sets any null invoice statuses to PENDING."
        };
    }

    // Save back to DB
    const updatedLog = await prisma.systemErrorLog.update({
      where: { id: logId },
      data: {
        aiDiagnosis: diagnosisData.aiDiagnosis,
        aiSuggestedFix: diagnosisData.remediationDescription || null,
        aiConfidence: diagnosisData.aiConfidence || 50,
        analyzedAt: new Date(),
        status: "UNRESOLVED" 
      }
    });

    // Create remediation if provided
    let hasRemediation = false;
    if (diagnosisData.remediationType && diagnosisData.remediationContent) {
      try {
        await prisma.systemRemediation.create({
          data: {
            errorLogId: logId,
            actionType: diagnosisData.remediationType as RemediationType,
            content: diagnosisData.remediationContent,
            description: diagnosisData.remediationDescription || "Auto-generated remediation",
            status: "PENDING_APPROVAL"
          }
        });
        hasRemediation = true;
      } catch (remErr) {
        console.error("Failed to save remediation:", remErr);
      }
    }

    // Send Alert Email
    await sendSystemDiagnosticAlert(logId, updatedLog.errorType, updatedLog.aiDiagnosis || "Unknown issue", hasRemediation);

    return updatedLog;

  } catch (err) {
    console.error("Failed to analyze error:", err);
    try {
      await prisma.systemErrorLog.update({
        where: { id: logId },
        data: { status: "UNRESOLVED" }
      });
    } catch (_) {}
    return null;
  }
}
