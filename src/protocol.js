// These helpers keep the custom stdio / HTTP implementation close to JSON-RPC
// without pulling in the official SDK. They are still useful for tests and as
// a readable baseline next to the SDK-based implementation.
export const PROTOCOL_VERSION = "2025-06-18";

export function success(id, result) {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

export function failure(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data ? { data } : {})
    }
  };
}

export function textResult(text, structuredContent, extra = {}) {
  return {
    content: [
      {
        type: "text",
        text
      }
    ],
    ...(structuredContent ? { structuredContent } : {}),
    ...extra
  };
}
