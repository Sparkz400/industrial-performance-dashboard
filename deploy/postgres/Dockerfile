FROM postgres:16-alpine@sha256:aa6cb33cf4c19c765cefcf48d96176258800870a9a1e930ad126200f9d825139
# Use Alpine's maintained privilege switcher instead of the bundled obsolete Go runtime.
RUN apk upgrade --no-cache && apk add --no-cache su-exec \
    && grep -q 'exec gosu postgres' /usr/local/bin/docker-entrypoint.sh \
    && sed -i 's/exec gosu postgres /exec su-exec postgres /' /usr/local/bin/docker-entrypoint.sh \
    && rm /usr/local/bin/gosu \
    && test "$(su-exec postgres id -u)" = "$(id -u postgres)" \
    && test "$(su-exec postgres id -u)" != 0
