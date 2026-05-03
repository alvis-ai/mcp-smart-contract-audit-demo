FROM debian:bookworm-slim

ARG ADERYN_VERSION=0.6.8
ARG ADERYN_ARTIFACT_URL=https://github.com/cyfrin/aderyn/releases/download/aderyn-v0.6.8/aderyn-x86_64-unknown-linux-gnu.tar.xz

ADD ${ADERYN_ARTIFACT_URL} /tmp/aderyn.tar.xz

RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends xz-utils; \
  rm -rf /var/lib/apt/lists/*; \
  mkdir -p /usr/local/bin; \
  tar -xf /tmp/aderyn.tar.xz --strip-components 1 -C /usr/local/bin; \
  chmod +x /usr/local/bin/aderyn; \
  rm /tmp/aderyn.tar.xz; \
  aderyn --version

CMD ["aderyn", "--help"]
