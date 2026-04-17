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
    "brand.copy": "基于 Slither / Mythril 的链上合约检测台。源码可得时优先走源码分析，代理合约会继续跟踪实现合约。",
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
    "hero.copy": "输入合约地址后，服务会自动尝试 Sourcify、Etherscan、Blockscout、RPC 代理解析，并在可用时接入 Slither 与 Mythril。",
    "hero.step1": "01 Source / Implementation",
    "hero.step2": "02 Slither",
    "hero.step3": "03 Mythril",
    "hero.note": "源码分析与字节码分析尽量对准同一实现合约；没有源码时仅保留字节码引擎。",
    "form.address": "合约地址",
    "form.network": "网络",
    "form.networkNote": "如果你只知道合约在哪条常见 EVM 链上，直接选择网络即可。",
    "form.protocol": "协议类型",
    "form.chainId": "自定义 Chain ID",
    "form.chainIdPlaceholder": "如 324 / 59144",
    "form.chainIdNote": "只有在网络列表里找不到目标链时，才需要填写这项。",
    "form.submit": "发起审计",
    "network.auto": "我不确定，自动识别",
    "network.custom": "自定义 Chain ID",
    "protocol.auto": "自动识别",
    "result.title": "结果详情",
    "result.metaEmpty": "选择一条审计记录后查看",
    "result.empty": "还没有选中的审计结果。",
    "result.loadingFailed": "加载失败：{message}",
    "result.pendingEmpty": "还没有选中的审计结果。",
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
    "result.noFindings": "当前配置下没有检测到可展示的问题。",
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
    "common.driver": "driver {driver}"
  },
  "en-US": {
    pageTitle: "Smart Contract Audit Console",
    "brand.eyebrow": "MCP Audit Console",
    "brand.title": "On-chain Audit Console",
    "brand.copy": "A contract analysis console backed by Slither and Mythril. Verified source is preferred, and proxy contracts follow their implementation target.",
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
    "hero.copy": "Enter a contract address and the service will try Sourcify, Etherscan, Blockscout, and RPC-based proxy resolution, then attach Slither and Mythril when available.",
    "hero.step1": "01 Source / Implementation",
    "hero.step2": "02 Slither",
    "hero.step3": "03 Mythril",
    "hero.note": "Source and bytecode analyzers are aligned to the same implementation target whenever possible. Without source, only bytecode engines remain.",
    "form.address": "Contract Address",
    "form.network": "Network",
    "form.networkNote": "If you only know the chain family, selecting the network name is enough.",
    "form.protocol": "Protocol Type",
    "form.chainId": "Custom Chain ID",
    "form.chainIdPlaceholder": "e.g. 324 / 59144",
    "form.chainIdNote": "Only fill this in when the chain is not listed above.",
    "form.submit": "Start Audit",
    "network.auto": "I am not sure, auto-detect",
    "network.custom": "Custom Chain ID",
    "protocol.auto": "Auto-detect",
    "result.title": "Result Details",
    "result.metaEmpty": "Select an audit run to inspect",
    "result.empty": "No audit result selected.",
    "result.loadingFailed": "Load failed: {message}",
    "result.pendingEmpty": "No audit result selected.",
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
    "result.noFindings": "No displayable issues were reported by the configured analyzers.",
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
    "common.driver": "driver {driver}"
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
      <span class="audit-sub">${escapeHtml(audit.status || t("common.unknown"))}</span>
      <span class="audit-sub">${escapeHtml(audit.summary || audit.result?.summary || t("common.noSummary"))}</span>
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
    typeof issue.pc === "number" ? `<span class="chip">pc ${issue.pc}</span>` : ""
  ].filter(Boolean).join("");
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
      node.querySelector("h3").textContent = analysis.title || analysis.summary || t("engine.analysisFallback");
      node.querySelector(".engine-summary").textContent = analysis.summary || t("common.noSummary");

      const status = node.querySelector(".engine-status");
      status.textContent = (analysis.status || t("common.unknown")).toUpperCase();
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
              <h4>${escapeHtml(issue.title || "Unnamed issue")}</h4>
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

function renderSummaryGrid(audit) {
  const result = audit.result;
  const fields = [
    [t("result.summaryCard"), result.summary || audit.summary || "-"],
    [t("result.contractType"), result.contractType || "-"],
    [t("result.analysisMode"), result.analysisMode || "-"],
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
  const findingsSection = document.createElement("section");
  findingsSection.className = "findings-section";
  findingsSection.innerHTML = `
    <div class="section-head">
      <h3>${escapeHtml(t("result.detectedIssues"))}</h3>
      <span class="panel-note">${escapeHtml(t("result.detectedIssuesCount", { count: findings.length }))}</span>
    </div>
  `;

  const findingsWrap = document.createElement("div");
  findingsWrap.className = "findings-wrap";

  if (findings.length === 0) {
    findingsWrap.innerHTML = `<p class="empty-state">${escapeHtml(t("result.noFindings"))}</p>`;
  } else {
    for (const finding of findings) {
      const node = findingTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector(".badge").textContent = String(finding.severity || "info").toUpperCase();
      node.querySelector("h3").textContent = finding.title || "Unnamed issue";
      node.querySelector(".finding-source").textContent = t("common.sourceLabel", { engine: finding.engine || "engine" });
      node.querySelector(".finding-why").textContent = t("common.why", { text: finding.rationale || t("common.noDescription") });
      node.querySelector(".finding-fix").textContent = t("common.fix", { text: finding.recommendation || "-" });
      findingsWrap.appendChild(node);
    }
  }

  findingsSection.appendChild(findingsWrap);
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

  resultMeta.textContent = `${audit.target} · ${formatDate(audit.createdAt, state.locale)} · ${audit.status}`;
  resultView.className = "result-view";
  resultView.innerHTML = "";

  if (!isTerminalStatus(audit.status)) {
    resultView.innerHTML = `
      <div class="proxy-box">
        <p><strong>${escapeHtml(t("result.status"))}</strong>: ${escapeHtml(audit.status)}</p>
        <p><strong>${escapeHtml(t("result.summary"))}</strong>: ${escapeHtml(audit.summary || "Queued for analysis.")}</p>
        <p><strong>${escapeHtml(t("result.started"))}</strong>: ${escapeHtml(audit.startedAt ? formatDate(audit.startedAt, state.locale) : "-")}</p>
      </div>
    `;
    return;
  }

  if (audit.status !== "succeeded") {
    resultView.innerHTML = `
      <div class="proxy-box">
        <p><strong>${escapeHtml(t("result.status"))}</strong>: ${escapeHtml(audit.status)}</p>
        <p><strong>${escapeHtml(t("result.summary"))}</strong>: ${escapeHtml(audit.summary || "Analysis failed.")}</p>
        <p><strong>${escapeHtml(t("result.error"))}</strong>: ${escapeHtml(audit.errorMessage || "-")}</p>
      </div>
    `;
    return;
  }

  resultView.appendChild(renderSummaryGrid(audit));

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

async function bootstrap() {
  try {
    await loadAudits();
  } catch (error) {
    resultView.className = "result-view empty-state";
    resultView.textContent = t("result.loadingFailed", { message: error.message });
  }
}

bootstrap();
