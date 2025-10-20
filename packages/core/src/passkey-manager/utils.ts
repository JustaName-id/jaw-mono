import {BackendResponse, PasskeyLookupResponse, PasskeyRegistrationRequest, PasskeysByCredIdsResponse} from "./types.js"


export async function registerPasskeyInBackend(
    request: PasskeyRegistrationRequest,
    apiKey:string,
    serverUrl:string
  ): Promise<void> {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
  
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }
  
    const response = await fetch(serverUrl!, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });
  
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Registration failed: ${response.status} - ${
          errorText || response.statusText
        }`
      );
    }
  }

  async function lookupPasskeysFromBackend(
    credentialIds: string[],
    apiKey : string,
    serverUrl:string
  ): Promise<PasskeyLookupResponse[]> {
    const params = new URLSearchParams();
    credentialIds.forEach((id) => params.append("credentialIds", id));
  
    const headers: HeadersInit = {};
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }
  
    const response = await fetch(`${serverUrl}?${params}`, {
      headers,
    });
  
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Passkeys not found");
      }
      const errorText = await response.text();
      throw new Error(
        `Failed to lookup passkeys: ${response.status} - ${
          errorText || response.statusText
        }`
      );
    }
  
    const backendResponse: BackendResponse<PasskeysByCredIdsResponse> =
      await response.json();
  
    if (backendResponse.result?.data?.passkeys) {
      return backendResponse.result.data.passkeys;
    } else if (backendResponse.result?.error) {
      throw new Error(`Backend error: ${backendResponse.result.error}`);
    } else {
      throw new Error("Invalid response structure from backend");
    }
  }
  
  export async function lookupPasskeyFromBackend(
    credentialId: string,
    apiKey:string,
    serverUrl:string
  ): Promise<PasskeyLookupResponse> {
    const passkeys = await lookupPasskeysFromBackend([credentialId],apiKey,serverUrl);
  
    if (passkeys.length === 0) {
      throw new Error("Passkey not found");
    }
  
    const passkey = passkeys[0];
    if (!passkey) {
      throw new Error("Passkey not found");
    }
  
    return passkey;
  }
  