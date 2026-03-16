# Smart Contract Audit Assistant MCP Server Demo

这个 demo 用一个零依赖的 Node.js MCP Server 演示如何把下面几类能力接入到实际项目中：

- `MCP tools`：把合约审计、知识库检索、审计清单生成暴露成标准工具
- `MCP resources`：把审计规范、简历方向、领域风险模型做成可读取上下文
- `MCP prompts`：把高频审计流程沉淀成可复用的“Skill-like”工作流模板
- `Knowledge Base`：围绕 LaunchPad、NFT、Staking、Lending、白名单签名、权限控制、Gas 优化建立本地知识库

## 这个 demo 对应简历里的哪些点

- LaunchPad / IDO 审计思路
- NFT Marketplace 风险点
- Staking / Lending 业务理解
- 权限控制、白名单签名、重入、低级调用、`tx.origin` 等安全意识
- 通过 `MCP + 知识库 + Prompt 工作流` 提升研发和审计效率

## 项目结构

```text
mcp-smart-contract-audit-demo/
├── kb/
│   ├── audit-checklist-general.md
│   ├── launchpad-risk-model.md
│   ├── nft-marketplace-risk-model.md
│   ├── staking-lending-risk-model.md
│   └── resume-focus-areas.md
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
cd /Users/aicong/Documents/Alvis\ 简历/mcp-smart-contract-audit-demo
node src/server.js
```

另一个终端执行演示客户端：

```bash
cd /Users/aicong/Documents/Alvis\ 简历/mcp-smart-contract-audit-demo
node scripts/demo-client.js
```

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

5. `resume_alignment_report`
   输出这个 demo 和简历中智能合约审计能力的对应关系，方便面试表达。

### Resources

- `kb://resume/focus-areas`
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

## 面试里可以怎么讲

### 1. 为什么做这个 demo

不是单纯调用 LLM 做“问答”，而是把审计能力拆成：

- 可调用工具
- 可复用知识
- 可复用工作流

这样能把一次性对话升级成可工程化接入的研发助手。

### 2. 为什么用 MCP

- 工具、资源、Prompt 有标准协议层
- 方便与 IDE、Agent、桌面客户端统一接入
- 更容易做权限控制、日志记录、工具治理

### 3. 如何体现你的简历亮点

- LaunchPad / NFT / Staking / Lending 的领域知识被沉淀进知识库
- 权限控制、签名校验、Gas 优化等安全点进入规则引擎
- Prompt 模板对应“Skill”思路，可复用于审计、排查、报告生成

## 可继续扩展

- 接入 Slither、Foundry、Mythril 等真实审计工具
- 增加合约 AST 分析，而不是只做字符串规则检查
- 接入向量数据库，把本地 Markdown 知识库升级为 RAG 检索
- 接入 OpenAI / Claude 等模型，把 prompts 直接串成完整审计 Agent
