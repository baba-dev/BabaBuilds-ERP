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
import { recordAuthFailure, recordPasswordAuthAuditEvent } from "@/lib/auth-observability";
import { logActivity } from "@/lib/activity-log";
import { deserializeSignupIntent, SIGNUP_INTENT_COOKIE } from "@/lib/signup-intent";
import {
  provisionTrialWorkspace,
  sanitizeSignupIntent,
} from "@/lib/auth-workspace-provision";
import {
  HIGH_RISK_MAGIC_LINK_ERROR_CODE,
  HIGH_RISK_PASSWORD_ERROR_CODE,
  MFA_POLICY_ERROR_CODE,
  classifyLoginProvider,
  hasHighRiskRole,
  isEmailMagicLinkAllowedForRoles,
  isMagicLinkExceptionEmail,
  isPhishingResistantSignIn,
} from "@/lib/security/access-risk";
import {
  hashPassword,
  isLegacyPasswordHash,
  normalizeLoginEmail,
  validatePasswordStrength,
  verifyAgainstDummyHash,
  verifyPassword,
} from "@/lib/auth/password";
import { normalizeIp } from "@/lib/request-ip";
import { consumeLoginToken } from "@/lib/auth/passkeys";
import { isGoogleAuthEnabled } from "@/lib/auth/provider-flags";
import {
  checkPasswordAuthRateLimit,
  clearPasswordAuthRateLimit,
  hashRateLimitValue,
  recordPasswordAuthFailure,
} from "@/lib/auth/rate-limit";
import { getErrorMessage } from "@/lib/error-utils";

const LOGIN_ROUTE = "/login";
const CANONICAL_DASHBOARD_ROUTE = "/dashboard";
async function consumeSignupIntent() {
  const store = await cookies();
  const intent = sanitizeSignupIntent(deserializeSignupIntent(store.get(SIGNUP_INTENT_COOKIE)?.value));
  try {
    store.set(SIGNUP_INTENT_COOKIE, "", { path: "/", maxAge: 0 });
  } catch (error) {
    console.warn("Could not clear signup intent cookie in this context", error);
  }
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
    groupId?: string | null;
    activeCompanyName?: string | null;
    activeGroupName?: string | null;
    isMultiCompany?: boolean;
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

const googleAuthEnabled = isGoogleAuthEnabled();
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

type AccessibleWorkspaceMembership = {
  role: string;
  businessRole: string | null;
  workspace: {
    id: string;
    name: string;
    baseCurrency: string;
    isSetupComplete: boolean;
    countryCode: string;
    companyGroupLinks: Array<{
      companyGroupId: string;
      companyGroup: { name: string };
    }>;
  };
};

type GroupAccessibleWorkspaceMembership = {
  role: string;
  groupRole: string;
  accessMode: string;
  companyGroup: {
    workspaces: Array<{
      isActive: boolean;
      workspace: AccessibleWorkspaceMembership["workspace"];
    }>;
  };
  workspaceAccess: Array<{
    isActive: boolean;
    accessRole: string;
    workspace: AccessibleWorkspaceMembership["workspace"];
  }>;
};

function getRequestedWorkspaceId(session: unknown) {
  const workspaceId = (session as { workspaceId?: unknown } | null)?.workspaceId;
  return typeof workspaceId === "string" && workspaceId.trim() ? workspaceId : null;
}

function getRequestedGroupId(session: unknown) {
  const groupId = (session as { groupId?: unknown } | null)?.groupId;
  return typeof groupId === "string" && groupId.trim() ? groupId : null;
}

function pickActiveWorkspace(
  memberships: AccessibleWorkspaceMembership[],
  requestedWorkspaceId?: string | null,
): AccessibleWorkspaceMembership | null {
  if (requestedWorkspaceId) {
    const preserved = memberships.find((membership) => membership.workspace.id === requestedWorkspaceId);
    if (preserved) return preserved;
  }

  return memberships[0] ?? null;
}

function addAccessibleWorkspaceMembership(
  memberships: AccessibleWorkspaceMembership[],
  seenWorkspaceIds: Set<string>,
  membership: AccessibleWorkspaceMembership,
) {
  if (seenWorkspaceIds.has(membership.workspace.id)) return;
  seenWorkspaceIds.add(membership.workspace.id);
  memberships.push(membership);
}

function combineAccessibleWorkspaceMemberships(
  directMemberships: AccessibleWorkspaceMembership[],
  groupMemberships: GroupAccessibleWorkspaceMembership[],
) {
  const memberships: AccessibleWorkspaceMembership[] = [];
  const seenWorkspaceIds = new Set<string>();

  for (const membership of directMemberships) {
    addAccessibleWorkspaceMembership(memberships, seenWorkspaceIds, membership);
  }

  for (const membership of groupMemberships) {
    if (membership.accessMode === "ALL_COMPANIES") {
      for (const link of membership.companyGroup.workspaces) {
        if (!link.isActive) continue;
        addAccessibleWorkspaceMembership(memberships, seenWorkspaceIds, {
          role: membership.role,
          businessRole: membership.groupRole,
          workspace: link.workspace,
        });
      }
      continue;
    }

    for (const access of membership.workspaceAccess) {
      if (!access.isActive) continue;
      addAccessibleWorkspaceMembership(memberships, seenWorkspaceIds, {
        role: access.accessRole || membership.role,
        businessRole: access.accessRole || membership.groupRole,
        workspace: access.workspace,
      });
    }
  }

  return memberships;
}

function applyActiveWorkspaceToToken(
  token: Record<string, unknown>,
  membership: AccessibleWorkspaceMembership,
  accessibleWorkspaceCount: number,
  requestedGroupId?: string | null,
) {
  const workspace = membership.workspace;
  const groupLink = (requestedGroupId
    ? workspace.companyGroupLinks.find((link) => link.companyGroupId === requestedGroupId)
    : null) ?? workspace.companyGroupLinks[0] ?? null;

  token.workspaceId = workspace.id;
  token.groupId = groupLink?.companyGroupId ?? null;
  token.activeCompanyName = workspace.name;
  token.activeGroupName = groupLink?.companyGroup.name ?? null;
  token.isMultiCompany = accessibleWorkspaceCount > 1 || Boolean(groupLink);
  token.baseCurrency = workspace.baseCurrency;
  token.isSetupComplete = workspace.isSetupComplete;
  token.countryCode = workspace.countryCode;
  token.role = membership.role;
  // businessRole is for UI hints only — enforcement uses fresh DB lookup in lib/rbac.ts
  token.businessRole = membership.businessRole ?? membership.role;
}

function clearActiveWorkspaceToken(token: Record<string, unknown>) {
  delete token.workspaceId;
  delete token.groupId;
  delete token.activeCompanyName;
  delete token.activeGroupName;
  token.isMultiCompany = false;
  delete token.baseCurrency;
  delete token.isSetupComplete;
  delete token.countryCode;
  delete token.role;
  delete token.businessRole;
}

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

function isAllowedDemoMfaBypass(input: { provider?: string | null; email?: string | null }) {
  const isDemoEmail = Boolean(input.email?.toLowerCase().endsWith("@bababuilds.demo"));
  // NextAuth reports CredentialsProvider as provider "credentials"; the configured id "demo-login" is not on `account`.
  const isDemoCredentialsSignIn =
    input.provider === "credentials" || input.provider === "demo-login";
  return isDemoCredentialsSignIn && isDemoEmail;
}

const ACCOUNT_LOCK_THRESHOLD = 10;
const ACCOUNT_LOCK_MS = 10 * 60 * 1000;

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
      id: "password-login",
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const email = normalizeLoginEmail(credentials?.email || "");
        const password = credentials?.password || "";
        // Prefer the headers Cloudflare/nginx overwrite; x-forwarded-for is only a last resort.
        const ip =
          normalizeIp(
            (req?.headers?.["cf-connecting-ip"] ||
              req?.headers?.["x-real-ip"] ||
              req?.headers?.["x-forwarded-for"] ||
              "")
              .toString(),
          ) ?? "unknown";
        const rateLimitKey = `password-login:${hashRateLimitValue(email || "missing")}:${hashRateLimitValue(ip)}`;

        if (!email || !password) {
          recordAuthFailure({ reason: "PASSWORD_LOGIN_MISSING_CREDENTIALS", code: "PASSWORD_LOGIN_FAILED", provider: "password-login" });
          return null;
        }

        const limit = checkPasswordAuthRateLimit(rateLimitKey);
        if (!limit.ok) {
          recordAuthFailure({ reason: "PASSWORD_LOGIN_RATE_LIMITED", code: "PASSWORD_LOGIN_RATE_LIMITED", provider: "password-login" });
          recordPasswordAuthAuditEvent({ email, outcome: "rate_limited", ip, retryAfterSeconds: limit.retryAfterSeconds });
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            isDemo: true,
            passwordHash: true,
            passwordLockedUntil: true,
            passwordFailedAttempts: true,
          },
        });

        if (!user || user.isDemo || !user.passwordHash) {
          // Burn the same CPU as a real check so response time cannot be used to enumerate accounts.
          await verifyAgainstDummyHash(password);
          recordPasswordAuthFailure(rateLimitKey);
          recordAuthFailure({ reason: user?.isDemo ? "PASSWORD_LOGIN_DEMO_USER_BLOCKED" : "PASSWORD_LOGIN_INVALID_CREDENTIALS", code: "PASSWORD_LOGIN_FAILED", provider: "password-login" });
          recordPasswordAuthAuditEvent({ email, outcome: "failure", ip });
          return null;
        }

        if (user.passwordLockedUntil && user.passwordLockedUntil > new Date()) {
          await verifyAgainstDummyHash(password);
          recordAuthFailure({ reason: "PASSWORD_LOGIN_ACCOUNT_LOCKED", code: "PASSWORD_LOGIN_LOCKED", provider: "password-login" });
          recordPasswordAuthAuditEvent({ email, userId: user.id, outcome: "locked", ip });
          return null;
        }

        const passwordMatches = await verifyPassword(password, user.passwordHash);
        if (!passwordMatches) {
          // A single IP is throttled by the (email, ip) limiter above. The account itself only locks
          // after many failures overall, so one attacker cannot lock a real user out in 5 guesses.
          recordPasswordAuthFailure(rateLimitKey);
          const updated = await prisma.user.update({
            where: { id: user.id },
            data: { passwordFailedAttempts: { increment: 1 }, passwordLastFailureAt: new Date() },
            select: { passwordFailedAttempts: true },
          });
          if (updated.passwordFailedAttempts >= ACCOUNT_LOCK_THRESHOLD) {
            await prisma.user.update({
              where: { id: user.id },
              data: { passwordLockedUntil: new Date(Date.now() + ACCOUNT_LOCK_MS), passwordFailedAttempts: 0 },
            });
          }
          recordAuthFailure({ reason: "PASSWORD_LOGIN_INVALID_CREDENTIALS", code: "PASSWORD_LOGIN_FAILED", provider: "password-login" });
          recordPasswordAuthAuditEvent({ email, userId: user.id, outcome: "failure", ip });
          return null;
        }

        // One write, and only when something actually has to change (clear counters / upgrade hash).
        const needsRehash = isLegacyPasswordHash(user.passwordHash) && !validatePasswordStrength(password);
        if (needsRehash || user.passwordFailedAttempts > 0 || user.passwordLockedUntil) {
          const upgradedHash = needsRehash ? await hashPassword(password).catch(() => null) : null;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              passwordFailedAttempts: 0,
              passwordLockedUntil: null,
              passwordLastFailureAt: null,
              ...(upgradedHash ? { passwordHash: upgradedHash } : {}),
            },
          });
        }
        clearPasswordAuthRateLimit(rateLimitKey);
        recordPasswordAuthAuditEvent({ email, userId: user.id, outcome: "success", ip });

        return { id: user.id, name: user.name, email: user.email, image: user.image, authMethod: "password", phishingResistant: false };
      },
    }),

    CredentialsProvider({
      id: "passkey-login",
      name: "Passkey",
      credentials: {
        token: { label: "Verified passkey token", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.token) return null;
        const user = await consumeLoginToken(credentials.token);
        if (!user) {
          recordAuthFailure({ reason: "PASSKEY_LOGIN_TOKEN_INVALID", code: "PASSKEY_LOGIN_FAILED", provider: "passkey-login" });
          return null;
        }
        return { id: user.id, name: user.name, email: user.email, image: user.image, authMethod: "passkey", phishingResistant: true };
      },
    }),

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
      const [pendingInvites, memberships] = await Promise.all([
        prisma.workspaceInvite.findMany({
          where: {
            email: inviteEmail,
            expiresAt: { gt: new Date() },
          },
          select: { id: true, workspaceId: true, role: true, businessRole: true },
        }),
        user.id
          ? prisma.workspaceUser.findMany({
              where: { userId: user.id },
              select: { role: true, businessRole: true, workspaceId: true },
            })
          : Promise.resolve([] as Array<{ role: string; businessRole: string | null; workspaceId: string }>),
      ]);

      const effectiveRoles = [
        ...memberships.flatMap((membership) => [membership.businessRole, membership.role]),
        ...pendingInvites.flatMap((invite) => [invite.businessRole, invite.role]),
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

      const loginRisk = classifyLoginProvider(account);
      const userAuthContext = user as { phishingResistant?: boolean; authMethod?: string };
      const isPasswordOnlyHighRiskSignIn =
        hasHighRiskRole(effectiveRoles) &&
        (loginRisk.method === "password" || userAuthContext.authMethod === "password") &&
        !userAuthContext.phishingResistant;

      if (isPasswordOnlyHighRiskSignIn) {
        recordAuthFailure({
          reason: "HIGH_RISK_PASSWORD_ONLY_BLOCKED",
          code: HIGH_RISK_PASSWORD_ERROR_CODE,
          provider: loginRisk.provider,
        });
        return `/login?error=${HIGH_RISK_PASSWORD_ERROR_CODE}&provider=${encodeURIComponent(loginRisk.provider)}`;
      }

      const isAllowedExceptionMagicLinkSignIn = isExceptionEmail && account?.provider === "email";
      if (hasHighRiskRole(effectiveRoles) && !isPhishingResistantSignIn(account) && !userAuthContext.phishingResistant && !isAllowedExceptionMagicLinkSignIn) {
        if (isAllowedDemoMfaBypass({ provider: account?.provider, email: user.email })) {
          return true;
        }

        const provider = account?.provider ?? "unknown";
        recordAuthFailure({
          reason: "HIGH_RISK_ROLE_REQUIRES_PHISHING_RESISTANT_MFA",
          code: MFA_POLICY_ERROR_CODE,
          provider,
        });
        return `/login?error=${MFA_POLICY_ERROR_CODE}&provider=${encodeURIComponent(provider)}`;
      }

      if (!user.id || pendingInvites.length === 0) {
        return true;
      }

      await prisma.$transaction(async (tx) => {
        for (const invite of pendingInvites) {
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
              businessRole: invite.businessRole ?? undefined,
              joinedAt: new Date(),
            },
            update: {
              role: invite.role,
              businessRole: invite.businessRole ?? undefined,
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
      const requestedWorkspaceId =
        trigger === "update" ? getRequestedWorkspaceId(session) : (token.workspaceId as string | undefined);
      const requestedGroupId =
        trigger === "update" ? getRequestedGroupId(session) : (token.groupId as string | undefined);

      if (user) {
        token.id = user.id;
      }

      const userId = token.id as string | undefined;
      if (!userId) {
        return token;
      }

      // Optimize NextAuth to avoid hitting SQLite on every request.
      // Only query the database on sign-in (user is defined),
      // an explicit update, or if critical info is missing from the token.
      const needsDbRefresh = !!user || trigger === "update" || !token.workspaceId || !token.locale;
      if (!needsDbRefresh) {
        return token;
      }

      const provisionWorkspaceForUser = async (input: { id: string; email?: string | null; name?: string | null }) => {
        const signupIntent = await consumeSignupIntent();
        return provisionTrialWorkspace({
          userId: input.id,
          email: input.email,
          name: input.name,
          signupIntent,
          source: "nextauth_jwt_autoprovision",
        });
      };

      const dbUserPromise = prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          name: true,
          locale: true,
          currencyFormat: true,
          workspaces: {
            where: { isActive: true },
            orderBy: { joinedAt: "asc" },
            select: {
              role: true,
              businessRole: true,
              workspace: {
                select: {
                  id: true,
                  name: true,
                  baseCurrency: true,
                  isSetupComplete: true,
                  countryCode: true,
                  companyGroupLinks: {
                    where: {
                      isActive: true,
                      companyGroup: { members: { some: { userId, isActive: true } } },
                    },
                    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
                    take: 1,
                    select: {
                      companyGroupId: true,
                      companyGroup: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const groupMembershipsPromise = prisma.companyGroupMember.findMany({
        where: { userId, isActive: true },
        select: {
          role: true,
          groupRole: true,
          accessMode: true,
          companyGroup: {
            select: {
              workspaces: {
                where: { isActive: true },
                orderBy: { createdAt: "asc" },
                select: {
                  isActive: true,
                  workspace: {
                    select: {
                      id: true,
                      name: true,
                      baseCurrency: true,
                      isSetupComplete: true,
                      countryCode: true,
                      companyGroupLinks: {
                        where: {
                          isActive: true,
                          companyGroup: { members: { some: { userId, isActive: true } } },
                        },
                        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
                        take: 1,
                        select: {
                          companyGroupId: true,
                          companyGroup: { select: { name: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          workspaceAccess: {
            where: {
              isActive: true,
              workspace: { companyGroupLinks: { some: { isActive: true } } },
            },
            orderBy: { createdAt: "asc" },
            select: {
              isActive: true,
              accessRole: true,
              workspace: {
                select: {
                  id: true,
                  name: true,
                  baseCurrency: true,
                  isSetupComplete: true,
                  countryCode: true,
                  companyGroupLinks: {
                    where: {
                      isActive: true,
                      companyGroup: { members: { some: { userId, isActive: true } } },
                    },
                    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
                    take: 1,
                    select: {
                      companyGroupId: true,
                      companyGroup: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const dbUser = await dbUserPromise;
      // If we can't load the user record, keep token as-is.
      if (!dbUser) {
        void groupMembershipsPromise.catch(() => undefined);
        return token;
      }

      const groupMemberships = (await groupMembershipsPromise) as GroupAccessibleWorkspaceMembership[];

      const accessibleMemberships = combineAccessibleWorkspaceMemberships(dbUser.workspaces, groupMemberships);

      // Auto-provision a workspace if the user has none (legacy accounts or partial bootstrap failures).
      if (accessibleMemberships.length === 0) {
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
                  name: true,
                  baseCurrency: true,
                  isSetupComplete: true,
                  countryCode: true,
                  companyGroupLinks: {
                    where: {
                      isActive: true,
                      companyGroup: { members: { some: { userId, isActive: true } } },
                    },
                    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
                    take: 1,
                    select: {
                      companyGroupId: true,
                      companyGroup: { select: { name: true } },
                    },
                  },
                },
              },
            },
          });

          if (membership?.workspace) {
            applyActiveWorkspaceToToken(token, membership, 1, requestedGroupId);
          }
        } catch (error: unknown) {
          logActivity({
            action: "workspace_bootstrap",
            outcome: "error",
            entityType: "workspace",
            entityId: null,
            actorId: userId,
            actorEmail: dbUser.email ?? null,
            metadata: {
              source: "nextauth_jwt_autoprovision",
              errorMessage: getErrorMessage(error, "Workspace bootstrap failed"),
            },
          });
        }
      } else {
        const currentWorkspaceId = typeof token.workspaceId === "string" ? token.workspaceId : null;
        const requestedMembership = requestedWorkspaceId
          ? accessibleMemberships.find((membership) => membership.workspace.id === requestedWorkspaceId) ?? null
          : null;
        const workspaceMembership = requestedWorkspaceId
          ? requestedMembership ?? pickActiveWorkspace(accessibleMemberships, currentWorkspaceId)
          : pickActiveWorkspace(accessibleMemberships, currentWorkspaceId);

        if (workspaceMembership) {
          applyActiveWorkspaceToToken(token, workspaceMembership, accessibleMemberships.length, requestedGroupId);
        } else {
          clearActiveWorkspaceToken(token);
        }
      }

      token.locale = dbUser.locale;
      token.currencyFormat = dbUser.currencyFormat;

      return token;
    },

    async redirect({ url, baseUrl }) {
      const isRootRelativeCallback = (candidate: string) => candidate === "/" || candidate.startsWith("/?");
      const preserveQueryPaths = new Set([LOGIN_ROUTE, CANONICAL_DASHBOARD_ROUTE, "/setup"]);

      const preserveRelative = (pathWithQuery: string) => {
        const pathOnly = pathWithQuery.split("?")[0]?.split("#")[0] ?? pathWithQuery;
        if (isRootRelativeCallback(pathWithQuery) || isAuthErrorRoute(pathWithQuery)) {
          return `${baseUrl}${pathWithQuery}`;
        }
        if (preserveQueryPaths.has(pathOnly)) {
          return `${baseUrl}${pathWithQuery}`;
        }
        return `${baseUrl}${CANONICAL_DASHBOARD_ROUTE}`;
      };

      if (url.startsWith("/")) {
        return preserveRelative(url);
      }

      try {
        const target = new URL(url);
        if (target.origin === baseUrl) {
          const relative = `${target.pathname}${target.search}${target.hash}`;
          return preserveRelative(relative);
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
        session.groupId = (token.groupId as string | null | undefined) ?? null;
        session.activeCompanyName = (token.activeCompanyName as string | null | undefined) ?? null;
        session.activeGroupName = (token.activeGroupName as string | null | undefined) ?? null;
        session.isMultiCompany = Boolean(token.isMultiCompany);
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

      try {
        await provisionTrialWorkspace({
          userId: user.id,
          email: user.email,
          name: user.name,
          signupIntent,
          source: "nextauth_create_user",
        });
      } catch (error: unknown) {
        logActivity({
          action: "workspace_bootstrap",
          outcome: "error",
          entityType: "workspace",
          entityId: null,
          actorId: user.id,
          actorEmail: user.email ?? null,
          metadata: {
            source: "nextauth_create_user",
            errorMessage: getErrorMessage(error, "Workspace bootstrap failed"),
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
