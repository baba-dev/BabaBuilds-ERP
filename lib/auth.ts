import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { createTransport } from "nodemailer"; // 1. ADDED IMPORT
import addressparser from "nodemailer/lib/addressparser";
import { recordAuthFailure } from "@/lib/auth-observability";
import { normalizeLaunchDestination } from "@/lib/launch-routing";
import { logActivity } from "@/lib/activity-log";
import {
  HIGH_RISK_MAGIC_LINK_ERROR_CODE,
  hasHighRiskRole,
  isEmailMagicLinkAllowedForRoles,
  isMagicLinkExceptionEmail,
  isPhishingResistantSignIn,
} from "@/lib/security/access-risk";

const CANONICAL_DASHBOARD_ROUTE = "/dashboard";
const LOGIN_ROUTE = "/login";

function isAuthErrorRoute(candidate: string) {
  return candidate === LOGIN_ROUTE || candidate.startsWith(`${LOGIN_ROUTE}?`) || candidate.startsWith(`${LOGIN_ROUTE}#`);
}

type ParsedSenderAddress = { name?: string; address?: string };

function hasNonEmptyEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function isProviderEnabled(toggleEnvName: string, inferredFromEnvVars: readonly string[]) {
  const toggle = process.env[toggleEnvName]?.trim().toLowerCase();

  if (toggle === "true" || toggle === "1" || toggle === "yes" || toggle === "on") {
    return true;
  }

  if (toggle === "false" || toggle === "0" || toggle === "no" || toggle === "off") {
    return false;
  }

  return inferredFromEnvVars.some((envName) => hasNonEmptyEnv(envName));
}

const googleAuthEnabled = isProviderEnabled("AUTH_GOOGLE_ENABLED", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
const emailAuthEnabled = isProviderEnabled("AUTH_EMAIL_ENABLED", [
  "EMAIL_SERVER_HOST",
  "EMAIL_SERVER_PORT",
  "EMAIL_SERVER_USER",
  "EMAIL_SERVER_PASSWORD",
  "EMAIL_FROM",
]);

function validateAndNormalizeEmailSender(emailFrom?: string): string {
  if (!emailFrom) {
    throw new Error(
      "Invalid auth configuration: EMAIL_FROM is required and must be a valid email sender address.",
    );
  }

  const parsed = addressparser(emailFrom) as ParsedSenderAddress[];

  if (parsed.length !== 1 || !parsed[0]?.address) {
    throw new Error(
      `Invalid auth configuration: EMAIL_FROM must contain exactly one sender address. Received: "${emailFrom}".`,
    );
  }

  const sender = parsed[0];
  const normalizedAddress = sender.address?.trim();

  if (!normalizedAddress) {
    throw new Error(
      `Invalid auth configuration: EMAIL_FROM must include a valid email address. Received: "${emailFrom}".`,
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedAddress)) {
    throw new Error(
      `Invalid auth configuration: EMAIL_FROM contains an invalid email address "${normalizedAddress}".`,
    );
  }

  return sender.name ? `${sender.name} <${normalizedAddress}>` : normalizedAddress;
}

const emailSender = emailAuthEnabled ? validateAndNormalizeEmailSender(process.env.EMAIL_FROM) : "";

function escapeHtmlText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value: string) {
  return escapeHtmlText(value)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeEmailUrl(value: string) {
  const trimmed = value.trim();
  try {
    return new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
}

function inferProviderFromMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return "unknown";
  const m = metadata as any;
  return (
    m.provider ??
    m.providerId ??
    m.account?.provider ??
    m.cause?.providerId ??
    "unknown"
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 60 * 60 * 8, updateAge: 60 * 30 },
  jwt: { maxAge: 60 * 60 * 8 },
  logger: {
    error(code, metadata) {
      const provider = inferProviderFromMetadata(metadata as Record<string, any> | undefined);
      const reason = String(code || "UNKNOWN_NEXTAUTH_ERROR");
      console.error(`[NextAuth][error] provider=${provider} code=${reason}`, metadata);
      recordAuthFailure({ reason, provider, code: reason });
    },
    warn(code) {
      console.warn(`[NextAuth][warn] code=${code}`);
    },
  },
  providers: [
    ...(googleAuthEnabled
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
    ...(emailAuthEnabled
      ? [
          // 2. UPGRADED EMAIL PROVIDER
          EmailProvider({
            server: {
              host: process.env.EMAIL_SERVER_HOST,
              port: Number(process.env.EMAIL_SERVER_PORT),
              auth: {
                user: process.env.EMAIL_SERVER_USER,
                pass: process.env.EMAIL_SERVER_PASSWORD,
              },
            },
            from: emailSender,
            sendVerificationRequest: async ({ identifier, url, provider }) => {
              const transport = createTransport(provider.server);
              const normalizedUrl = normalizeEmailUrl(url);
              const escapedIdentifier = escapeHtmlText(identifier);
              const escapedUrlText = escapeHtmlText(normalizedUrl);
              const escapedUrlHref = escapeHtmlAttribute(normalizedUrl);
              const plainTextBody = `Sign in to BabaBuilds ERP\n${normalizedUrl}\n\nIf you did not request this email you can safely ignore it.`;

              const result = await transport.sendMail({
                to: identifier,
                from: provider.from,
                subject: `Secure Authentication - BabaBuilds ERP`,
                text: plainTextBody,
                html: `
            <body style="background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 60px 20px; margin: 0;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-w: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01);">
                <tr>
                  <td style="padding: 48px 40px; text-align: center;">
                    
                    <h1 style="margin: 0; color: #09090b; font-size: 28px; font-weight: 900; letter-spacing: -0.5px;">BabaBuilds</h1>
                    <p style="margin: 4px 0 0 0; color: #4f46e5; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Command Center</p>
                    
                    <h2 style="margin: 40px 0 16px 0; color: #18181b; font-size: 20px; font-weight: 600;">Secure Login Request</h2>
                    <p style="margin: 0 0 32px 0; color: #52525b; font-size: 15px; line-height: 24px;">
                      We received a request to authenticate <strong>${escapedIdentifier}</strong> into the BabaBuilds ERP platform. Click the button below to securely sign in.
                    </p>
                    
                    <a href="${escapedUrlHref}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; text-decoration: none; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.3);">
                      Authenticate Session
                    </a>
                    
                    <p style="margin: 32px 0 0 0; color: #71717a; font-size: 13px;">
                      This secure link will expire in 15 minutes.
                    </p>

                    <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 40px 0 24px 0;" />
                    
                    <p style="margin: 0 0 8px 0; color: #a1a1aa; font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">Trouble clicking?</p>
                    <p style="margin: 0; color: #71717a; font-size: 12px; word-break: break-all;">
                      Copy and paste this URL into your browser:<br/>
                      <a href="${escapedUrlHref}" style="color: #4f46e5; text-decoration: underline;">${escapedUrlText}</a>
                    </p>

                  </td>
                </tr>
                <tr>
                  <td style="background-color: #fafafa; padding: 24px 40px; text-align: center; border-top: 1px solid #e4e4e7;">
                    <p style="margin: 0; color: #a1a1aa; font-size: 12px; line-height: 18px;">
                      If you did not attempt to log in, your account is still secure. You can safely delete this email.
                      <br/><br/>
                      &copy; ${new Date().getFullYear()} BabaBuilds Technologies. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </body>
          `,
              });

              const failed = result.rejected.concat(result.pending).filter(Boolean);
              if (failed.length) {
                throw new Error(`Email(s) (${failed.join(", ")}) could not be sent`);
              }
            },
          }),
        ]
      : []),

    CredentialsProvider({
      id: "demo-login",
      name: "Demo Account",
      credentials: {
        email: { label: "Demo Email", type: "text" },
        password: { label: "Secure Token", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.email.endsWith('@bababuilds.demo') || !credentials.password) {
          return null;
        }

        const validToken = await prisma.verificationToken.findFirst({
          where: {
            identifier: credentials.email,
            token: credentials.password,
            expires: { gt: new Date() }
          }
        });

        if (!validToken) return null;

        await prisma.verificationToken.delete({
          where: {
            identifier_token: {
              identifier: credentials.email,
              token: credentials.password
            }
          }
        });

        const user = await prisma.user.findUnique({ 
          where: { email: credentials.email } 
        });
        
        return user;
      }
    })
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user?.email) return false;

      const inviteEmail = user.email.toLowerCase();
      const pendingInvites = await prisma.workspaceInvite.findMany({
        where: {
          email: inviteEmail,
          expiresAt: { gt: new Date() },
        },
        select: { id: true, workspaceId: true, role: true },
      });

      const memberships = user.id
        ? await prisma.workspaceUser.findMany({
            where: { userId: user.id },
            select: { role: true, workspaceId: true },
          })
        : [];

      const effectiveRoles = [
        ...memberships.map((membership) => membership.role),
        ...pendingInvites.map((invite) => invite.role),
      ];

      const isExceptionEmail = isMagicLinkExceptionEmail(user.email);

      if (!isEmailMagicLinkAllowedForRoles(effectiveRoles, user.email) && account?.provider === "email") {
        recordAuthFailure({
          reason: "HIGH_RISK_MAGIC_LINK_BLOCKED",
          code: HIGH_RISK_MAGIC_LINK_ERROR_CODE,
          provider: "email",
        });
        return `/login?error=${HIGH_RISK_MAGIC_LINK_ERROR_CODE}&provider=email`;
      }

      const isAllowedExceptionMagicLinkSignIn = isExceptionEmail && account?.provider === "email";
      if (hasHighRiskRole(effectiveRoles) && !isPhishingResistantSignIn(account) && !isAllowedExceptionMagicLinkSignIn) {
        const provider = account?.provider ?? "unknown";
        recordAuthFailure({
          reason: "HIGH_RISK_ROLE_REQUIRES_PHISHING_RESISTANT_MFA",
          code: "MFA_POLICY_BLOCK",
          provider,
        });
        return "/login?error=MFA_POLICY_BLOCK";
      }

      if (!user.id || pendingInvites.length === 0) {
        return true;
      }

      await prisma.$transaction(async (tx) => {
        for (const invite of pendingInvites) {
          await tx.workspaceUser.createMany({
            data: {
              userId: user.id,
              workspaceId: invite.workspaceId,
              role: invite.role,
            },
          });
        }

        await tx.workspaceInvite.deleteMany({
          where: { id: { in: pendingInvites.map((invite) => invite.id) } },
        });
      });

      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (trigger === "update" && session) {
        return { ...token, ...session };
      }

      if (user) {
        token.id = user.id;
      }

      const dbUser = await prisma.user.findUnique({
        where: { id: token.id as string },
        select: {
          locale: true,
          currencyFormat: true,
          workspaces: {
            take: 1,
            select: {
              role: true,
              workspace: {
                select: {
                  id: true,
                  baseCurrency: true,
                  isSetupComplete: true,
                  countryCode: true,
                },
              },
            },
          },
        },
      });

      if (dbUser && dbUser.workspaces.length > 0) {
        const workspaceMembership = dbUser.workspaces[0];
        const ws = workspaceMembership.workspace;
        token.workspaceId = ws.id;
        token.baseCurrency = ws.baseCurrency;
        token.isSetupComplete = ws.isSetupComplete;
        token.countryCode = ws.countryCode;
        token.locale = dbUser.locale;
        token.currencyFormat = dbUser.currencyFormat;
        token.role = workspaceMembership.role;
      }

      return token;
    },

    async redirect({ url, baseUrl }) {
      const isRootRelativeCallback = (candidate: string) => candidate === "/" || candidate.startsWith("/?");

      if (url.startsWith("/")) {
        if (isRootRelativeCallback(url) || isAuthErrorRoute(url)) {
          return `${baseUrl}${url}`;
        }
        return `${baseUrl}${normalizeLaunchDestination(url)}`;
      }

      try {
        const target = new URL(url);
        if (target.origin === baseUrl) {
          if (target.pathname === "/" || target.pathname === LOGIN_ROUTE) {
            return `${baseUrl}${target.search}${target.hash}`;
          }
          const normalized = normalizeLaunchDestination(`${target.pathname}${target.search}${target.hash}`);
          return `${baseUrl}${normalized}`;
        }
      } catch {
        return `${baseUrl}${CANONICAL_DASHBOARD_ROUTE}`;
      }

      return url;
    },

    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.id;
        (session as any).workspaceId = token.workspaceId;
        (session as any).baseCurrency = token.baseCurrency;
        (session as any).isSetupComplete = token.isSetupComplete;
        (session as any).countryCode = token.countryCode;
        (session as any).locale = token.locale;
        (session.user as any).currencyFormat = token.currencyFormat;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (user.email?.endsWith('@bababuilds.demo')) return;

      const trialDays = 14;
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + trialDays);

      try {
        const workspace = await prisma.workspace.create({
          data: {
            name: `${user.name?.split(' ')[0] || user.email?.split('@')[0] || 'My'} Business`, 
            subscriptionStatus: "TRIALING",
            subscriptionEndsAt: trialEndDate, 
            users: { create: { userId: user.id, role: "OWNER" } }
          }
        });

        logActivity({
          action: "workspace_bootstrap",
          outcome: "success",
          entityType: "workspace",
          entityId: workspace.id,
          workspaceId: workspace.id,
          actorId: user.id,
          actorEmail: user.email ?? null,
          metadata: {
            source: "nextauth_create_user",
          },
        });
      } catch (error: any) {
        logActivity({
          action: "workspace_bootstrap",
          outcome: "error",
          entityType: "workspace",
          entityId: null,
          actorId: user.id,
          actorEmail: user.email ?? null,
          metadata: {
            source: "nextauth_create_user",
            errorMessage: error?.message || "Workspace bootstrap failed",
          },
        });
        throw error;
      }
    }
  },
  pages: {
    signIn: "/login",
  },
};
