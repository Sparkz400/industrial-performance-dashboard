// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line security/detect-non-literal-fs-filename -- Fixed path relative to this test.
const source = readFileSync(new URL('../../../public/sw.js', import.meta.url), 'utf8');

/** Load the actual worker with an isolated cache and network. */
function worker() {
  let onFetch: (event: unknown) => void = () => {};
  const cached = new Response('bundled font');
  const caches = {
    match: vi.fn().mockResolvedValue(cached),
    open: vi.fn().mockResolvedValue({ put: vi.fn().mockResolvedValue(undefined) }),
  };
  const fetch = vi.fn().mockResolvedValue(new Response('network asset'));
  runInNewContext(source, {
    self: {
      location: { origin: 'https://dashboard.test' },
      addEventListener: (name: string, handler: (event: unknown) => void) => {
        if (name === 'fetch') onFetch = handler;
      },
    },
    URL,
    caches,
    fetch,
  });
  return { onFetch, caches, fetch, cached };
}

describe('offline font cache', () => {
  it.each(['figtree.css', 'Figtree-Variable.woff2', 'Figtree-Italic-Variable.woff2'])(
    'serves %s offline despite differing Origin headers',
    async (file) => {
      const { onFetch, caches, fetch, cached } = worker();
      const request = new Request(`https://dashboard.test/fonts/figtree/${file}`);
      let response: Promise<Response> | undefined;
      onFetch({
        request,
        respondWith: (value: Promise<Response>) => {
          response = value;
        },
      });
      expect(caches.match).toHaveBeenCalledWith(request, { ignoreVary: true });
      expect(await response).toBe(cached);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('does not relax Vary matching for other origins or unrelated assets', async () => {
    for (const url of [
      'https://other.test/fonts/figtree/Figtree-Variable.woff2',
      'https://dashboard.test/assets/app.js',
    ]) {
      const { onFetch, caches } = worker();
      const request = new Request(url);
      let response: Promise<Response> | undefined;
      onFetch({
        request,
        respondWith: (value: Promise<Response>) => {
          response = value;
        },
      });
      await response;
      expect(caches.match).toHaveBeenCalledWith(request);
    }
  });
});
