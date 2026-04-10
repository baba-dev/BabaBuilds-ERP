import nodemailer from 'nodemailer';
import dns from 'dns';
import { promisify } from 'util';
import { decrypt } from '@/lib/encryption';

const lookupAsync = promisify(dns.lookup);

export function getRuntimeSmtpPassword(smtpPassword: string): string {
  try {
    return decrypt(smtpPassword);
  } catch {
    // Temporary legacy fallback for older plaintext rows.
    return smtpPassword;
  }
}

export async function resolveSafeIp(host: string): Promise<string | null> {
  try {
    if (host.toLowerCase() === 'localhost') return null;

    const { address } = await lookupAsync(host);

    if (address.startsWith('127.')) return null; 
    if (address.startsWith('10.')) return null; 
    if (address.startsWith('192.168.')) return null; 
    if (address.startsWith('169.254.')) return null; 
    if (address === '0.0.0.0') return null;

    if (address.startsWith('172.')) {
      const secondOctet = parseInt(address.split('.')[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) return null;
    }

    if (address === '::1') return null;
    if (address.toLowerCase().startsWith('fe80:')) return null;

    return address; 
  } catch (e) {
    return null; 
  }
}

export async function sendEmail({
  profile,
  to,
  subject,
  html,
  text
}: {
  profile: any;
  to: string;
  subject: string;
  html?: string;
  text?: string;
}) {
  if (!profile || !profile.smtpHost || !profile.smtpUser || !profile.smtpPassword) {
    throw new Error('SMTP Server not configured in Business Settings.');
  }

  const safeIp = await resolveSafeIp(profile.smtpHost);
  if (!safeIp) {
    throw new Error('Invalid or internal SMTP Host blocked by security policy.');
  }

  const transporter = nodemailer.createTransport({
    host: safeIp,
    port: profile.smtpPort || 587,
    secure: profile.smtpPort === 465,
    tls: {
      servername: profile.smtpHost,
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
      ciphers: 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256',
      honorCipherOrder: true,
    },
    auth: {
      user: profile.smtpUser,
      pass: getRuntimeSmtpPassword(profile.smtpPassword),
    },
  });

  const mailOptions = {
    from: `"${profile.companyName}" <${profile.smtpFromEmail || profile.smtpUser}>`,
    to,
    subject,
    html,
    text,
  };

  return transporter.sendMail(mailOptions);
}
