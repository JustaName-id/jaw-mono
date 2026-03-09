import { NextResponse } from "next/server";
import { deviceCodeStore } from "../../store";

/**
 * GET /api/cli/device/lookup?userCode=XXXX-XXXX
 *
 * Finds a device code entry by its user-facing code.
 * Called by the cli-device page after user enters their code.
 *
 * Rate-limited to 10 requests per minute per IP to prevent brute-force
 * guessing of user codes.
 */

// Simple in-memory rate limiter (per IP, 10 req/min)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return true;
  }

  rateLimitMap.set(ip, { count: entry.count + 1, resetAt: entry.resetAt });
  return false;
}

// Periodic cleanup of expired entries (every 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

export async function GET(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many lookup attempts. Please try again later." },
      { status: 429 },
    );
  }

  const url = new URL(request.url);
  const userCode = url.searchParams.get("userCode")?.trim().toUpperCase();

  if (!userCode) {
    return NextResponse.json(
      { error: "Missing userCode parameter" },
      { status: 400 },
    );
  }

  // Find the entry with matching user code
  for (const [deviceCode, entry] of deviceCodeStore.entries()) {
    if (entry.userCode === userCode && entry.status === "pending") {
      return NextResponse.json({
        deviceCode,
        method: entry.method,
        params: entry.params,
        submitToken: entry.submitToken,
        apiKey: entry.apiKey,
      });
    }
  }

  return NextResponse.json(
    { error: "Code not found or expired" },
    { status: 404 },
  );
}
