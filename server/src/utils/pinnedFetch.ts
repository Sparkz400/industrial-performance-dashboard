import { request } from "node:https";

const MAX_RESPONSE_BYTES = 1 << 20;

/**
 * A fetch for HTTPS that trusts only the given CA certificates instead of the system store,
 * for an identity provider or a central server with a private CA. Redirects are not followed.
 */
export function pinnedFetch(ca: string) {
  return (
    url: string,
    options: {
      method?: string;
      headers?: HeadersInit;
      body?: unknown;
      signal?: AbortSignal | null;
    } = {},
  ) =>
    new Promise<Response>((resolve, reject) => {
      const target = new URL(url);
      if (target.protocol !== "https:")
        return reject(new Error("Pinned requests use HTTPS only"));
      const req = request(
        target,
        {
          method: options.method ?? "GET",
          headers: Object.fromEntries(new Headers(options.headers)),
          ca,
          signal: options.signal ?? undefined,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_RESPONSE_BYTES)
              req.destroy(new Error("Response too large"));
            else chunks.push(chunk);
          });
          res.on("error", reject);
          res.on("end", () => {
            const headers = new Headers();
            for (const [name, value] of Object.entries(res.headers))
              for (const item of [value ?? []].flat())
                headers.append(name, item);
            const status = res.statusCode ?? 502;
            resolve(
              new Response(
                [204, 304].includes(status) ? null : Buffer.concat(chunks),
                { status, headers },
              ),
            );
          });
        },
      );
      req.on("error", reject);
      req.end(options.body == null ? undefined : String(options.body));
    });
}
