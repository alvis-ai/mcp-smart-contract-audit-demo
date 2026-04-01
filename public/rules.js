import { api, getStoredToken, setStoredToken } from "./client.js";

const state = {
  token: getStoredToken(),
  rules: [],
  editingRuleId: ""
};

const tokenInput = document.querySelector("#token-input");
const saveTokenButton = document.querySelector("#save-token");
const ruleList = document.querySelector("#rule-list");
const ruleEditor = document.querySelector("#rule-editor");
const ruleFilterInput = document.querySelector("#rule-filter");
const refreshRulesButton = document.querySelector("#refresh-rules");
const newRuleButton = document.querySelector("#new-rule");
const saveRuleButton = document.querySelector("#save-rule");
const deleteRuleButton = document.querySelector("#delete-rule");
const ruleCount = document.querySelector("#rule-count");
const ruleEnabledCount = document.querySelector("#rule-enabled-count");
const ruleCurrentLabel = document.querySelector("#rule-current-label");
const ruleFocusTitle = document.querySelector("#rule-focus-title");
const ruleFocusCopy = document.querySelector("#rule-focus-copy");
const ruleFocusMeta = document.querySelector("#rule-focus-meta");

tokenInput.value = state.token;

function defaultRuleTemplate() {
  return {
    enabled: true,
    severity: "medium",
    title: "New Rule",
    rationale: "Explain why this pattern matters.",
    recommendation: "Explain how the issue should be fixed.",
    contractTypes: [],
    allPatterns: [
      {
        type: "regex",
        value: "TODO",
        flags: ""
      }
    ],
    anyPatterns: [],
    nonePatterns: []
  };
}

function getFilteredRules() {
  const keyword = ruleFilterInput.value.trim().toLowerCase();
  if (!keyword) {
    return state.rules;
  }

  return state.rules.filter((rule) => {
    const haystacks = [
      rule.id,
      rule.title,
      rule.rationale,
      rule.recommendation,
      ...(rule.contractTypes || [])
    ];
    return haystacks.some((item) => String(item || "").toLowerCase().includes(keyword));
  });
}

function renderRuleFocus() {
  const activeRule = state.rules.find((rule) => rule.id === state.editingRuleId) || null;
  const enabledCount = state.rules.filter((rule) => rule.enabled).length;

  ruleCount.textContent = String(state.rules.length);
  ruleEnabledCount.textContent = String(enabledCount);

  if (!activeRule) {
    ruleCurrentLabel.textContent = "新建规则";
    ruleFocusTitle.textContent = "新建规则";
    ruleFocusCopy.textContent = "当前工作区是未保存草稿。创建后会写入共享规则存储，并立刻被前端与 MCP 共用。";
    ruleFocusMeta.innerHTML = [
      '<span class="chip">draft</span>',
      '<span class="chip">manual save required</span>'
    ].join("");
    return;
  }

  const matcherCount = activeRule.allPatterns.length + activeRule.anyPatterns.length + activeRule.nonePatterns.length;
  ruleCurrentLabel.textContent = activeRule.id;
  ruleFocusTitle.textContent = activeRule.title;
  ruleFocusCopy.textContent = activeRule.rationale;
  ruleFocusMeta.innerHTML = [
    `<span class="chip">${activeRule.enabled ? "enabled" : "disabled"}</span>`,
    `<span class="chip">${activeRule.severity}</span>`,
    `<span class="chip">${activeRule.contractTypes.join(", ") || "all contracts"}</span>`,
    `<span class="chip">${matcherCount} matchers</span>`
  ].join("");
}

function renderRuleList() {
  const visibleRules = getFilteredRules();
  renderRuleFocus();

  if (state.rules.length === 0) {
    ruleList.innerHTML = '<p class="empty-state">还没有规则。</p>';
    return;
  }

  if (visibleRules.length === 0) {
    ruleList.innerHTML = '<p class="empty-state">没有匹配当前筛选条件的规则。</p>';
    return;
  }

  ruleList.innerHTML = "";
  for (const rule of visibleRules) {
    const matcherCount = rule.allPatterns.length + rule.anyPatterns.length + rule.nonePatterns.length;
    const card = document.createElement("article");
    card.className = `rule-card ${rule.id === state.editingRuleId ? "active" : ""}`;
    card.innerHTML = `
      <div class="rule-card-header">
        <div>
          <p class="rule-id">${rule.id}</p>
          <h3>${rule.title}</h3>
        </div>
        <span class="badge ${rule.enabled ? "" : "muted"}">${rule.severity}</span>
      </div>
      <div class="rule-status">
        <span class="rule-status-dot ${rule.enabled ? "" : "off"}"></span>
        <span>${rule.enabled ? "Enabled" : "Disabled"}</span>
      </div>
      <p class="rule-copy">${rule.rationale}</p>
      <div class="rule-subline">
        <span class="chip">scope: ${rule.contractTypes.join(", ") || "all"}</span>
        <span class="chip">matchers: ${matcherCount}</span>
      </div>
      <div class="rule-patterns">
        <span class="pattern-chip">all ${rule.allPatterns.length}</span>
        <span class="pattern-chip">any ${rule.anyPatterns.length}</span>
        <span class="pattern-chip">none ${rule.nonePatterns.length}</span>
      </div>
      <div class="rule-buttons">
        <button type="button" class="button subtle edit-rule">打开</button>
        <button type="button" class="button subtle toggle-rule">${rule.enabled ? "停用" : "启用"}</button>
      </div>
    `;

    card.addEventListener("click", () => {
      state.editingRuleId = rule.id;
      ruleEditor.value = JSON.stringify(rule, null, 2);
      renderRuleList();
    });

    card.querySelector(".edit-rule").addEventListener("click", (event) => {
      event.stopPropagation();
      state.editingRuleId = rule.id;
      ruleEditor.value = JSON.stringify(rule, null, 2);
      renderRuleList();
    });

    card.querySelector(".toggle-rule").addEventListener("click", async (event) => {
      event.stopPropagation();
      await api(`/api/rules/${rule.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...rule,
          enabled: !rule.enabled
        })
      });
      await loadRules();
    });

    ruleList.appendChild(card);
  }
}

async function loadRules() {
  const payload = await api("/api/rules");
  state.rules = payload.rules || [];
  const selectedRule = state.rules.find((rule) => rule.id === state.editingRuleId);
  if (!selectedRule && state.rules.length > 0) {
    state.editingRuleId = state.rules[0].id;
  }

  const activeRule = state.rules.find((rule) => rule.id === state.editingRuleId);
  if (activeRule) {
    ruleEditor.value = JSON.stringify(activeRule, null, 2);
  } else if (state.rules.length === 0) {
    ruleEditor.value = JSON.stringify(defaultRuleTemplate(), null, 2);
  }
  renderRuleList();
}

saveTokenButton.addEventListener("click", async () => {
  state.token = tokenInput.value.trim();
  setStoredToken(state.token);
  await loadRules().catch((error) => {
    alert(error.message);
  });
});

saveRuleButton.addEventListener("click", async () => {
  try {
    const parsed = JSON.parse(ruleEditor.value);
    if (parsed.id) {
      await api(`/api/rules/${parsed.id}`, {
        method: "PUT",
        body: JSON.stringify(parsed)
      });
      state.editingRuleId = parsed.id;
    } else {
      const created = await api("/api/rules", {
        method: "POST",
        body: JSON.stringify(parsed)
      });
      state.editingRuleId = created.id;
    }
    await loadRules();
  } catch (error) {
    alert(error.message);
  }
});

deleteRuleButton.addEventListener("click", async () => {
  try {
    const parsed = JSON.parse(ruleEditor.value);
    if (!parsed.id) {
      ruleEditor.value = JSON.stringify(defaultRuleTemplate(), null, 2);
      return;
    }
    await api(`/api/rules/${parsed.id}`, { method: "DELETE" });
    state.editingRuleId = "";
    ruleEditor.value = JSON.stringify(defaultRuleTemplate(), null, 2);
    await loadRules();
  } catch (error) {
    alert(error.message);
  }
});

newRuleButton.addEventListener("click", () => {
  state.editingRuleId = "";
  ruleEditor.value = JSON.stringify(defaultRuleTemplate(), null, 2);
  renderRuleList();
});

refreshRulesButton.addEventListener("click", () => loadRules().catch((error) => alert(error.message)));
ruleFilterInput.addEventListener("input", () => renderRuleList());

async function bootstrap() {
  ruleEditor.value = JSON.stringify(defaultRuleTemplate(), null, 2);
  try {
    await loadRules();
  } catch (error) {
    ruleEditor.value = `加载失败：${error.message}`;
  }
}

bootstrap();
