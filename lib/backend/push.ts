import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from "node:crypto"

/**
 * Minimal Web Push sender (RFC 8291 aes128gcm + RFC 8292 VAPID) using only node:crypto,
 * so no extra npm package is needed.
 */
export type PushSubscription = { endpoint: string; p256dh: string; auth: string }

const b64u = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const fromB64u = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64")
const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest()

export const pushConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || ""

export function vapidJwt(audience: string) {
  const pub = fromB64u(process.env.VAPID_PUBLIC_KEY!)
  const key = createPrivateKey({ key: { kty: "EC", crv: "P-256", d: process.env.VAPID_PRIVATE_KEY!, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: "jwk" })
  const header = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })))
  const claims = b64u(Buffer.from(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: process.env.VAPID_SUBJECT || "mailto:kontakt@successcleaningaps.dk" })))
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" })
  return `${header}.${claims}.${b64u(signature)}`
}

/** Encrypts a payload for one subscription (exported for tests). */
export function encryptPayload(payload: Buffer, uaPublicB64: string, authB64: string, salt = randomBytes(16), ecdh = createECDH("prime256v1")) {
  try { ecdh.getPrivateKey() } catch { ecdh.generateKeys() }
  const uaPublic = fromB64u(uaPublicB64)
  const authSecret = fromB64u(authB64)
  const asPublic = ecdh.getPublicKey()
  const shared = ecdh.computeSecret(uaPublic)
  const prkKey = hmac(authSecret, shared)
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]))
  const prk = hmac(salt, ikm)
  const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(0, 16)
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12)
  const cipher = createCipheriv("aes-128-gcm", cek, nonce)
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
  const rs = Buffer.alloc(4)
  rs.writeUInt32BE(4096)
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body])
}

/** Sends one push. Returns "gone" when the subscription should be deleted. */
export async function sendPush(sub: PushSubscription, data: Record<string, unknown>): Promise<"ok" | "gone" | "error"> {
  if (!pushConfigured()) return "error"
  try {
    const url = new URL(sub.endpoint)
    const body = encryptPayload(Buffer.from(JSON.stringify(data)), sub.p256dh, sub.auth)
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: { "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "normal", Authorization: `vapid t=${vapidJwt(url.origin)}, k=${process.env.VAPID_PUBLIC_KEY}` },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 404 || res.status === 410) return "gone"
    return res.ok ? "ok" : "error"
  } catch {
    return "error"
  }
}
