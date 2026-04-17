FROM python:3.11-slim-bookworm

ARG SLITHER_ANALYZER_VERSION=""
ARG SOLC_VERSIONS="0.4.26,0.5.17,0.6.12,0.7.6,0.8.20,0.8.24"
ARG PIP_INDEX_URL="https://pypi.org/simple"
ARG PIP_TRUSTED_HOST=""

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_TRUSTED_HOST=${PIP_TRUSTED_HOST} \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SOLC_VERSIONS=${SOLC_VERSIONS}

RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
  && apt-get -o Acquire::Retries=5 update \
  && apt-get -o Acquire::Retries=5 install -y --no-install-recommends bash build-essential ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/*

RUN if [ -n "${SLITHER_ANALYZER_VERSION}" ]; then \
      pip install --no-cache-dir "slither-analyzer==${SLITHER_ANALYZER_VERSION}" "solc-select>=1.0.4,<2"; \
    else \
      pip install --no-cache-dir "slither-analyzer" "solc-select>=1.0.4,<2"; \
    fi

RUN python3 - <<'PY'
import os
import subprocess

versions = [item.strip() for item in os.environ.get("SOLC_VERSIONS", "").split(",") if item.strip()]
for version in versions:
    subprocess.run(["solc-select", "install", version], check=True)

if versions:
    subprocess.run(["solc-select", "use", versions[-1]], check=True)
PY

COPY docker/slither/smart-slither /usr/local/bin/smart-slither
RUN chmod +x /usr/local/bin/smart-slither \
  && smart-slither --self-check >/tmp/slither-self-check.txt \
  && test -s /tmp/slither-self-check.txt

CMD ["smart-slither", "--help"]
