import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose"

const TELEGRAM_ISSUER = "https://oauth.telegram.org"
const telegramJwks = createRemoteJWKSet(new URL(`${TELEGRAM_ISSUER}/.well-known/jwks.json`))

export type TelegramIdTokenClaims = JWTPayload & {
  id?: number | string
  name?: string
  preferred_username?: string
  picture?: string
  phone_number?: string
  nonce?: string
}

export async function verifyTelegramIdToken(input: {
  idToken: string
  clientId: string
  nonce?: string | null
}) {
  const { payload } = await jwtVerify(input.idToken, telegramJwks, {
    issuer: TELEGRAM_ISSUER,
    audience: input.clientId,
  })

  const claims = payload as TelegramIdTokenClaims
  if (input.nonce && claims.nonce !== input.nonce) {
    throw new Error("INVALID_NONCE")
  }

  return claims
}
