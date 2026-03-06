import { NextResponse } from "next/server";
import { deviceCodeStore, canAddEntry } from "../store";

/**
 * POST /api/cli/device
 *
 * Creates a new device code for CLI headless authentication.
 * Returns a short user code and a device code for polling.
 */
export async function POST(request: Request) {
  try {
    if (!canAddEntry()) {
      return NextResponse.json(
        { error: "Too many active device codes. Please try again later." },
        { status: 429 },
      );
    }

    const body = (await request.json()) as {
      method?: string;
      params?: unknown;
      apiKey?: string;
    };

    // Limit params size to prevent memory abuse
    const paramsJson =
      body.params !== undefined ? JSON.stringify(body.params) : undefined;
    if (paramsJson && paramsJson.length > 65_536) {
      return NextResponse.json(
        { error: "params too large (max 64KB)" },
        { status: 413 },
      );
    }

    const userCode = generateUserCode();
    const deviceCode = crypto.randomUUID();
    const submitToken = crypto.randomUUID();

    deviceCodeStore.set(deviceCode, {
      userCode,
      method: body.method ?? "wallet_connect",
      params: body.params,
      apiKey: body.apiKey,
      status: "pending",
      result: null,
      submitToken,
      createdAt: Date.now(),
    });

    // Auto-expire after 5 minutes
    setTimeout(
      () => {
        deviceCodeStore.delete(deviceCode);
      },
      5 * 60 * 1000,
    );

    return NextResponse.json({
      userCode,
      deviceCode,
      verificationUrl: `${new URL(request.url).origin}/cli-device`,
      expiresIn: 300,
      interval: 5,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to create device code" },
      { status: 500 },
    );
  }
}

function generateUserCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No 0/O/1/I confusion
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const part = (offset: number) =>
    Array.from(
      { length: 4 },
      (_, i) => chars[bytes[offset + i]! % chars.length],
    ).join("");
  return `${part(0)}-${part(4)}`;
}
