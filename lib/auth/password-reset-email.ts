import "server-only";
import { createTransport } from "nodemailer";

function hasNonEmptyEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

export function canSendPasswordResetEmail() {
  return [
    "EMAIL_SERVER_HOST",
    "EMAIL_SERVER_PORT",
    "EMAIL_SERVER_USER",
    "EMAIL_SERVER_PASSWORD",
    "EMAIL_FROM",
    "NEXTAUTH_URL",
  ].every(hasNonEmptyEnv);
}

export async function sendPasswordResetEmail(input: { email: string; token: string }) {
  if (!canSendPasswordResetEmail()) {
    throw new Error("Password reset email is not configured.");
  }

  const appUrl = new URL(process.env.NEXTAUTH_URL!);
  const resetUrl = new URL("/login", appUrl);
  resetUrl.searchParams.set("resetToken", input.token);

  const transport = createTransport({
    host: process.env.EMAIL_SERVER_HOST,
    port: Number(process.env.EMAIL_SERVER_PORT),
    auth: {
      user: process.env.EMAIL_SERVER_USER,
      pass: process.env.EMAIL_SERVER_PASSWORD,
    },
  });

  const result = await transport.sendMail({
    to: input.email,
    from: process.env.EMAIL_FROM!,
    subject: "Reset your BabaBuilds ERP password",
    text: `Reset your BabaBuilds ERP password using this secure link:\n${resetUrl.toString()}\n\nThis link expires in 60 minutes. If you did not request it, ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #18181b;">
        <h1 style="font-size: 20px;">Reset your BabaBuilds ERP password</h1>
        <p>Use the button below to set a new password. This link expires in 60 minutes.</p>
        <p><a href="${resetUrl.toString()}" style="display: inline-block; padding: 12px 18px; border-radius: 8px; background: #ea580c; color: #ffffff; text-decoration: none; font-weight: 700;">Reset password</a></p>
        <p style="font-size: 12px; color: #71717a;">If you did not request this reset, you can ignore this email.</p>
      </div>
    `,
  });

  const failed = [...result.rejected, ...(result.pending ?? [])].filter(Boolean);
  if (failed.length) {
    throw new Error(`Password reset email could not be sent to: ${failed.join(", ")}`);
  }
}
