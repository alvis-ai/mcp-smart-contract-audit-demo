# Smart Contract Audit Assistant MCP Server Demo

这个 demo 用一个 Node.js MCP Server 演示如何把下面几类能力接入到实际项目中，并支持根据线上合约地址抓取已验证源码后直接发起审计。项目同时保留了自定义 JSON-RPC 实现与基于官方 MCP TypeScript SDK 的 `stdio` / `Streamable HTTP` 入口。

- `MCP tools`：把合约审计、知识库检索、审计清单生成暴露成标准工具
- `MCP resources`：把审计规范、领域风险模型做成可读取上下文
- `MCP prompts`：把高频审计流程沉淀成可复用的“Skill-like”工作流模板
- `Knowledge Base`：围绕 LaunchPad、NFT、Staking、Lending、白名单签名、权限控制、Gas 优化建立本地知识库

## 项目结构

```text
mcp-smart-contract-audit-demo/
├── .vscode/
│   └── mcp.json.example
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── .env.example
├── .dockerignore
├── .npmignore
├── compose.yaml
├── deploy/
│   ├── nginx.conf.example
│   └── smart-contract-audit-mcp.service.example
├── docs/
│   ├── deployment.md
│   └── example-requests.md
├── kb/
│   ├── audit-checklist-general.md
│   ├── launchpad-risk-model.md
│   ├── nft-marketplace-risk-model.md
│   └── staking-lending-risk-model.md
├── samples/
│   ├── PowerLaunchPad.sol
│   └── TreasureHunt.sol
├── scripts/
│   ├── audit-address.js
│   └── demo-client.js
├── src/
│   ├── analyzer.js
│   ├── http-server.js
│   ├── knowledge-base.js
│   ├── mcp-service.js
│   ├── protocol.js
│   ├── sdk-http-server.js
│   ├── sdk-server.js
│   ├── sdk-shared.js
│   ├── sdk-stdio-server.js
│   ├── server.js
│   └── verified-source.js
├── Dockerfile
├── railway.json
├── render.yaml
└── README.md
```

## 快速运行

```bash
cd mcp-smart-contract-audit-demo
npm install
node src/server.js
```

另一个终端执行演示客户端：

```bash
cd mcp-smart-contract-audit-demo
node scripts/demo-client.js
```

如果要演示线上合约审计，可额外传入环境变量：

```bash
cd mcp-smart-contract-audit-demo
DEMO_CONTRACT_ADDRESS=0xYourContractAddress DEMO_CHAIN_ID=1 node scripts/demo-client.js
```

也可以直接用 CLI 审计线上合约：

```bash
cd mcp-smart-contract-audit-demo
node scripts/audit-address.js 0xYourContractAddress 1
```

或使用 npm script：

```bash
cd mcp-smart-contract-audit-demo
npm run audit:address -- 0xYourContractAddress 1 launchpad
```

如果要作为远程 MCP 服务启动：

```bash
cd mcp-smart-contract-audit-demo
PORT=3000 HOST=127.0.0.1 node src/http-server.js
```

或使用 npm script：

```bash
cd mcp-smart-contract-audit-demo
npm run start:http
```

如果要通过统一 `bin` 入口启动：

```bash
cd mcp-smart-contract-audit-demo
node bin/smart-contract-audit-mcp.js
node bin/smart-contract-audit-mcp.js --http --port 3000 --host 127.0.0.1
```

如果要使用官方 MCP SDK 入口：

```bash
cd mcp-smart-contract-audit-demo
npm run start:sdk
npm run start:sdk:http
```

如果要使用 Docker Compose：

```bash
cd mcp-smart-contract-audit-demo
cp .env.example .env
docker compose up --build
```

## 项目文档

- [CHANGELOG.md](./CHANGELOG.md)
- [docs/deployment.md](./docs/deployment.md)
- [docs/example-requests.md](./docs/example-requests.md)
- [LICENSE](./LICENSE)

## 暴露的 MCP 能力

### Tools

1. `audit_contract_address`
   根据线上合约地址抓取已验证的 Solidity 源码并进行静态规则检查。默认按 `Sourcify -> Etherscan V2 -> Blockscout` 顺序回退，发现 explorer 标记的代理合约时会继续跟踪实现合约源码。`chainId` 可选；不传时会扫描一组常见 EVM 链。

2. `audit_contract_file`
   读取本地 `.sol` 文件并进行静态规则检查，输出审计发现与建议。

3. `audit_contract_code`
   直接审计传入的 Solidity 代码，适合编辑器内联调用。

4. `search_audit_knowledge`
   在本地知识库中检索与 LaunchPad、NFT、Staking、Lending、签名校验等相关内容。

5. `generate_audit_checklist`
   基于项目类型生成领域审计清单。

## 线上合约审计说明

- `audit_contract_address` 依赖目标合约已完成源码验证，默认会优先检查 Sourcify，其次回退到 Etherscan V2 和已配置的 Blockscout 浏览器。
- 如果浏览器返回 `Proxy` / `Implementation` 元数据，服务会优先审计实现合约源码，并在结果中返回 `proxyAddress`、`implementationAddress` 和 `sourceAddress`。
- 只传地址时，服务端会自动扫描常见 EVM 链；如果已知网络，传入 `chainId` 会更快、更稳定。
- CLI 参数格式为 `<address> [chainId] [contractType]`，其中 `contractType` 可选值为 `general | launchpad | nft | staking | lending`。
- 可通过 `AUDIT_CHAIN_IDS=1,56,8453` 自定义默认扫描链集合。
- 可通过 `AUDIT_SOURCIFY_BASE_URL` 覆盖 Sourcify 仓库地址，便于接入镜像或私有代理。
- 可通过 `AUDIT_ETHERSCAN_API_KEY` 启用 Etherscan V2 回退抓取。
- 可通过 `AUDIT_ETHERSCAN_BASE_URL` 覆盖 Etherscan V2 API 地址。
- 可通过 `AUDIT_BLOCKSCOUT_BASE_URLS=1=https://eth.blockscout.com/api/,8453=https://base.blockscout.com/api/` 覆盖或补充 Blockscout API 映射。
- 可通过 `AUDIT_RPC_URLS=1=https://rpc.example,8453=https://rpc.example` 启用 RPC 槽位读取，用于在浏览器未提供 `Implementation` 字段时继续识别 EIP-1967 / Beacon 代理。

## VS Code / IDE 接入

### 本地 stdio 模式

把 [mcp.json.example](./.vscode/mcp.json.example) 里的 `smart-contract-audit-local` 复制到工作区 `.vscode/mcp.json`，即可让 VS Code 直接以本地进程方式启动。推荐优先使用官方 SDK 入口：

```json
{
  "servers": {
    "smart-contract-audit-local": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/bin/smart-contract-audit-mcp.js", "--sdk"]
    }
  }
}
```

### 远程 HTTP 模式

当前项目新增了官方 SDK 的 `Streamable HTTP` 入口，默认监听 `/mcp`。部署后可在 VS Code 中配置远程服务：

```json
{
  "servers": {
    "smart-contract-audit-remote": {
      "type": "http",
      "url": "https://your-domain.example.com/mcp",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

### 推荐部署方式

1. 反向代理到 `node src/sdk-http-server.js`，对外暴露 `https://your-domain/mcp`
2. 通过 `MCP_AUTH_TOKEN` 打开 Bearer Token 鉴权
3. 通过 `ALLOWED_ORIGINS=https://insiders.vscode.dev,https://vscode.dev` 或你的 IDE 来源站点限制跨域
4. 使用 `HOST=127.0.0.1` 做本地开发，生产环境交给 Nginx / Caddy / Cloudflare Tunnel 做 TLS

## CI / Release

- [ci.yml](./.github/workflows/ci.yml): 在 push / PR 时执行 `npm ci`、`npm run validate` 和 `npm pack --dry-run`
- [release.yml](./.github/workflows/release.yml): 在打 `v*` tag 时构建 npm tarball、推送 GHCR Docker 镜像；如果去掉 `private: true` 且配置了 `NPM_TOKEN`，还会发布 npm 包

### HTTP 服务环境变量

- `PORT` / `MCP_HTTP_PORT`: HTTP 监听端口，默认 `3000`
- `HOST`: HTTP 监听地址，默认 `127.0.0.1`
- `MCP_HTTP_PATH`: MCP 端点路径，默认 `/mcp`
- `MCP_AUTH_TOKEN`: 远程访问 Bearer Token，可选但生产环境建议设置
- `ALLOWED_ORIGINS`: 允许的跨域来源，逗号分隔，可选
- `AUDIT_CHAIN_IDS`: 默认扫描链集合
- `AUDIT_SOURCIFY_BASE_URL`: Sourcify 仓库地址覆盖
- `AUDIT_ETHERSCAN_API_KEY`: Etherscan V2 API Key
- `AUDIT_ETHERSCAN_BASE_URL`: Etherscan V2 API 地址
- `AUDIT_BLOCKSCOUT_BASE_URLS`: Blockscout API 映射，格式为 `chainId=url,chainId=url`
- `AUDIT_RPC_URLS`: RPC URL 映射，格式为 `chainId=url,chainId=url`

### 健康检查

HTTP 服务还提供了 `/healthz`：

```bash
curl http://127.0.0.1:3000/healthz
```

### Resources

- `kb://audit/general`
- `kb://audit/launchpad`
- `kb://audit/nft-marketplace`
- `kb://audit/staking-lending`
- `sample://contracts/power-launchpad`
- `sample://contracts/treasure-hunt`

### Prompts

1. `launchpad_audit_skill`
   适合做 LaunchPad / IDO 审计任务的标准工作流模板。

2. `audit_report_writer`
   把工具输出的 findings 组织成正式审计报告。

3. `knowledge_grounded_triage`
   要求模型优先查知识库，再决定是否发起工具调用。

## 可继续扩展

- 接入 Slither、Foundry、Mythril 等真实审计工具
- 增加合约 AST 分析，而不是只做字符串规则检查
- 为未验证源码的线上合约增加字节码级别检测能力
- 接入向量数据库，把本地 Markdown 知识库升级为 RAG 检索
- 接入 OpenAI / Claude 等模型，把 prompts 直接串成完整审计 Agent
