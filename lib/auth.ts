import { getLocaleDirection } from "@/lib/i18n";
import { NextAuthOptions } from "next-auth";
import { cookies } from "next/headers";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { createTransport } from "nodemailer"; // 1. ADDED IMPORT
import addressparser from "nodemailer/lib/addressparser";
import { recordAuthFailure } from "@/lib/auth-observability";
import { logActivity } from "@/lib/activity-log";
import { deserializeSignupIntent, SIGNUP_INTENT_COOKIE } from "@/lib/signup-intent";
import {
  HIGH_RISK_MAGIC_LINK_ERROR_CODE,
  hasHighRiskRole,
  isEmailMagicLinkAllowedForRoles,
  isMagicLinkExceptionEmail,
  isPhishingResistantSignIn,
} from "@/lib/security/access-risk";

const LOGIN_ROUTE = "/login";
const CANONICAL_DASHBOARD_ROUTE = "/dashboard";
const ALLOWED_SIGNUP_PLANS = new Set(["pro", "team"] as const);
const ALLOWED_SIGNUP_CYCLES = new Set(["monthly", "annual"] as const);
const DEFAULT_TRIAL_DAYS = 15;

function sanitizeSignupIntent(intent: ReturnType<typeof deserializeSignupIntent>) {
  if (!intent) return null;
  return {
    ...intent,
    plan: ALLOWED_SIGNUP_PLANS.has(intent.plan) ? intent.plan : "pro",
    cycle: ALLOWED_SIGNUP_CYCLES.has(intent.cycle) ? intent.cycle : "monthly",
    trial: DEFAULT_TRIAL_DAYS,
  };
}

async function consumeSignupIntent() {
  const store = await cookies();
  const intent = sanitizeSignupIntent(deserializeSignupIntent(store.get(SIGNUP_INTENT_COOKIE)?.value));
  store.set(SIGNUP_INTENT_COOKIE, "", { path: "/", maxAge: 0 });
  return intent;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      currencyFormat?: string;
      role?: string;
    };
    workspaceId: string;
    baseCurrency: string;
    isSetupComplete: boolean;
    countryCode: string;
    locale: string;
    role: string;
    /**
     * ERP business role for the active workspace.
     * Populated from WorkspaceUser.businessRole (fresh DB lookup on each JWT refresh).
     * NOTE: This is for UI hints only. Server-side enforcement always uses
     * requirePermission() from lib/rbac.ts which does its own fresh DB lookup.
     */
    businessRole: string;
  }
}


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
  const m = metadata as Record<string, unknown>;
  const account = m.account as Record<string, unknown> | undefined;
  const cause = m.cause as Record<string, unknown> | undefined;

  return (
    (m.provider as string | undefined) ??
    (m.providerId as string | undefined) ??
    (account?.provider as string | undefined) ??
    (cause?.providerId as string | undefined) ??
    "unknown"
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  jwt: { maxAge: 60 * 60 * 24 * 7 },
  logger: {
    error(code, metadata) {
      const provider = inferProviderFromMetadata(metadata as Record<string, unknown> | undefined);
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
              const userLocale = (await prisma.user.findUnique({ where: { email: identifier }, select: { locale: true } }))?.locale ?? "en-IN";
              const emailDir = getLocaleDirection(userLocale);

              const result = await transport.sendMail({
                to: identifier,
                from: provider.from,
                subject: `Secure Authentication - BabaBuilds ERP`,
                text: plainTextBody,
                html: `
            <body dir="${emailDir}" style="background-color: #f4f4f5; font-family: 'Inter', 'Noto Naskh Arabic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 60px 20px; margin: 0; direction: ${emailDir};">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-w: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01);">
                <tr>
                  <td style="padding: 48px 40px; text-align: center;">
                    
                    <h1 style="margin: 0; color: #09090b; font-size: 28px; font-weight: 900; letter-spacing: -0.5px;">BabaBuilds</h1>
                    <p style="margin: 4px 0 0 0; color: #4f46e5; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Command Center</p>
                    
                    <h2 style="margin: 40px 0 16px 0; color: #18181b; font-size: 20px; font-weight: 600;">Secure Login Request</h2>
                    <p style="margin: 0 0 32px 0; color: #52525b; font-size: 15px; line-height: 24px; text-align: ${emailDir === "rtl" ? "right" : "left"};">
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

      // Allow the demo credentials provider to bypass phishing-resistant MFA policy checks.
      // This is strictly scoped to the internal `demo-login` provider used for ephemeral demo accounts.
      if (account?.provider === "demo-login") {
        return true;
      }

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
        const isDemoCredentialsSignIn =
          Boolean(user.email?.endsWith("@bababuilds.demo")) &&
          (account?.provider === "demo-login" || account?.type === "credentials");
        if (isDemoCredentialsSignIn) {
          return true;
        }

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
          const fullInvite = await tx.workspaceInvite.findUnique({
            where: { id: invite.id },
            select: { businessRole: true, role: true },
          });
          await tx.workspaceUser.upsert({
            where: {
              userId_workspaceId: {
                userId: user.id,
                workspaceId: invite.workspaceId,
              },
            },
            create: {
              userId: user.id,
              workspaceId: invite.workspaceId,
              role: invite.role,
              businessRole: fullInvite?.businessRole ?? undefined,
              joinedAt: new Date(),
            },
            update: {
              role: invite.role,
              businessRole: fullInvite?.businessRole ?? undefined,
              isActive: true,
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

      const userId = token.id as string | undefined;
      if (!userId) {
        return token;
      }

      const provisionWorkspaceForUser = async (input: { id: string; email?: string | null; name?: string | null }) => {
        // Idempotent workspace bootstrap for legacy/edge cases where a user has no workspace membership.
        // This avoids a redirect loop where `/login` redirects to `/dashboard`, but dashboard rejects missing workspace context.
        const existingMembership = await prisma.workspaceUser.findFirst({
          where: { userId: input.id },
          select: { workspaceId: true },
        });
        if (existingMembership?.workspaceId) return existingMembership.workspaceId;

        const signupIntent = await consumeSignupIntent();
        const trialDays = DEFAULT_TRIAL_DAYS;
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + trialDays);

        const workspace = await prisma.workspace.create({
          data: {
            name: `${input.name?.split(" ")[0] || input.email?.split("@")[0] || "My"} Business`,
            subscriptionStatus: "TRIALING",
            subscriptionEndsAt: trialEndDate,
            signupIntentJson: signupIntent ? JSON.stringify(signupIntent) : null,
            users: { create: { userId: input.id, role: "OWNER" } },
          },
          select: { id: true },
        });

        if (signupIntent?.persona) {
          await prisma.userOnboarding.upsert({
            where: { userId: input.id },
            create: { userId: input.id, persona: signupIntent.persona },
            update: { persona: signupIntent.persona },
          });
        }

        logActivity({
          action: "workspace_bootstrap",
          outcome: "success",
          entityType: "workspace",
          entityId: workspace.id,
          workspaceId: workspace.id,
          actorId: input.id,
          actorEmail: input.email ?? null,
          metadata: {
            source: "nextauth_jwt_autoprovision",
          },
        });

        return workspace.id;
      };

      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          name: true,
          locale: true,
          currencyFormat: true,
          workspaces: {
            take: 1,
            select: {
              role: true,
              businessRole: true,
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

      // If we can't load the user record, keep token as-is.
      if (!dbUser) return token;

      // Auto-provision a workspace if the user has none (legacy accounts or partial bootstrap failures).
      if (dbUser.workspaces.length === 0) {
        try {
          const workspaceId = await provisionWorkspaceForUser({
            id: userId,
            email: dbUser.email,
            name: dbUser.name,
          });

          const membership = await prisma.workspaceUser.findFirst({
            where: { userId, workspaceId },
            select: {
              role: true,
              businessRole: true,
              workspace: {
                select: {
                  id: true,
                  baseCurrency: true,
                  isSetupComplete: true,
                  countryCode: true,
                },
              },
            },
          });

          if (membership?.workspace) {
            token.workspaceId = membership.workspace.id;
            token.baseCurrency = membership.workspace.baseCurrency;
            token.isSetupComplete = membership.workspace.isSetupComplete;
            token.countryCode = membership.workspace.countryCode;
            token.role = membership.role;
            token.businessRole = membership.businessRole ?? "OWNER";
          }
        } catch (error: any) {
          logActivity({
            action: "workspace_bootstrap",
            outcome: "error",
            entityType: "workspace",
            entityId: null,
            actorId: userId,
            actorEmail: dbUser.email ?? null,
            metadata: {
              source: "nextauth_jwt_autoprovision",
              errorMessage: error?.message || "Workspace bootstrap failed",
            },
          });
        }
      } else {
        const workspaceMembership = dbUser.workspaces[0];
        const ws = workspaceMembership.workspace;
        token.workspaceId = ws.id;
        token.baseCurrency = ws.baseCurrency;
        token.isSetupComplete = ws.isSetupComplete;
        token.countryCode = ws.countryCode;
        token.role = workspaceMembership.role;
        // businessRole is for UI hints only — enforcement uses fresh DB lookup in lib/rbac.ts
        token.businessRole = workspaceMembership.businessRole ?? workspaceMembership.role;
      }

      token.locale = dbUser.locale;
      token.currencyFormat = dbUser.currencyFormat;

      return token;
    },

    async redirect({ url, baseUrl }) {
      const isRootRelativeCallback = (candidate: string) => candidate === "/" || candidate.startsWith("/?");

      if (url.startsWith("/")) {
        if (isRootRelativeCallback(url) || isAuthErrorRoute(url)) {
          return `${baseUrl}${url}`;
        }
        return `${baseUrl}${CANONICAL_DASHBOARD_ROUTE}`;
      }

      try {
        const target = new URL(url);
        if (target.origin === baseUrl) {
          if (target.pathname === "/" || target.pathname === LOGIN_ROUTE) {
            return `${baseUrl}${target.search}${target.hash}`;
          }
          return `${baseUrl}${CANONICAL_DASHBOARD_ROUTE}`;
        }
      } catch {
        return `${baseUrl}${CANONICAL_DASHBOARD_ROUTE}`;
      }

      return `${baseUrl}${CANONICAL_DASHBOARD_ROUTE}`;
    },

    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.workspaceId = token.workspaceId as string;
        session.baseCurrency = token.baseCurrency as string;
        session.isSetupComplete = token.isSetupComplete as boolean;
        session.countryCode = token.countryCode as string;
        session.locale = token.locale as string;
        session.user.currencyFormat = token.currencyFormat as string;
        session.user.role = token.role as string;
        // UI hint only — server enforcement in lib/rbac.ts always does a fresh DB lookup
        session.businessRole = (token.businessRole ?? token.role) as string;
      }
      return session;
    },

  },
  events: {
    async createUser({ user }) {
      if (user.email?.endsWith('@bababuilds.demo')) return;

      const signupIntent = await consumeSignupIntent();
      const trialDays = DEFAULT_TRIAL_DAYS;
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + trialDays);

      try {
        const workspace = await prisma.workspace.create({
          data: {
            name: `${user.name?.split(' ')[0] || user.email?.split('@')[0] || 'My'} Business`, 
            subscriptionStatus: "TRIALING",
            subscriptionEndsAt: trialEndDate, 
            signupIntentJson: signupIntent ? JSON.stringify(signupIntent) : null,
            users: { create: { userId: user.id, role: "OWNER" } }
          }
        });

        if (signupIntent?.persona) {
          await prisma.userOnboarding.upsert({
            where: { userId: user.id },
            create: { userId: user.id, persona: signupIntent.persona },
            update: { persona: signupIntent.persona },
          });
        }

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
