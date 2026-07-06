import nodemailer from 'nodemailer';
import dns from 'dns';
import { promisify } from 'util';
import { decrypt } from '@/lib/encryption';
import { resolveBusinessProfileSettings } from '@/lib/business-profile-inheritance';

import { MailOptions } from '@/lib/types/business';

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
  } catch {
    return null; 
  }
}

export async function sendEmail({
  route = 'user',
  profile,
  to,
  subject,
  html,
  text,
  attachments
}: MailOptions) {
  let transporter;
  let fromAddress;

  if (route === 'system') {
    const host = process.env.EMAIL_SERVER_HOST;
    const port = Number(process.env.EMAIL_SERVER_PORT) || 587;
    const user = process.env.EMAIL_SERVER_USER;
    const pass = process.env.EMAIL_SERVER_PASSWORD;
    const from = process.env.EMAIL_FROM || '"BabaBuilds ERP" <no-reply@bababuilds.com>';

    if (!host || !user || !pass) {
      console.warn('[System Mailer] System SMTP is missing. Cannot send system email.');
      // The dispatcher won't log errors, but in API routes missing system SMTP should show logic.
      throw new Error('MISSING_SYSTEM_SMTP');
    }

    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    fromAddress = from;

  } else {
    // User route
    const smtpProfile = await resolveBusinessProfileSettings(profile ?? null, 'smtp');
    if (!smtpProfile || !smtpProfile.smtpHost || !smtpProfile.smtpUser || !smtpProfile.smtpPassword) {
      throw new Error('MISSING_USER_SMTP');
    }

    const safeIp = await resolveSafeIp(smtpProfile.smtpHost);
    if (!safeIp) {
      throw new Error('Invalid or internal SMTP Host blocked by security policy.');
    }

    transporter = nodemailer.createTransport({
      host: safeIp,
      port: smtpProfile.smtpPort || 587,
      secure: smtpProfile.smtpPort === 465,
      tls: {
        servername: smtpProfile.smtpHost,
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
        ciphers: 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256',
        honorCipherOrder: true,
      },
      auth: {
        user: smtpProfile.smtpUser,
        pass: getRuntimeSmtpPassword(smtpProfile.smtpPassword),
      },
    });

    fromAddress = `"${smtpProfile.companyName}" <${smtpProfile.smtpFromEmail || smtpProfile.smtpUser}>`;
  }

  const mailOptions = {
    from: fromAddress,
    to,
    subject,
    html,
    text,
    attachments: attachments?.map(att => ({
        filename: att.filename,
        path: att.path,
        contentType: att.contentType
    }))
  };

  return transporter.sendMail(mailOptions);
}

