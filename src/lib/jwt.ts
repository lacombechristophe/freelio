import { SignJWT, jwtVerify } from "jose"

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required")
}

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET)

export async function createGuestToken(payload: { 
  type: "QUOTE" | "INVOICE"; 
  id: string; 
  clientId: string;
}) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d") // Guest links valid for 30 days
    .sign(SECRET)
}

export async function verifyGuestToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as { 
      type: "QUOTE" | "INVOICE"; 
      id: string; 
      clientId: string;
    }
  } catch {
    return null
  }
}
