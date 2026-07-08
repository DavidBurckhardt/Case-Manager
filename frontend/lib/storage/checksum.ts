/**
 * Computes the SHA-256 hex digest of a File or Buffer.
 * Uses the Web Crypto API available natively in Node 18+ and all modern browsers.
 */
export async function sha256Hex(data: File | Buffer | Uint8Array): Promise<string> {
  let bytes: Uint8Array

  if (data instanceof File) {
    bytes = new Uint8Array(await data.arrayBuffer())
  } else if (Buffer.isBuffer(data)) {
    bytes = new Uint8Array(data)
  } else {
    bytes = data
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
