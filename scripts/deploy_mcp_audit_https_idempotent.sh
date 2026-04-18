#!/usr/bin/env bash
set -euo pipefail

# ===== 必填 =====
DOMAIN="${DOMAIN:-}"   # 例如: audit.alvis.ac.cn
EMAIL="${EMAIL:-}"     # 例如: you@example.com
# ===============

# ===== 可选 =====
REPO_URL="${REPO_URL:-https://github.com/alvis-ai/mcp-smart-contract-audit-demo.git}"
APP_DIR="${APP_DIR:-/opt/mcp-smart-contract-audit-demo}"
APP_PORT="${APP_PORT:-13000}"  # 默认 13000，避免与原 compose 的 3000 冲突
ETHERSCAN_KEY="${ETHERSCAN_KEY:-}"
RPC_URLS="${RPC_URLS:-1=https://ethereum-rpc.publicnode.com,8453=https://mainnet.base.org}"
MCP_AUTH_TOKEN="${MCP_AUTH_TOKEN:-}"
MYTHRIL_IMAGE="${MYTHRIL_IMAGE:-mythril/myth@sha256:49e11758e359d0b410f648df5bbcba28a52e091a78e4772b5c02b9043666b4ff}"
# ===============

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "ERROR: DOMAIN 和 EMAIL 必填"
  echo "示例: DOMAIN=audit.example.com EMAIL=ops@example.com bash deploy_mcp_audit_https_idempotent.sh"
  exit 1
fi

gen_token() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48; }

compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "ERROR: 未检测到 docker compose / docker-compose"
    exit 1
  fi
}

read_env_val() {
  local key="$1" file="$2"
  [[ -f "$file" ]] || return 1
  grep -E "^${key}=" "$file" | tail -n1 | cut -d= -f2- || true
}

upsert_env() {
  local key="$1" val="$2" file="$3"
  if grep -qE "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${val}|g" "$file"
  else
    printf "%s=%s\n" "$key" "$val" >>"$file"
  fi
}

echo "[1/10] 安装基础依赖（不安装 Docker）"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ca-certificates nginx certbot python3-certbot-nginx ufw

echo "[2/10] 检查 Docker 环境"
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: 未检测到 docker，请先手动安装 Docker 后重试。"
  exit 1
fi
if ! docker version >/dev/null 2>&1; then
  echo "ERROR: docker daemon 不可用，请先修复 Docker 服务。"
  exit 1
fi
compose_cmd version >/dev/null 2>&1

echo "[3/10] 启动系统服务"
systemctl enable --now docker
systemctl enable --now nginx

echo "[4/10] 拉取代码"
mkdir -p /opt
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout main
  git -C "$APP_DIR" pull --ff-only origin main || git -C "$APP_DIR" pull --rebase origin main
else
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
[[ -f .env ]] || cp .env.example .env

echo "[5/10] 准备环境变量"
existing_token="$(read_env_val MCP_AUTH_TOKEN .env || true)"
existing_etherscan="$(read_env_val AUDIT_ETHERSCAN_API_KEY .env || true)"
existing_rpcs="$(read_env_val AUDIT_RPC_URLS .env || true)"

if [[ -z "$MCP_AUTH_TOKEN" ]]; then
  MCP_AUTH_TOKEN="${existing_token:-$(gen_token)}"
fi
if [[ -z "$ETHERSCAN_KEY" ]]; then
  ETHERSCAN_KEY="${existing_etherscan:-}"
fi
if [[ -z "$RPC_URLS" ]]; then
  RPC_URLS="${existing_rpcs:-1=https://ethereum-rpc.publicnode.com,8453=https://mainnet.base.org}"
fi

upsert_env HOST "0.0.0.0" .env
upsert_env PORT "3000" .env
upsert_env MCP_HTTP_PATH "/mcp" .env
upsert_env MCP_AUTH_TOKEN "$MCP_AUTH_TOKEN" .env
upsert_env ALLOWED_ORIGINS "https://${DOMAIN}" .env
upsert_env AUDIT_ETHERSCAN_API_KEY "$ETHERSCAN_KEY" .env
upsert_env AUDIT_RPC_URLS "$RPC_URLS" .env
upsert_env AUDIT_MYTHRIL_MODE "docker" .env
upsert_env AUDIT_MYTHRIL_DOCKER_IMAGE "$MYTHRIL_IMAGE" .env
upsert_env AUDIT_SLITHER_MODE "docker" .env
upsert_env AUDIT_SLITHER_DOCKER_IMAGE "smart-contract-audit-slither:local" .env
upsert_env AUDIT_SLITHER_DOCKER_PLATFORM "linux/amd64" .env
upsert_env AUDIT_SLITHER_ANALYZER_VERSION "0.11.5" .env
upsert_env AUDIT_SLITHER_SOLC_VERSIONS "0.4.26,0.5.16,0.5.17,0.6.6,0.6.12,0.7.6,0.8.20,0.8.24" .env
upsert_env AUDIT_SLITHER_PIP_INDEX_URL "https://pypi.org/simple" .env
upsert_env AUDIT_SLITHER_PIP_TRUSTED_HOST "" .env
upsert_env AUDIT_DOCKER_BIN "docker" .env

echo "[6/10] 生成运行时 compose（不使用 override 叠加）"
RUNTIME_COMPOSE="compose.runtime.yml"
cp compose.yaml "$RUNTIME_COMPOSE"

if grep -q '"3000:3000"' "$RUNTIME_COMPOSE"; then
  sed -i "s|\"3000:3000\"|\"127.0.0.1:${APP_PORT}:3000\"|g" "$RUNTIME_COMPOSE"
fi

if ! grep -q "127.0.0.1:${APP_PORT}:3000" "$RUNTIME_COMPOSE"; then
  echo "ERROR: 未能在 $RUNTIME_COMPOSE 中替换端口映射，请检查 compose.yaml 的 ports 写法。"
  exit 1
fi

echo "[7/10] 检查端口是否可用"
if ss -lnt "( sport = :${APP_PORT} )" | grep -q ":${APP_PORT}"; then
  echo "ERROR: 127.0.0.1:${APP_PORT} 已被占用，请换 APP_PORT 后重试。"
  exit 1
fi

echo "[8/10] 构建工具镜像并启动容器"
compose_cmd -f "$RUNTIME_COMPOSE" down --remove-orphans || true
compose_cmd --profile tooling -f "$RUNTIME_COMPOSE" build smart-contract-audit-slither-image smart-contract-audit-mcp-http smart-contract-audit-mcp-worker
compose_cmd --profile tooling -f "$RUNTIME_COMPOSE" run --rm smart-contract-audit-slither-image smart-slither --self-check
docker run --rm "$MYTHRIL_IMAGE" myth version
compose_cmd -f "$RUNTIME_COMPOSE" up -d smart-contract-audit-db smart-contract-audit-mcp-http smart-contract-audit-mcp-worker

echo "[9/10] 配置 Nginx"
cat >/etc/nginx/sites-available/mcp-audit.conf <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}
EOF

ln -sfn /etc/nginx/sites-available/mcp-audit.conf /etc/nginx/sites-enabled/mcp-audit.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "[10/10] HTTPS + 防火墙"
certbot --nginx -d "$DOMAIN" --agree-tos -m "$EMAIL" --non-interactive --redirect --keep-until-expiring
systemctl enable --now certbot.timer || true

ufw allow 22/tcp || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable || true

echo
echo "===== 部署完成 ====="
echo "URL: https://${DOMAIN}/"
echo "MCP_AUTH_TOKEN: ${MCP_AUTH_TOKEN}"
echo "运行状态: cd ${APP_DIR} && docker compose -f ${RUNTIME_COMPOSE} ps"
