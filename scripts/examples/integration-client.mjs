// Runnable example for docs/INTEGRATION_API.md. Reads one machine's assets, hourly
// summaries, raw replay and work-order completions with a dedicated read account.
//
//   PD_API=https://dashboard.example/api/v1 PD_USER=integration PD_PASSWORD=... \
//   node scripts/examples/integration-client.mjs <machineId> <nodeKey>
//
// The contract test runs this same code against an owned database.
import { pathToFileURL } from "node:url";

export async function integrationClient({ api, username, password }) {
  const cookies = new Map();
  const request = async (method, path, body, headers = {}) => {
    const response = await fetch(api + path, {
      method,
      headers: {
        ...headers,
        cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  };
  const json = async (path) => {
    const response = await request("GET", path);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw Object.assign(new Error(`${response.status} ${error.code}: ${error.error}`), {
        status: response.status,
        body: error,
      });
    }
    return response.json();
  };
  // Every state-changing request, including login, needs the session's CSRF token.
  const { csrfToken } = await (await request("GET", "/csrf-token")).json();
  const login = await request(
    "POST",
    "/auth/login",
    { username, password },
    { "x-csrf-token": csrfToken },
  );
  if (!login.ok) throw new Error(`Login failed with ${login.status}`);
  return {
    request,
    assets: () => json("/production/assets"),
    summaries: (machineId, nodeKey, start, end) =>
      json(
        `/history/${machineId}/summaries?${new URLSearchParams({ nodeKey, start, end })}`,
      ),
    replay: (machineId, keys, start, end) =>
      json(
        `/production/replay/${machineId}?${new URLSearchParams([
          ["start", start],
          ["end", end],
          ...keys.map((key) => ["keys", key]),
        ])}`,
      ),
    completions: (machineId) =>
      json(`/work-orders/machines/${machineId}/completions`),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [machineId, nodeKey] = process.argv.slice(2);
  const client = await integrationClient({
    api: process.env.PD_API,
    username: process.env.PD_USER,
    password: process.env.PD_PASSWORD,
  });
  const end = new Date(),
    start = new Date(end.getTime() - 24 * 3600000);
  console.log(JSON.stringify(await client.assets(), null, 2));
  if (machineId && nodeKey) {
    console.log(
      JSON.stringify(
        await client.summaries(machineId, nodeKey, start.toISOString(), end.toISOString()),
        null,
        2,
      ),
    );
  }
}
