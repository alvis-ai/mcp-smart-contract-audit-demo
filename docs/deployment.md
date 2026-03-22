# Deployment Guide

这个文档说明如何把 `mcp-smart-contract-audit-demo` 部署成 IDE 可直接接入的远程 MCP 服务。

当前推荐优先使用官方 MCP TypeScript SDK 的 `Streamable HTTP` 入口，即 [sdk-http-server.js](../src/sdk-http-server.js)。

## 1. 本地启动 HTTP 服务

```bash
cd mcp-smart-contract-audit-demo
npm install
MCP_AUTH_TOKEN=change-me HOST=127.0.0.1 PORT=3000 node src/sdk-http-server.js
```

如果要让线上地址审计覆盖更多浏览器，可额外设置：

```bash
export AUDIT_ETHERSCAN_API_KEY=your-key
export AUDIT_BLOCKSCOUT_BASE_URLS=1=https://eth.blockscout.com/api/,8453=https://base.blockscout.com/api/
export AUDIT_RPC_URLS=1=https://eth-mainnet.g.alchemy.com/v2/your-key,8453=https://base-mainnet.g.alchemy.com/v2/your-key
```

如果目标地址是代理合约，且浏览器 API 暴露了 `Implementation` 字段，服务会自动转向实现合约源码进行审计，并在响应里保留代理地址与实现地址。
如果浏览器没有返回 `Implementation`，但配置了 `AUDIT_RPC_URLS`，服务会继续通过 EIP-1967 `implementation` / `beacon` 槽位和 Beacon `implementation()` 调用尝试识别实现合约。

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
  -e HOST=0.0.0.0 \
  -e PORT=3000 \
  -e MCP_AUTH_TOKEN=change-me \
  smart-contract-audit-mcp
```

## 3. Docker Compose

项目根目录已提供 [compose.yaml](../compose.yaml) 和 [.env.example](../.env.example)。

```bash
cp .env.example .env
docker compose up --build -d
```

默认暴露：

- `http://127.0.0.1:3000/mcp`
- `http://127.0.0.1:3000/healthz`

## 4. Render 部署

仓库根目录已提供 [render.yaml](../render.yaml)。

部署要点：

1. 将代码推到 Git 仓库
2. 在 Render 创建 Blueprint 或直接导入仓库
3. 确认 `MCP_AUTH_TOKEN` 已生成或手动设置
4. 部署后得到 `https://your-service.onrender.com/mcp`

## 5. Railway 部署

仓库根目录已提供 [railway.json](../railway.json)。

部署要点：

1. 将代码推到 Git 仓库
2. 在 Railway 新建项目并从 GitHub 导入
3. 设置环境变量 `MCP_AUTH_TOKEN`
4. 部署后得到公网 URL，再拼接 `/mcp`

## 6. 单机 systemd 部署

示例文件见 [deploy/smart-contract-audit-mcp.service.example](../deploy/smart-contract-audit-mcp.service.example)。

典型步骤：

```bash
sudo cp deploy/smart-contract-audit-mcp.service.example /etc/systemd/system/smart-contract-audit-mcp.service
sudo systemctl daemon-reload
sudo systemctl enable smart-contract-audit-mcp
sudo systemctl start smart-contract-audit-mcp
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
