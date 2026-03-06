import { NextResponse } from "next/server";
import { deviceCodeStore } from "../../store";

/**
 * GET /api/cli/device/lookup?userCode=XXXX-XXXX
 *
 * Finds a device code entry by its user-facing code.
 * Called by the cli-device page after user enters their code.
 */
export async function GET(request: Request) {
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
