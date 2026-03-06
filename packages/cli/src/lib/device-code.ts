/**
 * Device Code flow for headless/SSH environments.
 *
 * When the browser can't be opened (headless, SSH, CI):
 * 1. CLI creates a device code via keys.jaw.id API
 * 2. Displays a user code + URL for the user to visit on any device
 * 3. Polls for completion every 5 seconds
 * 4. Returns the result once the user authenticates
 */

interface DeviceCodeResponse {
  userCode: string;
  deviceCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
}

interface PollResponse {
  status: "pending" | "completed" | "error";
  result?: unknown;
  error?: { code: number; message: string };
}

export interface DeviceCodeOptions {
  keysUrl: string;
  method: string;
  params?: unknown;
  apiKey?: string;
  timeout?: number;
  onDisplayCode?: (userCode: string, verificationUrl: string) => void;
}

const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes

export async function deviceCodeFlow(
  options: DeviceCodeOptions,
): Promise<unknown> {
  const {
    keysUrl,
    method,
    params,
    apiKey,
    timeout = DEFAULT_TIMEOUT_MS,
  } = options;

  // Step 1: Create device code
  const createRes = await fetch(`${keysUrl}/api/cli/device`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params, apiKey }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create device code: ${createRes.statusText}`);
  }

  const deviceData = (await createRes.json()) as DeviceCodeResponse;

  // Step 2: Display code to user
  if (options.onDisplayCode) {
    options.onDisplayCode(deviceData.userCode, deviceData.verificationUrl);
  }

  // Step 3: Poll for completion
  const rawInterval = deviceData.interval ?? 5;
  const pollInterval = Math.max(3, Math.min(rawInterval, 60)) * 1000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    await sleep(pollInterval);

    const pollRes = await fetch(
      `${keysUrl}/api/cli/poll?deviceCode=${encodeURIComponent(deviceData.deviceCode)}`,
      { signal: AbortSignal.timeout(10_000) },
    );

    if (pollRes.status === 404) {
      throw new Error("Device code expired. Please try again.");
    }

    if (pollRes.status === 202) {
      continue; // Still pending
    }

    if (pollRes.ok) {
      const pollData = (await pollRes.json()) as PollResponse;

      if (pollData.status === "completed") {
        return pollData.result;
      }

      if (pollData.status === "error") {
        const errMsg =
          typeof pollData.error === "object" && pollData.error?.message
            ? pollData.error.message
            : "Authentication failed";
        throw new Error(errMsg);
      }
    }
  }

  throw new Error(
    `Device code authentication timed out after ${timeout / 1000}s`,
  );
}

export function isHeadlessEnvironment(): boolean {
  // SSH session
  if (process.env["SSH_CLIENT"] || process.env["SSH_TTY"]) {
    return true;
  }

  // No display (Linux)
  if (
    process.platform === "linux" &&
    !process.env["DISPLAY"] &&
    !process.env["WAYLAND_DISPLAY"]
  ) {
    return true;
  }

  // CI environments
  if (process.env["CI"] || process.env["GITHUB_ACTIONS"]) {
    return true;
  }

  // Docker / containers
  if (process.env["container"] || process.env["DOCKER_CONTAINER"]) {
    return true;
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
