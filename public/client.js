export function getStoredToken() {
  return localStorage.getItem("audit-console-token") || "";
}

export function setStoredToken(token) {
  localStorage.setItem("audit-console-token", token);
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("content-type") && options.body) {
    headers.set("content-type", "application/json");
  }

  const token = getStoredToken();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  if (response.status === 204) {
    return null;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }

  return payload;
}

export function formatDate(value) {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false
  });
}
