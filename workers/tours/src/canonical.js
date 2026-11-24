/** Canonical JSON (sorted keys, no whitespace) and SHA-256 integrity hashes for immutable snapshots. */
export function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Non-finite number in settings");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
}

export async function sha256Hex(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The hash covers the version number AND the full settings document. */
export async function snapshotHash(version, settings) {
  return sha256Hex(canonicalize({ version, settings }));
}

/** verifySnapshot(snapshot, hash): true only if the supplied snapshot still hashes to the supplied hash. */
export async function verifySnapshot(snapshot, hash) {
  if (!snapshot || typeof hash !== "string" || !Number.isInteger(snapshot.version) || typeof snapshot.settings !== "object" || snapshot.settings === null) return false;
  try {
    return constantTimeEqual(await snapshotHash(snapshot.version, snapshot.settings), hash.toLowerCase());
  } catch {
    return false;
  }
}

export function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
