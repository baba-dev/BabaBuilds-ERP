import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getRpID, storeChallenge } from "@/lib/auth/passkeys";

export async function POST() {
  const options = await generateAuthenticationOptions({
    rpID: getRpID(),
    userVerification: "required",
  });

  await storeChallenge({ challenge: options.challenge, type: "authentication" });
  return NextResponse.json(options);
}
