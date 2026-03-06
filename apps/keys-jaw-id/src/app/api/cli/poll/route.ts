import { NextResponse } from "next/server";
import { deviceCodeStore } from "../store";

/**
 * GET /api/cli/poll?deviceCode=xxx
 *
 * CLI polls this endpoint to check if the user has completed auth.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const deviceCode = url.searchParams.get("deviceCode");

  if (!deviceCode) {
    return NextResponse.json(
      { error: "Missing deviceCode parameter" },
      { status: 400 },
    );
  }

  const entry = deviceCodeStore.get(deviceCode);

  if (!entry) {
    return NextResponse.json(
      { error: "expired_token", message: "Device code expired or not found" },
      { status: 404 },
    );
  }

  if (entry.status === "pending") {
    return NextResponse.json({ status: "pending" }, { status: 202 });
  }

  if (entry.status === "completed") {
    // Clean up after successful retrieval
    deviceCodeStore.delete(deviceCode);
    return NextResponse.json({
      status: "completed",
      result: entry.result,
    });
  }

  if (entry.status === "error") {
    deviceCodeStore.delete(deviceCode);
    return NextResponse.json(
      { status: "error", error: entry.result },
      { status: 400 },
    );
  }

  return NextResponse.json({ status: entry.status }, { status: 202 });
}

/**
 * POST /api/cli/poll
 *
 * Called by the device page to submit the result after user authenticates.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      deviceCode: string;
      submitToken: string;
      result: unknown;
      success: boolean;
      error?: { code: number; message: string };
    };

    const entry = deviceCodeStore.get(body.deviceCode);
    if (!entry) {
      return NextResponse.json(
        { error: "Device code not found or expired" },
        { status: 404 },
      );
    }

    // Validate submitToken to prevent unauthorized result submission
    if (!body.submitToken || body.submitToken !== entry.submitToken) {
      return NextResponse.json(
        { error: "Invalid submit token" },
        { status: 403 },
      );
    }

    if (body.success) {
      entry.status = "completed";
      entry.result = body.result;
    } else {
      entry.status = "error";
      entry.result = body.error ?? { code: -32000, message: "Unknown error" };
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to process result" },
      { status: 500 },
    );
  }
}
