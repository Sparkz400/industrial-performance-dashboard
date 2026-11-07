// Owned loopback regression for the example client's error messages (issue #14).
// No database, real account or rate-limit flooding: a local server answers everything.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { integrationClient } from "./examples/integration-client.mjs";

let assetsReply;
const server = createServer((req, res) => {
  if (req.url === "/csrf-token") {
    res.writeHead(200, {
      "content-type": "application/json",
      "set-cookie": "sid=synthetic-session; HttpOnly",
    });
    return res.end(JSON.stringify({ csrfToken: "synthetic-csrf" }));
  }
  if (req.url === "/auth/login") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end("{}");
  }
  const { status, headers, body } = assetsReply;
  res.writeHead(status, headers);
  res.end(body);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  const client = await integrationClient({
    api: `http://127.0.0.1:${server.address().port}`,
    username: "synthetic-user",
    password: "synthetic-password",
  });
  const failure = async (reply) => {
    assetsReply = reply;
    const error = await client.assets().then(
      () => assert.fail("expected an error"),
      (e) => e,
    );
    assert.doesNotMatch(error.message, /synthetic-(session|password|csrf)/);
    return error;
  };

  assetsReply = {
    status: 200,
    headers: { "content-type": "application/json" },
    body: '[{"id":1}]',
  };
  assert.deepEqual(await client.assets(), [{ id: 1 }]);

  const json = await failure({
    status: 403,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      status: "error",
      error: "Machine access denied",
      code: "FORBIDDEN",
      requestId: "r-1",
    }),
  });
  assert.equal(json.message, "403 FORBIDDEN: Machine access denied");
  assert.equal(json.status, 403);
  assert.equal(json.body.requestId, "r-1");
  assert.equal(json.retryAfterSeconds, undefined);

  const limited = await failure({
    status: 429,
    headers: { "content-type": "text/plain", "RateLimit-Reset": "42" },
    body: "Too many requests, please try again later.",
  });
  assert.equal(
    limited.message,
    "429 Too Many Requests: Too many requests, please try again later. (rate limit resets in 42 s)",
  );
  assert.equal(limited.status, 429);
  assert.equal(limited.retryAfterSeconds, 42);
  assert.deepEqual(limited.body, {});

  const html = await failure({
    status: 502,
    headers: { "content-type": "text/html" },
    body: `<html><body>${"Bad gateway ".repeat(100)}</body></html>`,
  });
  assert.match(html.message, /^502 Bad Gateway: <html><body>Bad gateway/);
  assert.ok(html.message.length < 240, "non-JSON body is bounded");

  const empty = await failure({ status: 503, headers: {}, body: "" });
  assert.equal(empty.message, "503 Service Unavailable: Service Unavailable");

  console.log("integration client error handling: 5 cases passed");
} finally {
  server.close();
}
