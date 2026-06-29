import { sendEmail } from "@/lib/mailer";

export async function sendSystemDiagnosticAlert(logId: string, errorType: string, aiDiagnosis: string, hasRemediation: boolean) {
  try {
    const dashboardLink = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/admin/system-health/${logId}`;
    
    const subject = `[SYSTEM ALERT] 🚨 ${errorType} Detected`;
    
    const html = `
      <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #ef4444; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0;">System Error Detected</h2>
        </div>
        <div style="padding: 24px; background-color: #fafafa;">
          <h3 style="margin-top: 0; color: #111827;">Error: ${errorType}</h3>
          
          <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 0 4px 4px 0;">
            <h4 style="margin-top: 0; color: #1e40af; font-size: 14px;">🤖 AI Diagnosis</h4>
            <p style="margin-bottom: 0; color: #1e3a8a; font-size: 14px; line-height: 1.5;">
              ${aiDiagnosis}
            </p>
          </div>

          ${hasRemediation ? `
            <div style="background-color: #ecfdf5; border: 1px solid #10b981; padding: 16px; margin: 20px 0; border-radius: 4px; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #065f46; font-weight: bold;">
                ✨ The AI has generated a proposed fix!
              </p>
              <p style="margin: 0; font-size: 13px; color: #047857;">
                An actionable patch, script, or command is waiting in the queue.
              </p>
            </div>
          ` : ''}

          <div style="text-align: center; margin-top: 30px;">
            <a href="${dashboardLink}" style="display: inline-block; background-color: #111827; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
              Review in Dashboard
            </a>
          </div>
        </div>
        <div style="background-color: #f3f4f6; padding: 12px; text-align: center; font-size: 12px; color: #6b7280;">
          BabaBuilds ERP - Automated Diagnostics
        </div>
      </div>
    `;

    // Attempt to send email. In dev without SMTP, this might fail, so we catch it.
    await sendEmail({
      route: "system",
      to: "admin@bababuilds.com",
      subject,
      html,
      text: `System Error: ${errorType}\nDiagnosis: ${aiDiagnosis}\nLink: ${dashboardLink}`
    });
    
  } catch (err) {
    console.error("Failed to send system diagnostic alert:", err);
  }
}
