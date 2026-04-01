# Deployment Guide

这个文档说明如何把 `mcp-smart-contract-audit-demo` 部署成 IDE 可直接接入的远程 MCP 服务。

当前推荐优先使用官方 MCP TypeScript SDK 的 `Streamable HTTP` 入口，即 [sdk-http-server.js](../src/sdk-http-server.js)。

## 1. 本地启动 HTTP 服务

```bash
cd mcp-smart-contract-audit-demo
npm install
MCP_AUTH_TOKEN=change-me HOST=127.0.0.1 PORT=3000 node src/sdk-http-server.js
```

后台 worker 需单独启动：

```bash
cd mcp-smart-contract-audit-demo
AUDIT_WORKER_CONCURRENCY=1 node src/audit-worker.js
```

如果要让线上地址审计覆盖更多浏览器，可额外设置：

```bash
export AUDIT_ETHERSCAN_API_KEY=your-key
export AUDIT_BLOCKSCOUT_BASE_URLS=1=https://eth.blockscout.com/api/,8453=https://base.blockscout.com/api/
export AUDIT_RPC_URLS=1=https://eth-mainnet.g.alchemy.com/v2/your-key,8453=https://base-mainnet.g.alchemy.com/v2/your-key
export AUDIT_MYTHRIL_MODE=auto
export AUDIT_MYTHRIL_BIN=myth
export AUDIT_MYTHRIL_DOCKER_IMAGE=mythril/myth
export AUDIT_SLITHER_MODE=docker
export AUDIT_SLITHER_DOCKER_IMAGE=trailofbits/slither
export AUDIT_DOCKER_BIN=docker
```

如果目标地址是代理合约，且浏览器 API 暴露了 `Implementation` 字段，服务会自动转向实现合约源码进行审计，并在响应里保留代理地址与实现地址。
如果浏览器没有返回 `Implementation`，但配置了 `AUDIT_RPC_URLS`，服务会继续通过 EIP-1967 `implementation` / `beacon` 槽位和 Beacon `implementation()` 调用尝试识别实现合约。
如果同时配置了 `AUDIT_RPC_URLS` 和 Mythril 运行环境，地址审计还会追加一层基于 RPC 的字节码分析；即使没有源码，也可以返回 `bytecode-only` 结果。
如果配置 `AUDIT_SLITHER_MODE=docker` 并且容器可访问 Docker（CLI + `/var/run/docker.sock`），地址审计在有源码时还会追加 Slither 静态分析结果。

健康检查：

```bash
curl http://127.0.0.1:3000/healthz
```

MCP 请求示例：

```bash
curl -X POST http://127.0.0.1:3000/mcp \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer change-me' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0.1.0"}}}'
```

## 2. Docker 部署

构建镜像：

```bash
docker build -t smart-contract-audit-mcp .
```

运行容器：

```bash
docker run --rm -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e HOST=0.0.0.0 \
  -e PORT=3000 \
  -e MCP_AUTH_TOKEN=change-me \
  -e AUDIT_SLITHER_MODE=docker \
  smart-contract-audit-mcp
```

## 3. Docker Compose

项目根目录已提供 [compose.yaml](../compose.yaml) 和 [.env.example](../.env.example)。

```bash
cp .env.example .env
docker compose up --build -d
```

`compose.yaml` 会启动两个容器：

- `smart-contract-audit-db`: PostgreSQL
- `smart-contract-audit-mcp-http`: 提供 Web Console、REST API 和 MCP HTTP
- `smart-contract-audit-mcp-worker`: 从 PostgreSQL 队列领取并执行审计任务

HTTP 和 worker 都通过 `DATABASE_URL` 连接到独立 PostgreSQL 容器，不再依赖共享本地 SQLite 文件。

默认暴露：

- `http://127.0.0.1:3000/`
- `http://127.0.0.1:3000/rules.html`
- `http://127.0.0.1:3000/mcp`
- `http://127.0.0.1:3000/healthz`

其中：

- `/` 是内置 Web Console 首页，用于发起地址审计、查看历史结果
- `/rules.html` 是独立规则管理页
- `/api/*` 是给 Web Console 使用的 REST API
- `/mcp` 是给 VS Code / IDE / Agent 客户端使用的 MCP HTTP 入口

地址审计 API 采用异步作业模型。`POST /api/audits/address` 返回的是入队后的任务对象，前端再通过 `GET /api/audits` 或 `GET /api/audits/:id` 轮询状态。
生产环境下，请不要只启动 HTTP 服务，还要同时启动至少一个 worker 进程，否则任务会一直停留在 `queued`。

如果配置了 `MCP_AUTH_TOKEN`：

- `/api/*` 和 `/mcp` 都需要 `Authorization: Bearer <token>`
- `/` 和 `/healthz` 仍可直接访问
- Web Console 页面右上侧的 Token 输入框需要填入同一个 Bearer Token

建议同时配置：

```bash
export AUDIT_WORKER_CONCURRENCY=1
export AUDIT_MAX_PENDING_JOBS=50
export AUDIT_JOB_TIMEOUT_MS=180000
export AUDIT_JOB_LEASE_MS=210000
export AUDIT_RETRY_DELAY_MS=15000
export AUDIT_MAX_ATTEMPTS=3
```

这三项决定后台 worker 的并发数、排队上限和单任务超时时间。
后面三项分别控制租约时长、失败重试间隔和最大重试次数。

## 4. Render 部署

仓库根目录已提供 [render.yaml](../render.yaml)。

当前仓库已经切到 PostgreSQL 优先的存储模型。`render.yaml` 会创建一个 PostgreSQL 数据库、一个 HTTP 服务和一个 worker 服务，三者通过同一条 `DATABASE_URL` 协同工作。

部署要点：

1. 将代码推到 Git 仓库
2. 在 Render 创建 Blueprint 或直接导入仓库
3. 确认 `MCP_AUTH_TOKEN` 已生成或手动设置
4. 确认两个服务都拿到了 Render 自动注入的 `DATABASE_URL`
5. 部署后得到 `https://your-service.onrender.com/mcp`

部署完成后，你同时会得到：

- `https://your-service.onrender.com/`
- `https://your-service.onrender.com/rules.html`
- `https://your-service.onrender.com/mcp`

## 5. Railway 部署

仓库根目录已提供 [railway.json](../railway.json)。

Railway 也建议使用外部 PostgreSQL。只要 HTTP 服务和 worker 服务共用同一条 `DATABASE_URL`，就可以拆分成多个实例。

部署要点：

1. 将代码推到 Git 仓库
2. 在 Railway 新建项目并从 GitHub 导入
3. 为项目挂载 PostgreSQL，并把同一条 `DATABASE_URL` 注入 HTTP 服务和 worker 服务
4. 设置环境变量 `MCP_AUTH_TOKEN`
5. 部署后得到公网 URL，再拼接 `/mcp`

同一个公网 URL 的根路径 `/` 也可以直接打开 Web Console。
规则管理页入口是 `/rules.html`。

## 6. 单机 systemd 部署

示例文件见：

- [deploy/smart-contract-audit-mcp.service.example](../deploy/smart-contract-audit-mcp.service.example)
- [deploy/smart-contract-audit-mcp-worker.service.example](../deploy/smart-contract-audit-mcp-worker.service.example)

典型步骤：

```bash
sudo cp deploy/smart-contract-audit-mcp.service.example /etc/systemd/system/smart-contract-audit-mcp.service
sudo cp deploy/smart-contract-audit-mcp-worker.service.example /etc/systemd/system/smart-contract-audit-mcp-worker.service
sudo systemctl daemon-reload
sudo systemctl enable smart-contract-audit-mcp
sudo systemctl enable smart-contract-audit-mcp-worker
sudo systemctl start smart-contract-audit-mcp
sudo systemctl start smart-contract-audit-mcp-worker
```

## 7. Nginx 反向代理

示例配置见 [deploy/nginx.conf.example](../deploy/nginx.conf.example)。

建议：

- Node 进程只监听 `127.0.0.1`
- TLS 由 Nginx 终止
- 通过 Nginx 统一做访问日志、限流和 IP 控制

## 8. VS Code 配置

本地 `stdio`：

```json
{
  "servers": {
    "smart-contract-audit-local": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/mcp-smart-contract-audit-demo/bin/smart-contract-audit-mcp.js", "--sdk"]
    }
  }
}
```

远程 HTTP：

```json
{
  "servers": {
    "smart-contract-audit-remote": {
      "type": "http",
      "url": "https://audit.example.com/mcp",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

## 9. npm 分发说明

项目已提供 `bin` 入口：

```bash
smart-contract-audit-mcp
smart-contract-audit-mcp --http --port 3000
```

如果要正式发布到 npm：

1. 将 `package.json` 的 `name` 改成你自己的唯一包名或 scope
2. 去掉 `private: true`
3. 确认 `bin/smart-contract-audit-mcp.js` 有执行权限
4. 再执行 `npm publish`

## 10. GitHub Actions 发布

项目已提供：

- [ci.yml](../.github/workflows/ci.yml)
- [release.yml](../.github/workflows/release.yml)

使用方式：

1. 正常提交 PR / push 时，CI 会执行语法和协议层校验
2. 推送 `v0.4.0` 这类 tag 时，会自动：
   - 运行校验
   - 生成 npm tarball artifact
   - 推送 Docker 镜像到 GHCR
3. 如果你将包改为可发布并在仓库里配置 `NPM_TOKEN`，同一流程也会自动发布 npm

## 11. Mythril 镜像转存

如果部署环境直接拉 `docker.io/mythril/myth` 经常失败，可以使用：

- [mirror-mythril.yml](../.github/workflows/mirror-mythril.yml)

这个 workflow 会：

1. 从 `docker.io/mythril/myth:latest` 拉取源镜像
2. 转存到 `ghcr.io/<github-owner>/mythril-myth:latest`
3. 同时推一个日期标签，便于回滚

使用步骤：

1. 打开 GitHub Actions
2. 运行 `Mirror Mythril Image`
3. 等待 workflow 完成
4. 在部署环境中设置：

```bash
export AUDIT_MYTHRIL_MODE=docker
export AUDIT_MYTHRIL_DOCKER_IMAGE=ghcr.io/<your-owner>/mythril-myth:latest
```

这样项目走的是你自己的 GHCR 镜像，不再直接依赖 Docker Hub。
