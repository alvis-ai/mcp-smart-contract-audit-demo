# Smart Contract Audit Assistant MCP Server Demo

这个 demo 用一个零依赖的 Node.js MCP Server 演示如何把下面几类能力接入到实际项目中：

- `MCP tools`：把合约审计、知识库检索、审计清单生成暴露成标准工具
- `MCP resources`：把审计规范、领域风险模型做成可读取上下文
- `MCP prompts`：把高频审计流程沉淀成可复用的“Skill-like”工作流模板
- `Knowledge Base`：围绕 LaunchPad、NFT、Staking、Lending、白名单签名、权限控制、Gas 优化建立本地知识库

## 项目结构

```text
mcp-smart-contract-audit-demo/
├── kb/
│   ├── audit-checklist-general.md
│   ├── launchpad-risk-model.md
│   ├── nft-marketplace-risk-model.md
│   └── staking-lending-risk-model.md
├── samples/
│   ├── PowerLaunchPad.sol
│   └── TreasureHunt.sol
├── scripts/
│   └── demo-client.js
├── src/
│   ├── analyzer.js
│   ├── knowledge-base.js
│   ├── protocol.js
│   └── server.js
└── README.md
```

## 快速运行

```bash
cd mcp-smart-contract-audit-demo
node src/server.js
```

另一个终端执行演示客户端：

```bash
cd mcp-smart-contract-audit-demo
node scripts/demo-client.js
```

## 项目文档

- [CHANGELOG.md](./CHANGELOG.md)
- [docs/example-requests.md](./docs/example-requests.md)
- [LICENSE](./LICENSE)

## 暴露的 MCP 能力

### Tools

1. `audit_contract_file`
   读取本地 `.sol` 文件并进行静态规则检查，输出审计发现与建议。

2. `audit_contract_code`
   直接审计传入的 Solidity 代码，适合编辑器内联调用。

3. `search_audit_knowledge`
   在本地知识库中检索与 LaunchPad、NFT、Staking、Lending、签名校验等相关内容。

4. `generate_audit_checklist`
   基于项目类型生成领域审计清单。

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
- 接入向量数据库，把本地 Markdown 知识库升级为 RAG 检索
- 接入 OpenAI / Claude 等模型，把 prompts 直接串成完整审计 Agent
