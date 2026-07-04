import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrigin, getRpID, rpName, storeChallenge } from "@/lib/auth/passkeys";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const credentials = await prisma.webAuthnCredential.findMany({
    where: { userId: session.user.id },
    select: { credentialID: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName,
    rpID: getRpID(),
    userID: Buffer.from(session.user.id),
    userName: session.user.email,
    userDisplayName: session.user.name || session.user.email,
    attestationType: "none",
    excludeCredentials: credentials.map((credential) => ({
      id: credential.credentialID,
      transports: credential.transports?.split(",").filter(Boolean) as AuthenticatorTransport[] | undefined,
    })),
    authenticatorSelection: {
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required",
    },
  });

  await storeChallenge({ challenge: options.challenge, type: "registration", userId: session.user.id });
  return NextResponse.json({ ...options, origin: getOrigin() });
}
