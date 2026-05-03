import {
  api,
  formatDate,
  getStoredLocale,
  getStoredToken,
  setStoredLocale,
  setStoredToken
} from "./client.js";

const DEFAULT_LOCALE = "zh-CN";

const TRANSLATIONS = {
  "zh-CN": {
    pageTitle: "Smart Contract Audit Console",
    "brand.eyebrow": "MCP Audit Console",
    "brand.title": "链上审计台",
    "brand.copy": "基于 Slither / Aderyn / Mythril 的链上合约检测台。源码可得时优先走源码分析，代理合约会继续跟踪实现合约。",
    "token.title": "MCP Token",
    "token.label": "Bearer Token",
    "token.placeholder": "可选，仅在你手动调用 /mcp 时需要",
    "token.note": "当前 Web 页面调用的是公开 /api；只有直接访问 /mcp 时才需要 token。",
    "token.save": "保存 Token",
    "history.title": "审计历史",
    "history.refresh": "刷新",
    "history.empty": "还没有历史记录。",
    "hero.eyebrow": "Audit Operations",
    "hero.title": "线上合约审计",
    "hero.copy": "输入合约地址后，服务会自动尝试 Sourcify、Etherscan、Blockscout、RPC 代理解析，并在可用时接入 Slither、Aderyn 与 Mythril。",
    "hero.step1": "01 Source / Implementation",
    "hero.step2": "02 Slither",
    "hero.step3": "03 Aderyn",
    "hero.note": "源码分析与字节码分析尽量对准同一实现合约；没有源码时仅保留字节码引擎。",
    "form.address": "合约地址",
    "form.network": "网络",
    "form.networkNote": "如果你只知道合约在哪条常见 EVM 链上，直接选择网络即可。",
    "form.protocol": "协议类型",
    "form.chainId": "自定义 Chain ID",
    "form.chainIdPlaceholder": "如 324 / 59144",
    "form.chainIdNote": "只有在网络列表里找不到目标链时，才需要填写这项。",
    "form.submit": "发起审计",
    "form.submitting": "提交中...",
    "network.auto": "我不确定，自动识别",
    "network.custom": "自定义 Chain ID",
    "protocol.auto": "自动识别",
    "result.title": "结果详情",
    "result.metaEmpty": "选择一条审计记录后查看",
    "result.empty": "还没有选中的审计结果。",
    "result.loadingFailed": "加载失败：{message}",
    "result.pendingEmpty": "还没有选中的审计结果。",
    "result.loadingTitleQueued": "任务已进入队列",
    "result.loadingTitleRunning": "分析正在进行",
    "result.loadingCopyQueued": "服务已经接收请求，任务会按队列顺序启动。页面会自动刷新，你不需要手动重试。",
    "result.loadingCopyRunning": "分析器正在抓取源码、解析代理并执行 Slither / Aderyn / Mythril。页面会自动刷新并更新结果。",
    "result.loadingPulse": "分析中",
    "progress.current": "当前阶段",
    "progress.elapsed": "已耗时",
    "progress.source_fetch": "源码拉取",
    "progress.cache_check": "缓存检查",
    "progress.bytecode_fetch": "字节码读取",
    "progress.tool_analysis": "工具分析",
    "progress.ai_source_review": "AI 源码审计",
    "progress.ai_final_report": "AI 报告汇总",
    "progress.ai_translation": "AI 翻译",
    "progress.knowledge_store": "知识库写入",
    "progress.pending": "等待中",
    "progress.running": "进行中",
    "progress.completed": "已完成",
    "progress.failed": "失败",
    "progress.skipped": "已跳过",
    "result.status": "状态",
    "result.summary": "总结",
    "result.started": "开始时间",
    "result.error": "错误",
    "result.summaryCard": "Summary",
    "result.contractType": "Contract Type",
    "result.analysisMode": "Analysis Mode",
    "result.chain": "Chain",
    "result.sourceProvider": "Source Provider",
    "result.bytecode": "Bytecode",
    "result.contract": "Contract",
    "result.sourceAddress": "Source Address",
    "result.analysisTarget": "Analysis Target",
    "result.bytecodeAddress": "Bytecode Address",
    "result.proxy": "Proxy",
    "result.implementation": "Implementation",
    "result.detection": "Detection",
    "result.detectedIssues": "第三方检测结果",
    "result.detectedIssuesCount": "{count} 个问题",
    "result.securityFindings": "安全问题",
    "result.securityFindingsCount": "{count} 个安全问题",
    "result.advisoryFindings": "提示项",
    "result.advisoryFindingsCount": "{count} 个提示项",
    "result.advisoryCollapsed": "默认折叠，按需展开",
    "result.noFindings": "当前配置下没有检测到可展示的问题。",
    "ai.title": "AI 审计报告",
    "ai.status": "状态",
    "ai.model": "模型",
    "ai.mode": "模式",
    "ai.riskLevel": "风险等级",
    "ai.summary": "AI 总结",
    "ai.findings": "AI 汇总问题",
    "ai.suggestions": "修改建议",
    "ai.markdown": "完整报告",
    "ai.empty": "当前结果没有 AI 报告。请确认已配置模型，且任务不是旧缓存结果。",
    "result.raw": "查看原始 JSON",
    "result.selectAudit": "选择一条审计记录后查看",
    "engine.title": "分析引擎",
    "engine.count": "{count} 个结果",
    "engine.empty": "当前没有第三方引擎结果，可能未配置 RPC 或未启用相关分析器。",
    "engine.analysisFallback": "External analysis",
    "engine.noIssues": "该引擎没有返回可展示的问题。",
    "guidance.title": "检测栈",
    "guidance.sourceLabel": "Source / Implementation",
    "guidance.sourceCopy": "先抓已验证源码；代理合约会继续跟踪实现合约，避免源码和字节码分析目标错位。",
    "guidance.slitherCopy": "源码存在时执行静态检测，优先覆盖常见 Solidity 缺陷与代码味道。",
    "guidance.mythrilCopy": "通过 RPC 直接分析链上字节码，没有源码时仍可给出基础漏洞信号。",
    "boundary.title": "使用边界",
    "boundary.copy": "这是一个第三方分析器聚合台，不会因为“未报问题”就等于安全。目标是更可靠地发现基础漏洞，不替代正式审计。",
    "common.unknown": "unknown",
    "common.noSummary": "无摘要",
    "common.issueCount": "{count} issues",
    "common.chainId": "Chain ID {chainId}",
    "common.saveSuccess": "Token 已保存。",
    "common.inputChainId": "请输入自定义 Chain ID。",
    "common.why": "Why: {text}",
    "common.fix": "Fix: {text}",
    "common.noDescription": "No description.",
    "common.sourceLabel": "来源：{engine}",
    "common.driver": "driver {driver}",
    "common.method": "方法 {name}",
    "common.location": "位置 {location}",
    "common.instances": "{count} 个实例",
    "common.pc": "pc {pc}",
    "common.whyShort": "Why",
    "common.fixShort": "Fix",
    "summary.audit.noEngine": "{contractType} 合约未能成功运行任何第三方分析器（{analysisMode}）。在信任结果前请先检查 Slither / Aderyn / Mythril 配置。",
    "summary.audit.noIssues": "{contractType} 合约已完成{analysisMode}{verifiedSourceNote}。第三方分析器未报告问题，但仍需要人工复核。",
    "summary.audit.noIssues.verifiedSource": "，且已获取已验证源码",
    "summary.audit.withIssues": "{contractType} 合约已完成{analysisMode}，共发现 {issueCount} 个问题，其中 {highSeverityCount} 个为高危，结果来自 {engineCount} 个第三方分析器。",
    "summary.engine.reportedIssues": "{engine} 报告了 {issueCount} 个问题。",
    "summary.engine.noIssues": "{engine} 执行完成，未报告问题。",
    "summary.engine.skippedNoSource": "{engine} 已跳过，因为当前没有可用的已验证源码。",
    "summary.engine.skippedNoRpc": "{engine} 已跳过，因为当前解析链没有可用的 RPC 端点。",
    "summary.engine.skippedLargeBytecode": "{engine} 已跳过，因为字节码大小 {bytecodeSize} bytes 超过阈值 {maxBytecodeSize} bytes。",
    "summary.engine.disabled": "{engine} 已禁用。",
    "summary.engine.unavailable": "{engine} 无法执行。{detail}",
    "finding.txOrigin.why": "合约使用 tx.origin 做权限判断。攻击者可以通过中间合约诱导授权用户发起交易，从而绕过预期的调用边界。",
    "finding.txOrigin.fix": "改用 msg.sender 做鉴权，并将权限控制集中到 onlyOwner、AccessControl 或明确的角色校验上。",
    "finding.solcVersion.why": "当前 Solidity 版本约束覆盖了存在已知编译器缺陷的版本区间，结果可能受编译器 bug 影响。",
    "finding.solcVersion.fix": "升级到已验证安全的编译器版本，并固定精确版本；升级后重新编译和回归测试。",
    "finding.immutableStates.why": "该状态变量只在部署时赋值，声明为 immutable 可以减少存储读取并降低部署后的误改风险。",
    "finding.immutableStates.fix": "如果该值部署后不会变化，将其改为 immutable；如果必须可变，则保留当前写法并明确管理入口。",
    "finding.uncheckedLowLevel.why": "低级调用返回值未被检查，调用失败时可能静默继续执行，导致资金、状态或控制流与预期不一致。",
    "finding.uncheckedLowLevel.fix": "显式检查 call 返回值，失败时 revert；必要时改成更高层的安全调用封装。",
    "finding.missingZeroCheck.why": "关键地址参数没有零地址校验，可能导致资产发送失败、配置失效或后续逻辑进入异常状态。",
    "finding.missingZeroCheck.fix": "对关键地址参数增加 zero-address 校验，在写入状态或发起外部调用前先 reject address(0)。",
    "finding.lowLevelCalls.why": "低级调用会绕过接口类型约束和部分安全检查，需要人工确认重入、错误处理和调用目标可信度。",
    "finding.lowLevelCalls.fix": "仅在确有必要时使用低级调用，并补充重入防护、返回值检查以及调用目标白名单或约束。",
    "finding.reentrancyBalance.why": "合约在外部调用前后依赖余额或状态快照做判断。如果被调用方可重入，原先读取的余额或中间状态可能已经失效。",
    "finding.reentrancyBalance.fix": "把关键状态更新前置，避免在外部调用后继续依赖旧余额快照；必要时增加重入锁并改成 pull 模式结算。",
    "finding.reentrancyNoEth.why": "虽然这里不直接发送 ETH，但外部调用仍可能把控制权交给不可信合约，从而触发跨函数或跨路径重入。",
    "finding.reentrancyNoEth.fix": "按 checks-effects-interactions 重排逻辑，对敏感路径增加重入保护，并检查外部调用后是否继续使用陈旧状态。",
    "finding.uncheckedTransfer.why": "ERC20 transfer / transferFrom 的返回值没有被严格处理。某些代币会返回 false 而不是 revert，这会让失败静默发生。",
    "finding.uncheckedTransfer.fix": "改用 SafeERC20，或显式检查 transfer / transferFrom 返回值，确保失败时立即 revert。",
    "finding.unusedReturn.why": "函数或外部调用的返回值被忽略，可能掩盖失败、部分执行或意外结果，导致后续逻辑建立在错误假设上。",
    "finding.unusedReturn.fix": "检查并消费返回值；如果结果确实无关紧要，也应在代码中明确说明，避免留下误解空间。",
    "finding.arbitrarySendErc20.why": "代币发送目标或发送来源受用户输入影响，且缺少足够约束，可能导致资产被错误转移或绕过预期授权边界。",
    "finding.arbitrarySendErc20.fix": "收紧可转账的 token / from / to 参数来源，补充白名单、所有权校验或明确的业务约束。",
    "finding.writeAfterWrite.why": "同一存储槽在一次执行中被重复写入，通常意味着存在冗余赋值、顺序不清或可优化的状态流。",
    "finding.writeAfterWrite.fix": "合并重复写入，理清最终状态来源，避免中间无效赋值干扰审计和增加 gas 成本。",
    "finding.costlyLoop.why": "循环体内包含较重操作或依赖动态数据规模，随着数据增长可能变得不可调用，形成 gas DoS 风险。",
    "finding.costlyLoop.fix": "对循环规模设上界，改成分批处理、用户主动领取或链下预计算，避免单笔交易处理不受控的数据量。",
    "finding.callsLoop.why": "合约在循环中发起外部调用。只要接收方之一失败、消耗过多 gas，或者数量持续增长，这段逻辑就可能整体失败或变得不可执行。",
    "finding.callsLoop.fix": "避免在循环里做外部调用；改成分批处理、pull 模式领取，或至少对每次调用失败路径和循环上界做明确约束。",
    "finding.externalFunction.why": "函数被声明为 external，这本身不是漏洞，但意味着它只能从外部调用；在存在继承、内部复用或代理入口时，需要确认可见性与预期一致。",
    "finding.externalFunction.fix": "如果该函数需要被合约内部复用，改成 public 或 internal；如果只允许外部入口，保留 external 并结合访问控制一起审查。",
    "finding.namingConvention.why": "命名约定问题通常不是直接漏洞，但会降低代码可读性并增加审计、维护和误用风险，尤其是在复杂协议代码中更明显。",
    "finding.namingConvention.fix": "统一函数、变量、事件和常量命名风格，尽量贴近 Solidity 社区约定，让安全审查和长期维护更直接。",
    "finding.weakPrng.why": "合约把链上可预测变量当作随机源，这些值对验证者、打包者或攻击者并不真正随机。",
    "finding.weakPrng.fix": "不要使用 block.timestamp、blockhash、coinbase 等链上环境变量生成关键随机数；改用 VRF 或 commit-reveal。",
    "finding.assertViolation.why": "Mythril 发现某条执行路径可能触发 assert 失败。这通常意味着内部不变量、边界条件或外部调用返回值处理存在问题。",
    "finding.assertViolation.fix": "检查命中的 assert 路径，确认这里是否本应使用 require；同时补充输入校验、返回值校验和不变量测试。",
    "finding.timestampDependence.why": "合约把区块时间戳用于控制流判断。矿工或区块生产者可以在有限范围内操纵时间戳，这会让业务逻辑带入额外信任假设。",
    "finding.timestampDependence.fix": "不要把 block.timestamp 或 now 用作安全关键判断或随机源；如必须依赖时间，明确容忍范围并结合额外保护。",
    "finding.generic.why": "第三方分析器报告了一个潜在问题，需要结合源码、调用路径和业务上下文进一步确认可利用性。",
    "finding.generic.fix": "检查命中的代码路径，确认触发条件与影响范围，再针对根因修复并补充测试。"
  },
  "en-US": {
    pageTitle: "Smart Contract Audit Console",
    "brand.eyebrow": "MCP Audit Console",
    "brand.title": "On-chain Audit Console",
    "brand.copy": "A contract analysis console backed by Slither, Aderyn, and Mythril. Verified source is preferred, and proxy contracts follow their implementation target.",
    "token.title": "MCP Token",
    "token.label": "Bearer Token",
    "token.placeholder": "Optional. Only needed when you call /mcp directly.",
    "token.note": "The web UI talks to public /api endpoints. A token is only needed for direct /mcp access.",
    "token.save": "Save Token",
    "history.title": "Audit History",
    "history.refresh": "Refresh",
    "history.empty": "No audit history yet.",
    "hero.eyebrow": "Audit Operations",
    "hero.title": "Contract Audit",
    "hero.copy": "Enter a contract address and the service will try Sourcify, Etherscan, Blockscout, and RPC-based proxy resolution, then attach Slither, Aderyn, and Mythril when available.",
    "hero.step1": "01 Source / Implementation",
    "hero.step2": "02 Slither",
    "hero.step3": "03 Aderyn",
    "hero.note": "Source and bytecode analyzers are aligned to the same implementation target whenever possible. Without source, only bytecode engines remain.",
    "form.address": "Contract Address",
    "form.network": "Network",
    "form.networkNote": "If you only know the chain family, selecting the network name is enough.",
    "form.protocol": "Protocol Type",
    "form.chainId": "Custom Chain ID",
    "form.chainIdPlaceholder": "e.g. 324 / 59144",
    "form.chainIdNote": "Only fill this in when the chain is not listed above.",
    "form.submit": "Start Audit",
    "form.submitting": "Submitting...",
    "network.auto": "I am not sure, auto-detect",
    "network.custom": "Custom Chain ID",
    "protocol.auto": "Auto-detect",
    "result.title": "Result Details",
    "result.metaEmpty": "Select an audit run to inspect",
    "result.empty": "No audit result selected.",
    "result.loadingFailed": "Load failed: {message}",
    "result.pendingEmpty": "No audit result selected.",
    "result.loadingTitleQueued": "Job queued",
    "result.loadingTitleRunning": "Analysis in progress",
    "result.loadingCopyQueued": "The service accepted the request and will start it when the queue slot is available. This page refreshes automatically.",
    "result.loadingCopyRunning": "The analyzers are fetching source, resolving proxies, and running Slither / Aderyn / Mythril. This page refreshes automatically.",
    "result.loadingPulse": "Analyzing",
    "progress.current": "Current Stage",
    "progress.elapsed": "Elapsed",
    "progress.source_fetch": "Source Fetch",
    "progress.cache_check": "Cache Check",
    "progress.bytecode_fetch": "Bytecode Fetch",
    "progress.tool_analysis": "Tool Analysis",
    "progress.ai_source_review": "AI Source Review",
    "progress.ai_final_report": "AI Report Summary",
    "progress.ai_translation": "AI Translation",
    "progress.knowledge_store": "Knowledge Store",
    "progress.pending": "Pending",
    "progress.running": "Running",
    "progress.completed": "Completed",
    "progress.failed": "Failed",
    "progress.skipped": "Skipped",
    "result.status": "Status",
    "result.summary": "Summary",
    "result.started": "Started",
    "result.error": "Error",
    "result.summaryCard": "Summary",
    "result.contractType": "Contract Type",
    "result.analysisMode": "Analysis Mode",
    "result.chain": "Chain",
    "result.sourceProvider": "Source Provider",
    "result.bytecode": "Bytecode",
    "result.contract": "Contract",
    "result.sourceAddress": "Source Address",
    "result.analysisTarget": "Analysis Target",
    "result.bytecodeAddress": "Bytecode Address",
    "result.proxy": "Proxy",
    "result.implementation": "Implementation",
    "result.detection": "Detection",
    "result.detectedIssues": "Detected Issues",
    "result.detectedIssuesCount": "{count} issues",
    "result.securityFindings": "Security Findings",
    "result.securityFindingsCount": "{count} security findings",
    "result.advisoryFindings": "Advisories",
    "result.advisoryFindingsCount": "{count} advisories",
    "result.advisoryCollapsed": "Collapsed by default",
    "result.noFindings": "No displayable issues were reported by the configured analyzers.",
    "ai.title": "AI Audit Report",
    "ai.status": "Status",
    "ai.model": "Model",
    "ai.mode": "Mode",
    "ai.riskLevel": "Risk Level",
    "ai.summary": "AI Summary",
    "ai.findings": "AI Findings",
    "ai.suggestions": "Modification Suggestions",
    "ai.markdown": "Full Report",
    "ai.empty": "No AI report is available for this result. Check model configuration or whether this is an older cached result.",
    "result.raw": "View raw JSON",
    "result.selectAudit": "Select an audit run to inspect",
    "engine.title": "Analyzers",
    "engine.count": "{count} results",
    "engine.empty": "No third-party analyzer output is available. RPC or analyzer integrations may be missing.",
    "engine.analysisFallback": "External analysis",
    "engine.noIssues": "This analyzer did not return any displayable issue.",
    "guidance.title": "Detection Stack",
    "guidance.sourceLabel": "Source / Implementation",
    "guidance.sourceCopy": "Fetch verified source first. For proxies, continue to the implementation contract so source and bytecode analyzers stay aligned.",
    "guidance.slitherCopy": "Runs static source analysis when verified source is available, covering common Solidity defects and code smells.",
    "guidance.mythrilCopy": "Runs bytecode analysis over RPC, so it can still surface baseline vulnerability signals without verified source.",
    "boundary.title": "Scope",
    "boundary.copy": "This is a third-party analyzer console. “No issues found” does not mean safe. The goal is to catch baseline vulnerabilities more reliably, not replace a formal audit.",
    "common.unknown": "unknown",
    "common.noSummary": "No summary",
    "common.issueCount": "{count} issues",
    "common.chainId": "Chain ID {chainId}",
    "common.saveSuccess": "Token saved.",
    "common.inputChainId": "Please enter a custom Chain ID.",
    "common.why": "Why: {text}",
    "common.fix": "Fix: {text}",
    "common.noDescription": "No description.",
    "common.sourceLabel": "Source: {engine}",
    "common.driver": "driver {driver}",
    "common.method": "Method {name}",
    "common.location": "Location {location}",
    "common.instances": "{count} instances",
    "common.pc": "pc {pc}",
    "common.whyShort": "Why",
    "common.fixShort": "Fix",
    "summary.audit.noEngine": "{contractType} contract analysis could not run any third-party engine in {analysisMode}. Check Slither/Aderyn/Mythril configuration before trusting the result.",
    "summary.audit.noIssues": "{contractType} contract analysis completed in {analysisMode}{verifiedSourceNote}. Third-party engines reported no issues, but manual review is still required.",
    "summary.audit.noIssues.verifiedSource": " with verified source",
    "summary.audit.withIssues": "{contractType} contract analysis completed in {analysisMode} with {issueCount} issue(s), including {highSeverityCount} high-severity item(s), from {engineCount} third-party engine(s).",
    "summary.engine.reportedIssues": "{engine} reported {issueCount} issue(s).",
    "summary.engine.noIssues": "{engine} completed without reporting issues.",
    "summary.engine.skippedNoSource": "{engine} was skipped because verified source was not available.",
    "summary.engine.skippedNoRpc": "{engine} was skipped because no RPC endpoint was available for the resolved chain.",
    "summary.engine.skippedLargeBytecode": "{engine} was skipped because bytecode size {bytecodeSize} bytes exceeds the {maxBytecodeSize} byte limit.",
    "summary.engine.disabled": "{engine} integration is disabled.",
    "summary.engine.unavailable": "{engine} could not be executed. {detail}",
    "finding.txOrigin.why": "The contract uses tx.origin for authorization. An attacker can route a privileged user's transaction through an intermediary contract and bypass the intended trust boundary.",
    "finding.txOrigin.fix": "Use msg.sender for authorization and keep access control behind onlyOwner, AccessControl, or explicit role checks.",
    "finding.solcVersion.why": "The Solidity version constraint includes compiler versions with known bugs, so the compiled result may inherit compiler-level risk.",
    "finding.solcVersion.fix": "Upgrade to a vetted compiler version, pin it precisely, and rerun compilation plus regression tests.",
    "finding.immutableStates.why": "This state variable appears to be assigned only at deployment time. Declaring it immutable reduces storage reads and narrows accidental mutation risk.",
    "finding.immutableStates.fix": "Mark the value immutable if it never changes after deployment; otherwise keep it mutable and document the admin update path clearly.",
    "finding.uncheckedLowLevel.why": "A low-level call result is ignored. If the call fails silently, funds, state transitions, or control flow may diverge from expectations.",
    "finding.uncheckedLowLevel.fix": "Check the call return value explicitly and revert on failure, or replace it with a safer higher-level call pattern.",
    "finding.missingZeroCheck.why": "A critical address is accepted without an address(0) guard, which can break transfers, disable configuration, or push later logic into an invalid state.",
    "finding.missingZeroCheck.fix": "Validate critical address inputs against address(0) before storing them or using them in external calls.",
    "finding.lowLevelCalls.why": "Low-level calls bypass interface typing and some safety guarantees, so reentrancy, target trust, and failure handling need manual review.",
    "finding.lowLevelCalls.fix": "Use low-level calls only when necessary and add reentrancy protection, return-value checks, and target constraints or allowlists.",
    "finding.reentrancyBalance.why": "The contract relies on a balance or state snapshot across an external call. If the callee can reenter, the previously observed value may already be stale.",
    "finding.reentrancyBalance.fix": "Move critical state updates before the external call, avoid using stale balance snapshots afterward, and add a reentrancy guard where needed.",
    "finding.reentrancyNoEth.why": "Even without directly sending ETH, this external call still transfers control to untrusted code and may enable cross-function or cross-path reentrancy.",
    "finding.reentrancyNoEth.fix": "Follow checks-effects-interactions, add reentrancy protection on sensitive paths, and verify that no stale state is consumed after the external call returns.",
    "finding.uncheckedTransfer.why": "The return value of ERC20 transfer / transferFrom is not handled strictly. Some tokens return false instead of reverting, which can make failure silent.",
    "finding.uncheckedTransfer.fix": "Use SafeERC20 or explicitly check the transfer / transferFrom return value so failures revert immediately.",
    "finding.unusedReturn.why": "A function or external call result is ignored, which can hide failure, partial execution, or an unexpected value and leave later logic based on a false assumption.",
    "finding.unusedReturn.fix": "Consume and validate the return value. If the result is intentionally irrelevant, document that explicitly in code instead of silently discarding it.",
    "finding.arbitrarySendErc20.why": "The token transfer source or destination is overly influenced by user input and lacks enough constraints, which can lead to unintended asset movement.",
    "finding.arbitrarySendErc20.fix": "Constrain token / from / to parameters with allowlists, ownership checks, or explicit business rules before executing the transfer.",
    "finding.writeAfterWrite.why": "The same storage slot is written multiple times in one execution path. This often indicates redundant state transitions, unclear ordering, or unnecessary gas overhead.",
    "finding.writeAfterWrite.fix": "Collapse duplicate writes, make the final state transition explicit, and remove intermediate assignments that do not affect the final result.",
    "finding.costlyLoop.why": "The loop body is expensive or depends on unbounded data size, so it may become uncallable as the dataset grows and create gas-based denial of service.",
    "finding.costlyLoop.fix": "Bound loop size, move work to batched processing or pull-based settlement, and avoid single-transaction work that scales with unbounded state.",
    "finding.callsLoop.why": "The contract performs external calls inside a loop. If any callee fails, consumes excessive gas, or the recipient set keeps growing, the whole path may become fragile or uncallable.",
    "finding.callsLoop.fix": "Avoid external calls inside loops. Prefer batching, pull-based withdrawals, or at minimum enforce a clear loop bound and explicit failure handling per iteration.",
    "finding.externalFunction.why": "An external visibility finding is not automatically a vulnerability, but it changes how the function can be reached and reused. In inheritance-heavy or proxied systems, mismatched visibility can still create maintainability and review risk.",
    "finding.externalFunction.fix": "Use public or internal if the function should be reused inside the contract hierarchy. Keep external only when that boundary is intentional and verified alongside access control.",
    "finding.namingConvention.why": "Naming convention issues are usually not direct vulnerabilities, but they reduce readability and increase audit, maintenance, and misuse risk, especially in larger protocol codebases.",
    "finding.namingConvention.fix": "Normalize function, variable, event, and constant naming to Solidity conventions so security review and long-term maintenance stay straightforward.",
    "finding.weakPrng.why": "The contract relies on predictable chain variables as a randomness source. These values are observable and can be influenced within limits by block producers.",
    "finding.weakPrng.fix": "Do not use block.timestamp, blockhash, coinbase, or similar variables for security-critical randomness; switch to VRF or a commit-reveal design.",
    "finding.assertViolation.why": "Mythril found an execution path that may trigger an assert failure. This often points to broken invariants, missing bounds checks, or unsafe handling of external call results.",
    "finding.assertViolation.fix": "Inspect the asserted path, verify whether assert should be require, and add input validation, return-value checks, and invariant tests around that flow.",
    "finding.timestampDependence.why": "The contract uses block time as part of a control-flow decision. Block producers can influence timestamps within a bounded range, so this introduces an avoidable trust assumption.",
    "finding.timestampDependence.fix": "Do not use block.timestamp or now for security-critical branching or randomness. If time dependence is unavoidable, constrain the tolerated window and add secondary safeguards.",
    "finding.generic.why": "A third-party analyzer reported a potential issue. Exploitability still needs to be confirmed against the source, control flow, and business context.",
    "finding.generic.fix": "Inspect the affected path, verify trigger conditions and blast radius, then patch the root cause and add tests."
  }
};

const state = {
  token: getStoredToken(),
  locale: resolveInitialLocale(),
  audits: [],
  selectedAuditId: "",
  pollTimer: null
};

const tokenInput = document.querySelector("#token-input");
const saveTokenButton = document.querySelector("#save-token");
const auditForm = document.querySelector("#audit-form");
const auditNetworkSelect = document.querySelector("#audit-network");
const auditChainIdField = document.querySelector("#audit-chain-id-field");
const auditChainIdInput = document.querySelector("#audit-chain-id");
const auditAddressInput = document.querySelector("#audit-address");
const auditContractTypeSelect = document.querySelector("#audit-contract-type");
const auditList = document.querySelector("#audit-list");
const resultView = document.querySelector("#result-view");
const resultMeta = document.querySelector("#result-meta");
const refreshAuditsButton = document.querySelector("#refresh-audits");
const auditSubmitButton = auditForm.querySelector("button[type=\"submit\"]");
const findingTemplate = document.querySelector("#finding-template");
const engineTemplate = document.querySelector("#engine-template");
const localeButtons = Array.from(document.querySelectorAll(".locale-button"));

tokenInput.value = state.token;

const CHAIN_LABELS = new Map([
  ["ethereum", "Ethereum"],
  ["optimism", "Optimism"],
  ["bsc", "BNB Smart Chain"],
  ["bsc-testnet", "BSC Testnet"],
  ["gnosis", "Gnosis"],
  ["polygon", "Polygon"],
  ["fantom", "Fantom"],
  ["zksync-era", "zkSync Era"],
  ["base", "Base"],
  ["avalanche", "Avalanche"],
  ["linea", "Linea"],
  ["arbitrum", "Arbitrum"],
  ["sepolia", "Sepolia"]
]);

const STATUS_LABELS = {
  pending: { "zh-CN": "排队中", "en-US": "pending" },
  running: { "zh-CN": "分析中", "en-US": "running" },
  succeeded: { "zh-CN": "已完成", "en-US": "succeeded" },
  failed: { "zh-CN": "失败", "en-US": "failed" },
  timeout: { "zh-CN": "超时", "en-US": "timeout" },
  ok: { "zh-CN": "正常", "en-US": "ok" },
  skipped: { "zh-CN": "已跳过", "en-US": "skipped" },
  disabled: { "zh-CN": "已禁用", "en-US": "disabled" },
  unavailable: { "zh-CN": "不可用", "en-US": "unavailable" }
};

const ANALYSIS_MODE_LABELS = {
  "source-static": { "zh-CN": "源码静态分析", "en-US": "source static" },
  "address-rpc-bytecode": { "zh-CN": "RPC 字节码分析", "en-US": "RPC bytecode" },
  "source-and-bytecode": { "zh-CN": "源码 + 字节码", "en-US": "source + bytecode" },
  "source-only": { "zh-CN": "仅源码", "en-US": "source only" },
  "bytecode-only": { "zh-CN": "仅字节码", "en-US": "bytecode only" }
};

const ENGINE_TITLE_LABELS = {
  "Slither source analysis": { "zh-CN": "Slither 源码分析", "en-US": "Slither source analysis" },
  "Aderyn source analysis": { "zh-CN": "Aderyn 源码分析", "en-US": "Aderyn source analysis" },
  "Mythril bytecode analysis": { "zh-CN": "Mythril 字节码分析", "en-US": "Mythril bytecode analysis" }
};

const FINDING_TITLE_LABELS = {
  "tx-origin": { "zh-CN": "使用 tx.origin 做鉴权", "en-US": "Dangerous tx.origin authorization" },
  "solc-version": { "zh-CN": "Solidity 版本约束存在已知问题", "en-US": "Risky Solidity version constraint" },
  "immutable-states": { "zh-CN": "状态变量可声明为 immutable", "en-US": "State variable should be immutable" },
  "unchecked-lowlevel": { "zh-CN": "未检查低级调用返回值", "en-US": "Unchecked low-level call" },
  "missing-zero-check": { "zh-CN": "关键地址缺少零地址检查", "en-US": "Missing zero-address check" },
  "low-level-calls": { "zh-CN": "存在低级调用", "en-US": "Low-level call detected" },
  "reentrancy-balance": { "zh-CN": "余额快照相关重入风险", "en-US": "Reentrancy via stale balance snapshot" },
  "reentrancy-no-eth": { "zh-CN": "外部调用重入风险", "en-US": "Reentrancy through external call" },
  "unchecked-transfer": { "zh-CN": "未检查 ERC20 转账结果", "en-US": "Unchecked ERC20 transfer result" },
  "unused-return": { "zh-CN": "返回值被忽略", "en-US": "Unused return value" },
  "arbitrary-send-erc20": { "zh-CN": "ERC20 发送目标约束不足", "en-US": "Arbitrary ERC20 send surface" },
  "write-after-write": { "zh-CN": "重复写入同一状态", "en-US": "Write-after-write state update" },
  "costly-loop": { "zh-CN": "高成本循环", "en-US": "Costly loop" },
  "calls-loop": { "zh-CN": "循环中的外部调用", "en-US": "External calls inside loop" },
  "external-function": { "zh-CN": "外部可见性提示", "en-US": "External visibility notice" },
  "naming-convention": { "zh-CN": "命名约定问题", "en-US": "Naming convention issue" },
  "weak-prng": { "zh-CN": "弱随机数来源", "en-US": "Weak randomness source" },
  "timestamp": { "zh-CN": "时间戳依赖", "en-US": "Timestamp dependence" },
  "Assert violation risk": { "zh-CN": "断言失败风险", "en-US": "Assert violation risk" },
  "Timestamp dependence": { "zh-CN": "时间戳依赖", "en-US": "Timestamp dependence" },
  "Dangerous tx.origin authorization": { "zh-CN": "使用 tx.origin 做鉴权", "en-US": "Dangerous tx.origin authorization" },
  "Unchecked external call result": { "zh-CN": "未检查外部调用返回值", "en-US": "Unchecked external call result" },
  "Reentrancy": { "zh-CN": "重入风险", "en-US": "Reentrancy" },
  "Untrusted delegatecall target": { "zh-CN": "delegatecall 目标不可信", "en-US": "Untrusted delegatecall target" }
};

function resolveInitialLocale() {
  const stored = getStoredLocale();
  if (stored && TRANSLATIONS[stored]) {
    return stored;
  }
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

function t(key, params = {}) {
  const table = TRANSLATIONS[state.locale] || TRANSLATIONS[DEFAULT_LOCALE];
  const fallback = TRANSLATIONS[DEFAULT_LOCALE];
  const template = table[key] || fallback[key] || key;
  return template.replace(/\{(\w+)\}/g, (_match, name) => String(params[name] ?? ""));
}

function translateLabel(table, value) {
  if (!value) {
    return "";
  }
  const entry = table[String(value)];
  if (!entry) {
    return String(value);
  }
  return entry[state.locale] || entry[DEFAULT_LOCALE] || String(value);
}

function formatStatusLabel(value) {
  return translateLabel(STATUS_LABELS, String(value || "").toLowerCase()) || t("common.unknown");
}

function formatDuration(ms) {
  if (!Number.isFinite(Number(ms)) || Number(ms) < 0) {
    return "";
  }
  const seconds = Number(ms) / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

function formatElapsedSince(value) {
  if (!value) {
    return "";
  }
  const started = new Date(value).getTime();
  if (!Number.isFinite(started)) {
    return "";
  }
  return formatDuration(Date.now() - started);
}

function formatProgressStageLabel(stageId) {
  return t(`progress.${stageId}`) || stageId;
}

function formatProgressStatus(status) {
  return t(`progress.${status || "pending"}`) || status || "";
}

function renderAuditProgress(progress) {
  if (!progress || !Array.isArray(progress.stages) || progress.stages.length === 0) {
    return "";
  }
  const current = progress.currentStage ? formatProgressStageLabel(progress.currentStage) : "";
  const elapsed = formatElapsedSince(progress.startedAt);
  return `
    <div class="progress-panel">
      <div class="progress-head">
        ${current ? `<span>${escapeHtml(t("progress.current"))}: <strong>${escapeHtml(current)}</strong></span>` : ""}
        ${elapsed ? `<span>${escapeHtml(t("progress.elapsed"))}: <strong>${escapeHtml(elapsed)}</strong></span>` : ""}
      </div>
      <div class="progress-list">
        ${progress.stages.map((stage) => `
          <div class="progress-item ${escapeHtml(stage.status || "pending")}">
            <span class="progress-dot"></span>
            <div>
              <div class="progress-title">
                <strong>${escapeHtml(formatProgressStageLabel(stage.id))}</strong>
                <span>${escapeHtml(formatProgressStatus(stage.status))}${stage.durationMs != null ? ` · ${escapeHtml(formatDuration(stage.durationMs))}` : ""}</span>
              </div>
              ${stage.detail ? `<p>${escapeHtml(stage.detail)}</p>` : ""}
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function formatAnalysisModeLabel(value) {
  return translateLabel(ANALYSIS_MODE_LABELS, value) || value || "-";
}

function formatEngineTitle(value) {
  return translateLabel(ENGINE_TITLE_LABELS, value) || value || t("engine.analysisFallback");
}

function formatIssueTitle(value) {
  return translateLabel(FINDING_TITLE_LABELS, value) || value || "Unnamed issue";
}

function formatFindingGuidance(rawText, guidanceKey, fallbackKey, params = {}) {
  if (rawText && (!guidanceKey || String(guidanceKey).includes("generic"))) {
    return rawText;
  }
  if (guidanceKey) {
    return t(guidanceKey, params);
  }
  if (fallbackKey && !rawText) {
    return t(fallbackKey, params);
  }
  return rawText || t("common.noDescription");
}

function formatSummaryText(summary, summaryCode = "", summaryParams = null) {
  if (summaryCode) {
    const params = { ...(summaryParams || {}) };
    if (summaryCode === "audit.noIssues") {
      params.verifiedSourceNote = params.sourceAvailable === "true" ? t("summary.audit.noIssues.verifiedSource") : "";
      params.analysisMode = formatAnalysisModeLabel(params.analysisMode || "");
      return t(`summary.${summaryCode}`, params);
    }
    if (summaryCode === "audit.noEngine" || summaryCode === "audit.withIssues") {
      params.analysisMode = formatAnalysisModeLabel(params.analysisMode || "");
      return t(`summary.${summaryCode}`, params);
    }
    if (summaryCode.startsWith("engine.")) {
      return t(`summary.${summaryCode}`, params);
    }
  }

  const text = String(summary || "").trim();
  if (!text) {
    return t("common.noSummary");
  }
  if (state.locale !== "zh-CN") {
    return text;
  }

  let match = text.match(/^Slither reported (\d+) issue\(s\)\.$/);
  if (match) {
    return `Slither 报告了 ${match[1]} 个问题。`;
  }

  match = text.match(/^Mythril reported (\d+) issue\(s\)\.$/);
  if (match) {
    return `Mythril 报告了 ${match[1]} 个问题。`;
  }
  match = text.match(/^Aderyn reported (\d+) issue\(s\)\.$/);
  if (match) {
    return `Aderyn 报告了 ${match[1]} 个问题。`;
  }

  match = text.match(/^(.+?) contract analysis completed in (.+?) mode with (\d+) issue\(s\), including (\d+) high-severity item\(s\), from (\d+) third-party engine\(s\)\.$/);
  if (match) {
    return `${match[1]} 合约已完成${formatAnalysisModeLabel(match[2])}，共发现 ${match[3]} 个问题，其中 ${match[4]} 个为高危，结果来自 ${match[5]} 个第三方分析器。`;
  }

  match = text.match(/^(.+?) contract analysis completed in (.+?) mode(?: with verified source)?\. Third-party engines reported no issues, but manual review is still required\.$/);
  if (match) {
    return `${match[1]} 合约已完成${formatAnalysisModeLabel(match[2])}。第三方分析器未报告问题，但仍需要人工复核。`;
  }

  match = text.match(/^(.+?) contract analysis could not run any third-party engine in (.+?) mode\. Check Slither\/Aderyn\/Mythril configuration before trusting the result\.$/);
  if (match) {
    return `${match[1]} 合约未能成功运行任何第三方分析器（${formatAnalysisModeLabel(match[2])}）。在信任结果前请先检查 Slither / Aderyn / Mythril 配置。`;
  }

  if (text === "Slither completed without reporting issues.") {
    return "Slither 执行完成，未报告问题。";
  }
  if (text === "Mythril completed without reporting issues.") {
    return "Mythril 执行完成，未报告问题。";
  }
  if (text === "Aderyn completed without reporting issues.") {
    return "Aderyn 执行完成，未报告问题。";
  }
  if (text.startsWith("Slither could not be executed.")) {
    return `Slither 无法执行。${text.slice("Slither could not be executed.".length).trim()}`;
  }
  if (text.startsWith("Mythril could not be executed.")) {
    return `Mythril 无法执行。${text.slice("Mythril could not be executed.".length).trim()}`;
  }
  if (text.startsWith("Aderyn could not be executed.")) {
    return `Aderyn 无法执行。${text.slice("Aderyn could not be executed.".length).trim()}`;
  }

  return text;
}

function applyTranslations() {
  document.documentElement.lang = state.locale;
  document.title = t("pageTitle");

  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }

  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  }

  for (const button of localeButtons) {
    button.classList.toggle("active", button.dataset.locale === state.locale);
  }

  setSubmitState(auditSubmitButton.classList.contains("loading"));
}

function formatChainName(chainName) {
  if (!chainName) {
    return "";
  }
  return CHAIN_LABELS.get(chainName) || chainName;
}

function formatChainLabel(chainId, chainName) {
  const label = formatChainName(chainName);
  if (label) {
    return label;
  }
  return chainId ? `Chain ${chainId}` : "-";
}

function renderChainSummary(chainId, chainName) {
  const label = formatChainLabel(chainId, chainName);
  const idNote = chainId ? `<small class="value-note">${escapeHtml(t("common.chainId", { chainId }))}</small>` : "";
  return `<strong>${escapeHtml(label)}</strong>${idNote}`;
}

function syncChainIdField() {
  const isCustomChain = auditNetworkSelect.value === "custom";
  auditChainIdField.hidden = !isCustomChain;
  auditChainIdInput.required = isCustomChain;
  if (!isCustomChain) {
    auditChainIdInput.value = "";
  }
}

function isTerminalStatus(status) {
  return ["succeeded", "failed", "timeout"].includes(status);
}

function setSubmitState(isBusy) {
  auditSubmitButton.disabled = Boolean(isBusy);
  auditSubmitButton.classList.toggle("loading", Boolean(isBusy));
  auditSubmitButton.textContent = isBusy ? t("form.submitting") : t("form.submit");
}

function schedulePolling() {
  if (state.pollTimer) {
    clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }

  if (!state.audits.some((audit) => !isTerminalStatus(audit.status))) {
    return;
  }

  state.pollTimer = window.setTimeout(() => {
    loadAudits().catch(() => {});
  }, 2500);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function renderInlineMarkdown(text) {
  const codeSpans = [];
  let html = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    const token = `\u0000CODE${codeSpans.length}\u0000`;
    codeSpans.push(`<code>${code}</code>`);
    return token;
  });
  html = html
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g, (_, label, href) => (
      `<a href="${escapeAttribute(href)}" target="_blank" rel="noreferrer">${label}</a>`
    ));
  return html.replace(/\u0000CODE(\d+)\u0000/g, (_, index) => codeSpans[Number(index)] || "");
}

function renderMarkdownTable(lines) {
  const rows = lines.map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
  if (rows.length < 2) {
    return "";
  }
  const headers = rows[0];
  const bodyRows = rows.slice(2);
  return `
    <div class="markdown-table-wrap">
      <table>
        <thead><tr>${headers.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("")}</tr></thead>
        <tbody>
          ${bodyRows.map((row) => `<tr>${headers.map((_, index) => `<td>${renderInlineMarkdown(row[index] || "")}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let list = null;
  let table = [];
  let inCode = false;
  let codeLang = "";
  let codeLines = [];

  const flushParagraph = () => {
    if (!paragraph.length) {
      return;
    }
    html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) {
      return;
    }
    html.push(`<${list.type}>${list.items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${list.type}>`);
    list = null;
  };
  const flushTable = () => {
    if (!table.length) {
      return;
    }
    const rendered = renderMarkdownTable(table);
    if (rendered) {
      html.push(rendered);
    } else {
      paragraph.push(...table);
    }
    table = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const fence = trimmed.match(/^```([\w-]*)/);
    if (fence) {
      if (inCode) {
        html.push(`<pre><code${codeLang ? ` class="language-${escapeAttribute(codeLang)}"` : ""}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        inCode = false;
        codeLang = "";
        codeLines = [];
      } else {
        flushParagraph();
        flushList();
        flushTable();
        inCode = true;
        codeLang = fence[1] || "";
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      flushList();
      flushTable();
      continue;
    }
    if (/^\|.+\|$/.test(trimmed)) {
      flushParagraph();
      flushList();
      table.push(trimmed);
      continue;
    }
    flushTable();
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length + 1;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    if (/^---+$/.test(trimmed)) {
      flushParagraph();
      flushList();
      html.push("<hr>");
      continue;
    }
    const quote = trimmed.match(/^>\s+(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      html.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }
    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const type = unordered ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((unordered || ordered)[1]);
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  if (inCode) {
    html.push(`<pre><code${codeLang ? ` class="language-${escapeAttribute(codeLang)}"` : ""}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  flushParagraph();
  flushList();
  flushTable();
  return html.join("\n");
}

function renderAuditList() {
  if (state.audits.length === 0) {
    auditList.innerHTML = `<p class="empty-state">${escapeHtml(t("history.empty"))}</p>`;
    return;
  }

  auditList.innerHTML = "";
  for (const audit of state.audits) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `audit-card ${audit.id === state.selectedAuditId ? "active" : ""}`;
    button.innerHTML = `
      <span class="audit-target">${escapeHtml(audit.target)}</span>
      <span class="audit-sub">${escapeHtml(formatDate(audit.createdAt, state.locale))}</span>
      <span class="audit-sub">${escapeHtml(formatStatusLabel(audit.status))}</span>
      <span class="audit-sub">${escapeHtml(formatSummaryText(
        audit.summary || audit.result?.summary || t("common.noSummary"),
        audit.result?.summaryCode || "",
        audit.result?.summaryParams || null
      ))}</span>
    `;
    button.addEventListener("click", () => {
      state.selectedAuditId = audit.id;
      renderAuditList();
      renderSelectedAudit();
    });
    auditList.appendChild(button);
  }
}

function renderIssueChips(issue) {
  return [
    issue.swcId ? `<span class="chip">SWC ${escapeHtml(issue.swcId)}</span>` : "",
    issue.functionName ? `<span class="chip">${escapeHtml(issue.functionName)}</span>` : "",
    issue.sourcePath && issue.line ? `<span class="chip">${escapeHtml(`${issue.sourcePath}:${issue.line}`)}</span>` : "",
    typeof issue.pc === "number" ? `<span class="chip">${escapeHtml(t("common.pc", { pc: issue.pc }))}</span>` : "",
    issue.instanceCount > 1 ? `<span class="chip">${escapeHtml(t("common.instances", { count: issue.instanceCount }))}</span>` : ""
  ].filter(Boolean).join("");
}

function renderFindingMetaChips(finding) {
  return [
    finding.engine ? `<span class="chip">${escapeHtml(finding.engine)}</span>` : "",
    finding.swcId ? `<span class="chip">SWC ${escapeHtml(finding.swcId)}</span>` : "",
    finding.functionName ? `<span class="chip">${escapeHtml(t("common.method", { name: finding.functionName }))}</span>` : "",
    finding.sourcePath && finding.line ? `<span class="chip">${escapeHtml(t("common.location", { location: `${finding.sourcePath}:${finding.line}` }))}</span>` : "",
    typeof finding.pc === "number" ? `<span class="chip">${escapeHtml(t("common.pc", { pc: finding.pc }))}</span>` : "",
    finding.instanceCount > 1 ? `<span class="chip">${escapeHtml(t("common.instances", { count: finding.instanceCount }))}</span>` : ""
  ].filter(Boolean).join("");
}

function formatLocationLabel(item) {
  if (item.functionName) {
    return t("common.method", { name: item.functionName });
  }
  if (item.sourcePath && item.line) {
    return t("common.location", { location: `${item.sourcePath}:${item.line}` });
  }
  if (typeof item.pc === "number") {
    return t("common.pc", { pc: item.pc });
  }
  return "";
}

function appendEngineResults(container, audit) {
  const analyses = Array.isArray(audit.result.externalAnalyses) ? audit.result.externalAnalyses : [];
  const section = document.createElement("section");
  section.className = "engine-section";
  section.innerHTML = `
    <div class="section-head">
      <h3>${escapeHtml(t("engine.title"))}</h3>
      <span class="panel-note">${escapeHtml(t("engine.count", { count: analyses.length }))}</span>
    </div>
  `;

  const list = document.createElement("div");
  list.className = "engine-list";

  if (analyses.length === 0) {
    list.innerHTML = `<p class="empty-state">${escapeHtml(t("engine.empty"))}</p>`;
  } else {
    for (const analysis of analyses) {
      const node = engineTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector(".engine-name").textContent = analysis.engine || "engine";
      node.querySelector("h3").textContent = formatEngineTitle(analysis.title || analysis.summary || t("engine.analysisFallback"));
      node.querySelector(".engine-summary").textContent = formatSummaryText(
        analysis.summary || t("common.noSummary"),
        analysis.summaryKey || "",
        analysis.summaryParams || null
      );

      const status = node.querySelector(".engine-status");
      status.textContent = formatStatusLabel(analysis.status).toUpperCase();
      if (analysis.status !== "ok") {
        status.classList.add("muted");
      }

      const meta = node.querySelector(".engine-meta");
      const chainLabel = analysis.chainId
        ? formatChainLabel(
            analysis.chainId,
            analysis.chainId === audit.result.chainId ? audit.result.chainName : ""
          )
        : "";
      meta.innerHTML = [
        analysis.driver ? `<span class="chip">${escapeHtml(analysis.driver)}</span>` : "",
        analysis.mode ? `<span class="chip">${escapeHtml(analysis.mode)}</span>` : "",
        analysis.durationMs ? `<span class="chip">${escapeHtml(formatDuration(analysis.durationMs))}</span>` : "",
        typeof analysis.issueCount === "number" ? `<span class="chip">${escapeHtml(t("common.issueCount", { count: analysis.issueCount }))}</span>` : "",
        chainLabel ? `<span class="chip">${escapeHtml(chainLabel)}</span>` : ""
      ].filter(Boolean).join("");

      const issues = node.querySelector(".engine-issues");
      if (!analysis.issues?.length) {
        issues.innerHTML = `<p class="empty-state">${escapeHtml(t("engine.noIssues"))}</p>`;
      } else {
        issues.innerHTML = analysis.issues.map((issue) => `
          <article class="engine-issue">
            <div class="finding-head">
              <span class="badge">${escapeHtml(String(issue.severity || "info").toUpperCase())}</span>
              <h4>${escapeHtml(formatIssueTitle(issue.title))}</h4>
            </div>
            <p>${escapeHtml(issue.description || t("common.noDescription"))}</p>
            <div class="chip-row">
              ${renderIssueChips(issue)}
            </div>
          </article>
        `).join("");
      }

      list.appendChild(node);
    }
  }

  section.appendChild(list);
  container.appendChild(section);
}

function renderAiReportSection(container, audit) {
  const ai = audit.result?.ai || null;
  const section = document.createElement("section");
  section.className = "ai-section";
  section.innerHTML = `
    <div class="section-head">
      <h3>${escapeHtml(t("ai.title"))}</h3>
      <span class="panel-note">${escapeHtml(ai?.status || t("common.unknown"))}</span>
    </div>
  `;

  if (!ai || ai.status !== "ok") {
    const empty = document.createElement("div");
    empty.className = "ai-card";
    empty.innerHTML = `<p class="empty-state">${escapeHtml(ai?.summary || ai?.errorMessage || t("ai.empty"))}</p>`;
    section.appendChild(empty);
    container.appendChild(section);
    return;
  }

  const localizedAi = ai.translations?.[state.locale] || (state.locale === "en-US" ? ai.translations?.["en-US"] : null) || {};
  const finalReport = localizedAi.finalReport || ai.finalReport || {};
  const sourceAnalysis = ai.sourceAnalysis || {};
  const findings = Array.isArray(finalReport.findings) ? finalReport.findings : [];
  const suggestions = Array.isArray(finalReport.modificationSuggestions) ? finalReport.modificationSuggestions : [];

  const overview = document.createElement("div");
  overview.className = "ai-card";
  overview.innerHTML = `
    <div class="ai-meta chip-row">
      ${ai.model ? `<span class="chip">${escapeHtml(t("ai.model"))}: ${escapeHtml(ai.model)}</span>` : ""}
      ${ai.mode ? `<span class="chip">${escapeHtml(t("ai.mode"))}: ${escapeHtml(ai.mode)}</span>` : ""}
      ${ai.riskLevel ? `<span class="chip">${escapeHtml(t("ai.riskLevel"))}: ${escapeHtml(ai.riskLevel)}</span>` : ""}
      ${audit.result.cache?.status ? `<span class="chip">cache: ${escapeHtml(audit.result.cache.status)}</span>` : ""}
    </div>
    <h4>${escapeHtml(t("ai.summary"))}</h4>
    <p>${escapeHtml(finalReport.executiveSummary || sourceAnalysis.executiveSummary || ai.executiveSummary || t("common.noSummary"))}</p>
  `;
  section.appendChild(overview);

  if (findings.length > 0) {
    const findingCard = document.createElement("div");
    findingCard.className = "ai-card";
    findingCard.innerHTML = `
      <h4>${escapeHtml(t("ai.findings"))}</h4>
      <div class="ai-list">
        ${findings.map((finding) => `
          <article class="ai-list-item">
            <div class="finding-head">
              <span class="badge">${escapeHtml(String(finding.severity || "info").toUpperCase())}</span>
              <h5>${escapeHtml(finding.title || "Unnamed issue")}</h5>
            </div>
            <p><strong>Evidence:</strong> ${escapeHtml(finding.evidence || "-")}</p>
            <p><strong>Impact:</strong> ${escapeHtml(finding.impact || "-")}</p>
            <p><strong>Fix:</strong> ${escapeHtml(finding.recommendation || "-")}</p>
          </article>
        `).join("")}
      </div>
    `;
    section.appendChild(findingCard);
  }

  if (suggestions.length > 0) {
    const suggestionCard = document.createElement("div");
    suggestionCard.className = "ai-card";
    suggestionCard.innerHTML = `
      <h4>${escapeHtml(t("ai.suggestions"))}</h4>
      <div class="ai-list">
        ${suggestions.map((item) => `
          <article class="ai-list-item compact">
            <strong>${escapeHtml(String(item.priority || "").toUpperCase())} · ${escapeHtml(item.title || "")}</strong>
            <p>${escapeHtml(item.suggestion || "")}</p>
            ${item.rationale ? `<p class="panel-note">${escapeHtml(item.rationale)}</p>` : ""}
          </article>
        `).join("")}
      </div>
    `;
    section.appendChild(suggestionCard);
  }

  const reportMarkdown = localizedAi.reportMarkdown || finalReport.reportMarkdown || ai.reportMarkdown || "";
  if (reportMarkdown) {
    const report = document.createElement("details");
    report.className = "ai-card ai-report";
    report.open = true;
    report.innerHTML = `
      <summary>${escapeHtml(t("ai.markdown"))}</summary>
      <div class="markdown-body">${renderMarkdown(reportMarkdown)}</div>
    `;
    section.appendChild(report);
  }

  container.appendChild(section);
}

function renderSummaryGrid(audit) {
  const result = audit.result;
  const fields = [
    [t("result.summaryCard"), formatSummaryText(result.summary || audit.summary || "-", result.summaryCode || "", result.summaryParams || null)],
    [t("result.contractType"), result.contractType || "-"],
    [t("result.analysisMode"), formatAnalysisModeLabel(result.analysisMode || "-")],
    [t("result.chain"), renderChainSummary(result.chainId, result.chainName)],
    [t("result.sourceProvider"), result.sourceRepository || "bytecode-only"],
    [t("result.bytecode"), result.bytecodeSize ? `${result.bytecodeSize} bytes` : "-"],
    [t("result.contract"), result.contractName || "-"],
    [t("result.sourceAddress"), result.sourceAddress || result.address || "-"],
    [t("result.analysisTarget"), result.analysisAddress || result.address || "-"],
    [t("result.bytecodeAddress"), result.bytecodeAddress || result.analysisAddress || "-"]
  ];

  const summary = document.createElement("div");
  summary.className = "summary-grid";
  summary.innerHTML = fields.map(([label, value]) => `
    <div>
      <span>${escapeHtml(label)}</span>
      ${String(value).startsWith("<strong>") ? value : `<strong>${escapeHtml(value)}</strong>`}
    </div>
  `).join("");
  return summary;
}

function renderFindingsSection(container, audit) {
  const findings = Array.isArray(audit.result.findings) ? audit.result.findings : [];
  const securityFindings = findings.filter((item) => item.category !== "advisory");
  const advisoryFindings = findings.filter((item) => item.category === "advisory");
  const findingsSection = document.createElement("section");
  findingsSection.className = "findings-section";
  findingsSection.innerHTML = `
    <div class="section-head">
      <h3>${escapeHtml(t("result.detectedIssues"))}</h3>
      <span class="panel-note">${escapeHtml(t("result.detectedIssuesCount", { count: findings.length }))}</span>
    </div>
  `;

  if (findings.length === 0) {
    const findingsWrap = document.createElement("div");
    findingsWrap.className = "findings-wrap";
    findingsWrap.innerHTML = `<p class="empty-state">${escapeHtml(t("result.noFindings"))}</p>`;
    findingsSection.appendChild(findingsWrap);
    container.appendChild(findingsSection);
    return;
  }

  const renderFindingGroup = (titleKey, countKey, items, options = {}) => {
    if (!items.length) {
      return null;
    }

    const group = document.createElement("div");
    group.className = "findings-group";
    const findingsWrap = document.createElement("div");
    findingsWrap.className = "findings-wrap";

    for (const finding of items) {
      const node = findingTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector(".finding-rail .badge").textContent = String(finding.severity || "info").toUpperCase();
      node.querySelector("h3").textContent = formatIssueTitle(finding.title);
      const findingMeta = [
        t("common.sourceLabel", { engine: finding.engine || "engine" }),
        formatLocationLabel(finding)
      ].filter(Boolean).join(" · ");
      node.querySelector(".finding-source").textContent = findingMeta;
      node.querySelector(".finding-meta").innerHTML = renderFindingMetaChips(finding);
      node.querySelector(".finding-copy-block:first-child .finding-copy-label").textContent = t("common.whyShort");
      node.querySelector(".finding-copy-block:last-child .finding-copy-label").textContent = t("common.fixShort");
      node.querySelector(".finding-why").textContent = formatFindingGuidance(
        finding.rationale,
        finding.rationaleKey,
        "finding.generic.why"
      );
      node.querySelector(".finding-fix").textContent = formatFindingGuidance(
        finding.recommendation,
        finding.recommendationKey,
        "finding.generic.fix"
      );
      findingsWrap.appendChild(node);
    }

    if (options.collapsed) {
      const details = document.createElement("details");
      details.className = "findings-toggle";
      details.innerHTML = `
        <summary class="section-head">
          <span class="toggle-title-wrap">
            <h3>${escapeHtml(t(titleKey))}</h3>
            <span class="panel-note">${escapeHtml(t("result.advisoryCollapsed"))}</span>
          </span>
          <span class="panel-note">${escapeHtml(t(countKey, { count: items.length }))}</span>
        </summary>
      `;
      details.appendChild(findingsWrap);
      group.appendChild(details);
      return group;
    }

    group.innerHTML = `
      <div class="section-head">
        <h3>${escapeHtml(t(titleKey))}</h3>
        <span class="panel-note">${escapeHtml(t(countKey, { count: items.length }))}</span>
      </div>
    `;
    group.appendChild(findingsWrap);
    return group;
  };

  const securityGroup = renderFindingGroup("result.securityFindings", "result.securityFindingsCount", securityFindings);
  const advisoryGroup = renderFindingGroup("result.advisoryFindings", "result.advisoryFindingsCount", advisoryFindings, {
    collapsed: true
  });

  if (securityGroup) {
    findingsSection.appendChild(securityGroup);
  }
  if (advisoryGroup) {
    findingsSection.appendChild(advisoryGroup);
  }

  container.appendChild(findingsSection);
}

function renderSelectedAudit() {
  const audit = state.audits.find((item) => item.id === state.selectedAuditId);
  if (!audit) {
    resultMeta.textContent = t("result.selectAudit");
    resultView.className = "result-view empty-state";
    resultView.textContent = t("result.pendingEmpty");
    return;
  }

  resultMeta.textContent = `${audit.target} · ${formatDate(audit.createdAt, state.locale)} · ${formatStatusLabel(audit.status)}`;
  resultView.className = "result-view";
  resultView.innerHTML = "";

  if (!isTerminalStatus(audit.status)) {
    const isRunning = String(audit.status || "").toLowerCase() === "running";
    resultView.innerHTML = `
      <div class="loading-card">
        <div class="loading-visual" aria-hidden="true">
          <span class="loading-ring loading-ring-outer"></span>
          <span class="loading-ring loading-ring-inner"></span>
          <span class="loading-core">${escapeHtml(t("result.loadingPulse"))}</span>
        </div>
        <div class="loading-copy">
          <p class="eyebrow">${escapeHtml(formatStatusLabel(audit.status))}</p>
          <h3>${escapeHtml(t(isRunning ? "result.loadingTitleRunning" : "result.loadingTitleQueued"))}</h3>
          <p class="panel-note">${escapeHtml(t(isRunning ? "result.loadingCopyRunning" : "result.loadingCopyQueued"))}</p>
          <div class="loading-meta chip-row">
            <span class="chip">${escapeHtml(t("result.summary"))}: ${escapeHtml(formatSummaryText(audit.summary || "Queued for analysis."))}</span>
            <span class="chip">${escapeHtml(t("result.started"))}: ${escapeHtml(audit.startedAt ? formatDate(audit.startedAt, state.locale) : "-")}</span>
          </div>
          ${renderAuditProgress(audit.progress)}
        </div>
      </div>
    `;
    return;
  }

  if (audit.status !== "succeeded") {
    resultView.innerHTML = `
      <div class="proxy-box">
        <p><strong>${escapeHtml(t("result.status"))}</strong>: ${escapeHtml(formatStatusLabel(audit.status))}</p>
        <p><strong>${escapeHtml(t("result.summary"))}</strong>: ${escapeHtml(formatSummaryText(audit.summary || "Analysis failed."))}</p>
        <p><strong>${escapeHtml(t("result.error"))}</strong>: ${escapeHtml(audit.errorMessage || "-")}</p>
      </div>
    `;
    return;
  }

  resultView.appendChild(renderSummaryGrid(audit));
  renderAiReportSection(resultView, audit);

  if (audit.result.proxyAddress || audit.result.implementationAddress) {
    const proxy = document.createElement("div");
    proxy.className = "proxy-box";
    proxy.innerHTML = `
      <p><strong>${escapeHtml(t("result.proxy"))}</strong>: ${escapeHtml(audit.result.proxyAddress || "-")}</p>
      <p><strong>${escapeHtml(t("result.implementation"))}</strong>: ${escapeHtml(audit.result.implementationAddress || "-")}</p>
      <p><strong>${escapeHtml(t("result.detection"))}</strong>: ${escapeHtml(audit.result.proxyDetection || "explorer metadata")}</p>
    `;
    resultView.appendChild(proxy);
  }

  renderFindingsSection(resultView, audit);
  appendEngineResults(resultView, audit);

  const raw = document.createElement("details");
  raw.className = "raw-box";
  raw.innerHTML = `
    <summary>${escapeHtml(t("result.raw"))}</summary>
    <pre>${escapeHtml(JSON.stringify(audit, null, 2))}</pre>
  `;
  resultView.appendChild(raw);
}

async function loadAudits() {
  const payload = await api("/api/audits");
  state.audits = payload.audits || [];
  const selectedAudit = state.audits.find((audit) => audit.id === state.selectedAuditId);
  if (!selectedAudit && state.audits.length > 0) {
    state.selectedAuditId = state.audits[0].id;
  }
  renderAuditList();
  renderSelectedAudit();
  schedulePolling();
}

function setLocale(locale) {
  state.locale = TRANSLATIONS[locale] ? locale : DEFAULT_LOCALE;
  setStoredLocale(state.locale);
  applyTranslations();
  renderAuditList();
  renderSelectedAudit();
}

saveTokenButton.addEventListener("click", async () => {
  state.token = tokenInput.value.trim();
  setStoredToken(state.token);
  alert(t("common.saveSuccess"));
  await loadAudits().catch((error) => {
    alert(error.message);
  });
});

auditForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(auditForm);
  const body = {
    address: form.get("address") || auditAddressInput.value.trim()
  };
  const network = auditNetworkSelect.value.trim();
  const customChainId = auditChainIdInput.value.trim();
  const contractType = auditContractTypeSelect.value.trim();

  if (network === "custom") {
    if (!customChainId) {
      alert(t("common.inputChainId"));
      return;
    }
    body.chainId = Number(customChainId);
  } else if (network) {
    body.chainId = Number(network);
  }
  if (contractType) {
    body.contractType = contractType;
  }

  try {
    setSubmitState(true);
    const created = await api("/api/audits/address", {
      method: "POST",
      body: JSON.stringify(body)
    });
    state.audits.unshift(created);
    state.selectedAuditId = created.id;
    renderAuditList();
    renderSelectedAudit();
    schedulePolling();
  } catch (error) {
    alert(error.message);
  } finally {
    setSubmitState(false);
  }
});

refreshAuditsButton.addEventListener("click", () => loadAudits().catch((error) => alert(error.message)));

for (const button of localeButtons) {
  button.addEventListener("click", () => {
    setLocale(button.dataset.locale || DEFAULT_LOCALE);
  });
}

auditAddressInput.setAttribute("name", "address");
auditNetworkSelect.value = "";
auditNetworkSelect.addEventListener("change", syncChainIdField);
syncChainIdField();
applyTranslations();
setSubmitState(false);

async function bootstrap() {
  try {
    await loadAudits();
  } catch (error) {
    resultView.className = "result-view empty-state";
    resultView.textContent = t("result.loadingFailed", { message: error.message });
  }
}

bootstrap();
