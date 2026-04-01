import { api, formatDate, getStoredToken, setStoredToken } from "./client.js";

const state = {
  token: getStoredToken(),
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
  const idNote = chainId ? `<small class="value-note">Chain ID ${chainId}</small>` : "";
  return `<strong>${label}</strong>${idNote}`;
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

function renderAuditList() {
  if (state.audits.length === 0) {
    auditList.innerHTML = '<p class="empty-state">还没有历史记录。</p>';
    return;
  }

  auditList.innerHTML = "";
  for (const audit of state.audits) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `audit-card ${audit.id === state.selectedAuditId ? "active" : ""}`;
    button.innerHTML = `
      <span class="audit-target">${audit.target}</span>
      <span class="audit-sub">${formatDate(audit.createdAt)}</span>
      <span class="audit-sub">${audit.status || "unknown"}</span>
      <span class="audit-sub">${audit.summary || audit.result?.summary || "No summary"}</span>
    `;
    button.addEventListener("click", () => {
      state.selectedAuditId = audit.id;
      renderAuditList();
      renderSelectedAudit();
    });
    auditList.appendChild(button);
  }
}

function appendEngineResults(container, audit) {
  const analyses = Array.isArray(audit.result.externalAnalyses) ? audit.result.externalAnalyses : [];
  const section = document.createElement("section");
  section.className = "engine-section";
  section.innerHTML = `
    <div class="section-head">
      <h3>外部分析引擎</h3>
      <span class="panel-note">${analyses.length} 个结果</span>
    </div>
  `;

  const list = document.createElement("div");
  list.className = "engine-list";

  if (analyses.length === 0) {
    list.innerHTML = '<p class="empty-state">当前没有外部引擎结果，可能未配置 RPC 或未安装第三方引擎。</p>';
  } else {
    for (const analysis of analyses) {
      const node = engineTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector(".engine-name").textContent = analysis.engine || "engine";
      node.querySelector("h3").textContent = analysis.title || analysis.summary || "External analysis";
      node.querySelector(".engine-summary").textContent = analysis.summary || "No summary";

      const status = node.querySelector(".engine-status");
      status.textContent = (analysis.status || "unknown").toUpperCase();
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
        analysis.driver ? `<span class="chip">${analysis.driver}</span>` : "",
        analysis.mode ? `<span class="chip">${analysis.mode}</span>` : "",
        typeof analysis.issueCount === "number" ? `<span class="chip">${analysis.issueCount} issues</span>` : "",
        chainLabel ? `<span class="chip">${chainLabel}</span>` : ""
      ].filter(Boolean).join("");

      const issues = node.querySelector(".engine-issues");
      if (!analysis.issues?.length) {
        issues.innerHTML = '<p class="empty-state">该引擎没有返回可展示的 issue。</p>';
      } else {
        issues.innerHTML = analysis.issues.map((issue) => `
          <article class="engine-issue">
            <div class="finding-head">
              <span class="badge">${(issue.severity || "info").toUpperCase()}</span>
              <h4>${issue.title || "Unnamed issue"}</h4>
            </div>
            <p>${issue.description || "No description."}</p>
            <div class="chip-row">
              ${issue.swcId ? `<span class="chip">SWC ${issue.swcId}</span>` : ""}
              ${issue.functionName ? `<span class="chip">${issue.functionName}</span>` : ""}
              ${typeof issue.pc === "number" ? `<span class="chip">pc ${issue.pc}</span>` : ""}
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

function renderSelectedAudit() {
  const audit = state.audits.find((item) => item.id === state.selectedAuditId);
  if (!audit) {
    resultMeta.textContent = "选择一条审计记录后查看";
    resultView.className = "result-view empty-state";
    resultView.textContent = "还没有选中的审计结果。";
    return;
  }

  resultMeta.textContent = `${audit.target} · ${formatDate(audit.createdAt)} · ${audit.status}`;
  resultView.className = "result-view";
  resultView.innerHTML = "";

  if (!isTerminalStatus(audit.status)) {
    resultView.innerHTML = `
      <div class="proxy-box">
        <p><strong>Status</strong>: ${audit.status}</p>
        <p><strong>Summary</strong>: ${audit.summary || "Queued for analysis."}</p>
        <p><strong>Started</strong>: ${audit.startedAt || "-"}</p>
      </div>
    `;
    return;
  }

  if (audit.status !== "succeeded") {
    resultView.innerHTML = `
      <div class="proxy-box">
        <p><strong>Status</strong>: ${audit.status}</p>
        <p><strong>Summary</strong>: ${audit.summary || "Analysis failed."}</p>
        <p><strong>Error</strong>: ${audit.errorMessage || "-"}</p>
      </div>
    `;
    return;
  }

  const summary = document.createElement("div");
  summary.className = "summary-grid";
  summary.innerHTML = `
    <div><span>Summary</span><strong>${audit.result?.summary || audit.summary || "-"}</strong></div>
    <div><span>Contract Type</span><strong>${audit.result.contractType || "-"}</strong></div>
    <div><span>Analysis Mode</span><strong>${audit.result.analysisMode || "-"}</strong></div>
    <div><span>Chain</span>${renderChainSummary(audit.result.chainId, audit.result.chainName)}</div>
    <div><span>Source Provider</span><strong>${audit.result.sourceRepository || "bytecode-only"}</strong></div>
    <div><span>Bytecode</span><strong>${audit.result.bytecodeSize ? `${audit.result.bytecodeSize} bytes` : "-"}</strong></div>
    <div><span>Contract</span><strong>${audit.result.contractName || "-"}</strong></div>
    <div><span>Source Address</span><strong>${audit.result.sourceAddress || audit.result.address || "-"}</strong></div>
  `;
  resultView.appendChild(summary);

  if (audit.result.proxyAddress || audit.result.implementationAddress) {
    const proxy = document.createElement("div");
    proxy.className = "proxy-box";
    proxy.innerHTML = `
      <p><strong>Proxy</strong>: ${audit.result.proxyAddress || "-"}</p>
      <p><strong>Implementation</strong>: ${audit.result.implementationAddress || "-"}</p>
      <p><strong>Detection</strong>: ${audit.result.proxyDetection || "explorer metadata"}</p>
    `;
    resultView.appendChild(proxy);
  }

  const findingsSection = document.createElement("section");
  findingsSection.className = "findings-section";
  findingsSection.innerHTML = `
    <div class="section-head">
      <h3>规则扫描结果</h3>
      <span class="panel-note">${audit.result.findings?.length || 0} 个 findings</span>
    </div>
  `;

  const findingsWrap = document.createElement("div");
  findingsWrap.className = "findings-wrap";

  if (!audit.result.findings || audit.result.findings.length === 0) {
    findingsWrap.innerHTML = '<p class="empty-state">本次规则扫描没有命中 findings。</p>';
  } else {
    for (const finding of audit.result.findings) {
      const node = findingTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector(".badge").textContent = finding.severity.toUpperCase();
      node.querySelector("h3").textContent = finding.title;
      node.querySelector(".finding-why").textContent = `Why: ${finding.rationale}`;
      node.querySelector(".finding-fix").textContent = `Fix: ${finding.recommendation}`;
      findingsWrap.appendChild(node);
    }
  }

  findingsSection.appendChild(findingsWrap);
  resultView.appendChild(findingsSection);
  appendEngineResults(resultView, audit);

  const raw = document.createElement("details");
  raw.className = "raw-box";
  raw.innerHTML = `
    <summary>查看原始 JSON</summary>
    <pre>${JSON.stringify(audit, null, 2)}</pre>
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

saveTokenButton.addEventListener("click", async () => {
  state.token = tokenInput.value.trim();
  setStoredToken(state.token);
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
      alert("请输入自定义 Chain ID。");
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

auditAddressInput.setAttribute("name", "address");
auditNetworkSelect.addEventListener("change", syncChainIdField);
syncChainIdField();

async function bootstrap() {
  try {
    await loadAudits();
  } catch (error) {
    resultView.className = "result-view empty-state";
    resultView.textContent = `加载失败：${error.message}`;
  }
}

bootstrap();
