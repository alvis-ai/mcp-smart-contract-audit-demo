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
├── data/
│   ├── audits.json
│   ├── benchmark-cases.json
│   ├── cache/
│   └── mpl/
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
├── public/
│   ├── app.js
│   ├── client.js
│   ├── index.html
│   └── styles.css
├── scripts/
│   ├── audit-address.js
│   ├── benchmark-engines.js
│   ├── demo-client.js
│   └── validate.js
├── src/
│   ├── analyzer.js
│   ├── audit-queue.js
│   ├── audit-store-local.js
│   ├── audit-store-postgres.js
│   ├── audit-store.js
│   ├── audit-worker.js
│   ├── database.js
│   ├── dashboard-api.js
│   ├── external-analyzers.js
│   ├── http-server.js
│   ├── knowledge-base.js
│   ├── mcp-service.js
│   ├── protocol.js
│   ├── rule-store-local.js
│   ├── rule-store-postgres.js
│   ├── rule-store.js
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

如果要使用内置 Web Console：

```bash
cd mcp-smart-contract-audit-demo
npm run start:sdk:http
```

然后访问：

```text
http://127.0.0.1:3000/
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
npm run start:worker
```

内部生产部署时，HTTP 服务和后台 worker 需要至少启动两个进程：

```bash
npm run start:sdk:http
npm run start:worker
```

如果要使用 Docker Compose：

```bash
cd mcp-smart-contract-audit-demo
cp .env.example .env
docker compose --profile tooling build smart-contract-audit-slither-image smart-contract-audit-mcp-http smart-contract-audit-mcp-worker
docker compose up -d smart-contract-audit-db smart-contract-audit-mcp-http smart-contract-audit-mcp-worker
```

`compose.yaml` 现在会同时启动 PostgreSQL、HTTP 服务和独立 worker，本地就能走和生产一致的外部数据库模式。

## 项目文档

- [CHANGELOG.md](./CHANGELOG.md)
- [docs/deployment.md](./docs/deployment.md)
- [docs/example-requests.md](./docs/example-requests.md)
- [LICENSE](./LICENSE)

## 暴露的 MCP 能力

### Tools

1. `audit_contract_address`
   根据线上合约地址做组合审计。优先抓取已验证的 Solidity 源码并交给 Slither / Aderyn，随后在配置了 RPC 和外部引擎时追加 Mythril 字节码分析。源码抓取默认按 `Sourcify -> Etherscan V2 -> Blockscout` 顺序回退；发现代理合约时，源码分析和字节码分析都会继续跟踪实现合约，避免目标不一致。`chainId` 可选；不传时会扫描一组常见 EVM 链。

2. `audit_contract_file`
   读取本地 `.sol` 文件并调用第三方源码分析器（当前默认是 Slither + Aderyn），输出检测结果与建议。

3. `audit_contract_code`
   直接审计传入的 Solidity 代码，适合编辑器内联调用。

4. `search_audit_knowledge`
   在本地知识库中检索与 LaunchPad、NFT、Staking、Lending、签名校验等相关内容。

5. `generate_audit_checklist`
   基于项目类型生成领域审计清单。

## Web Console

项目现在内置了一个前端界面，用于：

- 发起地址审计
- 查看历史结果
- 切换中英文界面
- 查看第三方分析器的统一检测结果与分引擎输出

首页现在只保留“审计操作”和“结果查看”，不再暴露本地规则管理。

### 规则与结果存储

- 生产模式：`DATABASE_URL` / `AUDIT_DATABASE_URL` 指向的 PostgreSQL
- 本地开发回退：`data/audits.json` 和 `data/audit-jobs.db`

地址审计现在采用异步作业模型：

- `queued`
- `running`
- `succeeded`
- `failed`
- `timeout`

HTTP API 提交地址后会先入队，再由后台 worker 执行。这样更适合内部生产环境，避免单个请求长期占用 HTTP 连接。

### 后端 API

- `GET /api/audits`
- `GET /api/audits/:id`
- `GET /api/audits/stats/queue`
- `POST /api/audits/address`

## 第三方分析引擎

当前地址审计默认由两层组成：

- 外部源码静态分析：优先接入 Slither + Aderyn（Docker 模式）做 Solidity 语义检测
- 外部字节码分析：接入 Mythril，对链上地址经 RPC 做 EVM 字节码分析
- 统一问题视图：将第三方分析器返回的问题归一化到同一结果结构中展示

如果已配置 `AUDIT_RPC_URLS`，即使目标地址没有可用源码，也可以进入 `bytecode-only` 模式，尝试返回外部引擎结果。

### 基准回归

- `npm run benchmark:engines`

基准脚本会读取 `data/benchmark-cases.json`，对固定样例执行第三方分析器，确保后续升级时至少不会回归到“链路通了但检不出基准问题”的状态。

### Mythril 配置

- `AUDIT_MYTHRIL_MODE=auto | binary | docker | off`
- `AUDIT_MYTHRIL_BIN=myth`
- `AUDIT_MYTHRIL_DOCKER_IMAGE=mythril/myth@sha256:49e11758e359d0b410f648df5bbcba28a52e091a78e4772b5c02b9043666b4ff`
- `AUDIT_MYTHRIL_TIMEOUT=90`
- `AUDIT_MYTHRIL_MAX_BYTECODE_BYTES=16000`：超过该字节码大小时跳过 Mythril，避免大型合约长时间占用 worker；设为 `0` 可关闭该限制

默认 `auto` 会优先尝试本地 `myth` 命令，再回退到 Docker 镜像。

### Slither 配置（Docker）

- `AUDIT_SLITHER_MODE=off | docker | auto`
- `AUDIT_SLITHER_DOCKER_IMAGE=smart-contract-audit-slither:local`
- `AUDIT_SLITHER_DOCKER_PLATFORM=linux/amd64`
- `AUDIT_SLITHER_TIMEOUT=90`
- `AUDIT_SLITHER_ANALYZER_VERSION=0.11.5`：固定 `slither-analyzer` 版本，避免远端和本地结果漂移
- `AUDIT_SLITHER_SOLC_VERSIONS=0.4.26,0.5.16,0.5.17,0.6.6,0.6.12,0.7.6,0.8.20,0.8.24`：预装 `solc` 版本列表
- `AUDIT_SLITHER_PIP_INDEX_URL=https://pypi.org/simple`
- `AUDIT_SLITHER_PIP_TRUSTED_HOST=`：国内网络可改为自有或镜像源
- `AUDIT_DOCKER_BIN=docker`

项目现在内置了一份可构建的 Slither 镜像定义：`docker/slither/Dockerfile`。推荐先用 compose 构建这份镜像，再启动 HTTP/worker 服务。镜像会预装 `solc-select` 和一组常见 Solidity 编译器版本，并通过 `smart-slither` 根据 `pragma solidity` 优先选择兼容的预装版本，再回退到精确安装。Apple Silicon / ARM 主机默认建议使用 `AUDIT_SLITHER_DOCKER_PLATFORM=linux/amd64`。

### Aderyn 配置（Docker）

- `AUDIT_ADERYN_MODE=off | docker | auto`
- `AUDIT_ADERYN_DOCKER_IMAGE=smart-contract-audit-aderyn:local`
- `AUDIT_ADERYN_DOCKER_PLATFORM=linux/amd64`
- `AUDIT_ADERYN_VERSION=0.6.8`
- `AUDIT_ADERYN_TIMEOUT=60`

Aderyn 默认启用，用作轻量源码静态分析器补充 Slither。项目内置镜像定义：`docker/aderyn/Dockerfile`。

### AI Agent 与源码知识库

项目可选接入 LangChain AI agent，对 Slither、Aderyn、Mythril 的结构化结果和 verified source 做二次研判，并把最终报告与源码分片写入 PostgreSQL 知识库。默认 `AUDIT_AI_ENABLED=auto`：配置了 `OPENAI_API_KEY` 或 `AUDIT_AI_API_KEY` 才会调用模型；未配置时审计不会失败，只会返回 `ai.status=disabled`。AI 链路分为源码审计 agent、最终报告汇总 agent、报告翻译 agent；翻译结果会写入 `result.ai.translations`，前端语言切换时会展示对应语言的 AI 报告。

- `AUDIT_AI_ENABLED=auto | off`
- `AUDIT_AI_MODEL=gpt-4o-mini`
- `AUDIT_AI_AGENT_MODE=auto | tools | direct`：`tools` 使用 LangChain tool-calling agent；`direct` 使用双阶段 JSON agent，适合 DeepSeek 等不支持 `tool_choice` 的 OpenAI-compatible 模型；`auto` 会对 DeepSeek 默认走 direct
- `AUDIT_AI_EMBEDDING_MODEL=text-embedding-3-small`
- `AUDIT_AI_API_KEY=` / `OPENAI_API_KEY=`
- `AUDIT_AI_BASE_URL=` / `OPENAI_BASE_URL=`：兼容 OpenAI API 的网关地址
- `AUDIT_AI_TIMEOUT_MS=60000`
- `AUDIT_AI_CACHE_MODE=readwrite | off`
- `AUDIT_AI_CACHE_MAX_AGE_DAYS=30`
- `AUDIT_SOURCE_CHUNK_CHARS=4000`
- `AUDIT_SOURCE_CHUNK_OVERLAP_CHARS=400`

PostgreSQL 模式下会自动维护：

- `audit_source_contracts`：源码 hash、AI 报告、最近一次完整审计结果
- `audit_address_sources`：`chainId + address -> source_hash` 映射
- `audit_source_chunks`：源码分片、embedding JSON、分片元数据

重复审计同一地址且源码 hash 未变化时，会直接返回缓存的完整结果，避免重复跑 analyzer 和 AI。新源码会分片入库；配置 embedding key 后，AI agent 会检索历史相似代码段，作为报告上下文。

## 内部生产化改造

当前版本已经补上这几项内部生产所需的基础能力：

- PostgreSQL 外部数据库持久化规则、审计任务和 worker 状态
- 独立后台 worker 进程，避免在 HTTP 请求里同步跑链上审计
- 任务状态机：`queued / running / succeeded / failed / timeout`
- 数据库租约领取与 worker 心跳，支持进程重启后的任务恢复
- 自动重试机制，针对部分可恢复错误重新入队
- 外部引擎执行超时控制
- LangChain AI agent 报告汇总和 PostgreSQL 源码知识库缓存
- 基础结构化日志输出，便于后续接日志平台

当前推荐的内部生产部署方式是 PostgreSQL + HTTP 服务 + 独立 worker。只要 `DATABASE_URL` 或 `AUDIT_DATABASE_URL` 指向同一个 PostgreSQL，HTTP 和 worker 就可以安全拆成多个实例。仓库仍保留本地文件 / SQLite 回退，主要用于无数据库时的本地开发和 `validate` 校验。

相关环境变量：

- `DATABASE_URL=postgresql://user:pass@host:5432/smart_contract_audit`
- `AUDIT_DATABASE_URL=postgresql://user:pass@host:5432/smart_contract_audit`
- `AUDIT_DATABASE_SSL=disable | require | verify-full`
- `AUDIT_DATABASE_POOL_MAX=10`
- `AUDIT_WORKER_CONCURRENCY=1`
- `AUDIT_MAX_PENDING_JOBS=50`
- `AUDIT_JOB_TIMEOUT_MS=180000`
- `AUDIT_JOB_LEASE_MS=210000`
- `AUDIT_RETRY_DELAY_MS=15000`
- `AUDIT_MAX_ATTEMPTS=3`

### Docker 镜像转存

如果本机或服务器直接拉 `docker.io/mythril/myth` 不稳定，可以用仓库内置的 GitHub Actions workflow 先把镜像转存到你自己的 GHCR：

- Workflow: [.github/workflows/mirror-mythril.yml](./.github/workflows/mirror-mythril.yml)
- 默认源镜像：`docker.io/mythril/myth:latest`
- 默认目标镜像：`ghcr.io/<your-owner>/mythril-myth:latest`

转存完成后，把环境变量改成：

```bash
AUDIT_MYTHRIL_MODE=docker
AUDIT_MYTHRIL_DOCKER_IMAGE=ghcr.io/<your-owner>/mythril-myth:latest
```

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
- 可通过 `AUDIT_MYTHRIL_MODE`、`AUDIT_MYTHRIL_BIN`、`AUDIT_MYTHRIL_DOCKER_IMAGE` 配置外部字节码分析引擎 Mythril。
- 可通过 `AUDIT_SLITHER_MODE`、`AUDIT_ADERYN_MODE` 配置外部源码静态分析引擎；默认源码侧跑 Slither + Aderyn。

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

- 接入 Slither、Aderyn、Foundry、Mythril 等真实审计工具
- 增加合约 AST 分析，而不是只做字符串规则检查
- 为未验证源码的线上合约增加字节码级别检测能力
- 增加 pgvector/HNSW 索引，把当前 PostgreSQL embedding JSON 检索升级为数据库内 ANN 检索
- 接入 Claude 等非 OpenAI 兼容模型供应商
