export function normalizeUsername(input) {
  if (typeof input !== "string") throw new TypeError("username must be a string");

  let value = input.trim();
  if (!value) throw new Error("username is required");

  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      const match = url.pathname.match(/\/@([^/?#]+)/);
      if (match) value = match[1];
    }
  } catch {
    // Fall through and validate the original input.
  }

  value = value.replace(/^@/, "").trim();

  if (!/^[A-Za-z0-9._]{2,24}$/.test(value)) {
    throw new Error("invalid TikTok username");
  }

  return value;
}
