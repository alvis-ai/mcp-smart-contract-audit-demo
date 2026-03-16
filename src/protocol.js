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
