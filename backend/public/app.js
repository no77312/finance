const app = document.querySelector("#app");
const sessionKey = "position-circle:pwa-session";

const state = {
  config: null,
  session: loadSession(),
  data: null,
  activeTab: "overview",
  activeGroupID: "",
  selectedMemberID: "",
  sheet: "",
  submitMode: "screenshot",
  editHoldingID: "",
  drafts: [],
  message: "",
  error: "",
  busy: false
};

init();

async function init() {
  bindEvents();
  registerServiceWorker();

  try {
    state.config = await api("/api/config", { auth: false });
  } catch {
    state.config = { googleClientID: "" };
  }

  if (state.session) {
    try {
      await refreshBootstrap();
    } catch {
      clearSession();
      state.error = "登录状态已失效，请重新登录。";
    }
  }

  render();
}

function bindEvents() {
  app.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) {
      return;
    }

    const action = target.dataset.action;
    const value = target.dataset.value ?? "";

    if (action === "sign-out") {
      clearSession();
      render();
      return;
    }

    if (action === "tab") {
      state.activeTab = value;
      state.sheet = "";
      render();
      return;
    }

    if (action === "sheet") {
      state.sheet = value;
      state.error = "";
      state.message = "";
      if (value === "submit") {
        state.editHoldingID = "";
        state.drafts = [];
        state.submitMode = "screenshot";
      }
      render();
      return;
    }

    if (action === "close-sheet") {
      closeSheet();
      return;
    }

    if (action === "submit-mode") {
      state.submitMode = value;
      state.error = "";
      state.message = "";
      render();
      return;
    }

    if (action === "select-member") {
      state.selectedMemberID = value;
      render();
      return;
    }

    if (action === "edit-holding") {
      state.editHoldingID = value;
      state.submitMode = "manual";
      state.sheet = "submit";
      state.error = "";
      state.message = "";
      render();
      return;
    }

    if (action === "delete-holding") {
      deleteHolding(value);
      return;
    }

    if (action === "import-drafts") {
      importDrafts();
      return;
    }
  });

  app.addEventListener("change", (event) => {
    if (event.target.matches("#groupSelect")) {
      state.activeGroupID = event.target.value;
      state.selectedMemberID = "";
      render();
    }
  });

  app.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    if (form.id === "createGroupForm") {
      createGroup(new FormData(form));
    }
    if (form.id === "joinGroupForm") {
      joinGroup(new FormData(form));
    }
    if (form.id === "holdingForm") {
      saveHolding(new FormData(form));
    }
    if (form.id === "screenshotForm") {
      parseScreenshot(new FormData(form), form);
    }
  });
}

async function handleGoogleCredential(response) {
  if (!response?.credential) {
    state.error = "没有收到 Google 登录凭证。";
    render();
    return;
  }

  await runBusy(async () => {
    const result = await api("/api/auth/google", {
      method: "POST",
      body: { credential: response.credential },
      auth: false
    });
    setSessionFromBootstrap(result);
    state.data = normalizeBootstrap(result);
    state.activeGroupID = result.groups?.[0]?.id ?? "";
    state.activeTab = "overview";
    state.message = "";
    state.error = "";
  });
}

function render() {
  if (!state.session) {
    renderLogin();
    return;
  }

  renderApp();
}

function renderLogin() {
  app.className = "app-shell";
  app.innerHTML = `
    <main class="login">
      <section class="login-card">
        <div class="brand-mark">持</div>
        <div>
          <h1 class="login-title">持仓圈</h1>
          <p class="login-copy">和小组成员共享持仓、查看成员组合、追踪每次提交后的变化。</p>
        </div>
        <div id="googleButton" class="google-slot"></div>
        ${state.config?.googleClientID ? "" : `<div class="config-warning">需要在 Render 环境变量里配置 GOOGLE_CLIENT_ID。</div>`}
        ${noticeHTML()}
      </section>
    </main>
  `;

  renderGoogleButton();
}

function renderApp() {
  const data = state.data ?? { groups: [], holdings: [], holdingEvents: [] };
  const groups = data.groups ?? [];
  const activeGroup = activeGroupFor(groups);
  const user = state.session.user ?? data.user;

  app.className = "app-shell";
  app.innerHTML = `
    ${topbarHTML(user, groups, activeGroup)}
    ${noticeHTML()}
    ${activeGroup ? mainContentHTML(activeGroup) : emptyWorkspaceHTML()}
    ${tabbarHTML()}
    ${sheetHTML(activeGroup)}
  `;
}

function topbarHTML(user, groups, activeGroup) {
  return `
    <header class="topbar">
      <div class="topbar-row">
        <div class="account">
          ${avatarHTML(user)}
          <div class="min-w-0">
            <div class="account-name">${escapeHTML(user?.displayName || "持仓圈用户")}</div>
            <div class="account-mail">${escapeHTML(user?.email || "Google 登录")}</div>
          </div>
        </div>
        <button class="text-button" type="button" data-action="sign-out">退出</button>
      </div>
      <div class="group-control">
        <select id="groupSelect" class="group-select" ${groups.length ? "" : "disabled"}>
          ${groups.map((group) => `<option value="${escapeAttr(group.id)}" ${group.id === activeGroup?.id ? "selected" : ""}>${escapeHTML(group.name)}</option>`).join("")}
        </select>
        <button class="icon-button" type="button" data-action="sheet" data-value="groups" aria-label="群组">＋</button>
      </div>
    </header>
  `;
}

function emptyWorkspaceHTML() {
  return `
    <main class="content single">
      <section class="section">
        <div class="empty">当前账号还没有加入任何群组。</div>
        ${groupFormsHTML()}
      </section>
    </main>
  `;
}

function mainContentHTML(group) {
  if (state.activeTab === "members") {
    return membersHTML(group);
  }

  if (state.activeTab === "mine") {
    return mineHTML(group);
  }

  return overviewHTML(group);
}

function overviewHTML(group) {
  const holdings = groupHoldings(group.id);
  const summary = visibleSummary(holdings);
  const exposures = exposureRows(holdings).slice(0, 8);
  const recent = holdings.slice().sort(byUpdatedAt).slice(0, 5);

  return `
    <main class="content">
      <section class="section">
        <div class="metric-grid grid">
          ${metricHTML("可见市值", money(summary.marketValue, summary.currency))}
          ${metricHTML("浮动盈亏", signedMoney(summary.pnl, summary.currency), summary.pnl)}
          ${metricHTML("持仓数", String(holdings.length))}
          ${metricHTML("成员数", String(group.members?.length ?? 0))}
        </div>
        <div class="section-header">
          <h2 class="section-title">共识标的</h2>
          <span class="subtle">${escapeHTML(group.inviteCode || "")}</span>
        </div>
        <div class="list">
          ${exposures.length ? exposures.map(exposureHTML).join("") : `<div class="empty">暂无可见持仓。</div>`}
        </div>
      </section>
      <section class="section">
        <div class="section-header">
          <h2 class="section-title">最近更新</h2>
          <button class="primary-button" type="button" data-action="sheet" data-value="submit">提交持仓</button>
        </div>
        <div class="list">
          ${recent.length ? recent.map((holding) => holdingHTML(holding, { compact: true })).join("") : `<div class="empty">还没有成员提交持仓。</div>`}
        </div>
      </section>
    </main>
  `;
}

function membersHTML(group) {
  const selectedID = state.selectedMemberID || group.members?.[0]?.id || "";
  state.selectedMemberID = selectedID;
  const selectedMember = group.members?.find((member) => member.id === selectedID);
  const holdings = groupHoldings(group.id).filter((holding) => holding.ownerID === selectedID);

  return `
    <main class="content">
      <section class="section">
        <div class="section-header">
          <h2 class="section-title">成员</h2>
          <span class="subtle">${group.members?.length ?? 0} 人</span>
        </div>
        <div class="list">
          ${(group.members ?? []).map((member) => memberButtonHTML(member, group.id, member.id === selectedID)).join("")}
        </div>
      </section>
      <section class="section">
        <div class="section-header">
          <h2 class="section-title">${escapeHTML(selectedMember?.displayName || "成员持仓")}</h2>
          <span class="subtle">${holdings.length} 项</span>
        </div>
        <div class="list">
          ${holdings.length ? holdings.map((holding) => holdingHTML(holding)).join("") : `<div class="empty">这个成员还没有提交持仓。</div>`}
        </div>
      </section>
    </main>
  `;
}

function mineHTML(group) {
  const mine = groupHoldings(group.id).filter((holding) => holding.ownerID === state.session.currentMemberID);
  const events = (state.data?.holdingEvents ?? [])
    .filter((event) => event.groupID === group.id && event.ownerID === state.session.currentMemberID)
    .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
    .slice(0, 12);

  return `
    <main class="content">
      <section class="section">
        <div class="section-header">
          <h2 class="section-title">我的持仓</h2>
          <button class="primary-button" type="button" data-action="sheet" data-value="submit">提交持仓</button>
        </div>
        <div class="list">
          ${mine.length ? mine.map((holding) => holdingHTML(holding, { editable: true })).join("") : `<div class="empty">你还没有在这个群组提交持仓。</div>`}
        </div>
      </section>
      <section class="section">
        <div class="section-header">
          <h2 class="section-title">变动记录</h2>
          <span class="subtle">最近 ${events.length} 条</span>
        </div>
        <div class="panel">
          <div class="timeline">
            ${events.length ? events.map(eventHTML).join("") : `<div class="empty">还没有提交记录。</div>`}
          </div>
        </div>
      </section>
    </main>
  `;
}

function sheetHTML(group) {
  if (!state.sheet) {
    return "";
  }

  if (state.sheet === "groups") {
    return `
      <div class="sheet">
        <section class="sheet-panel">
          <div class="sheet-header">
            <h2 class="sheet-title">群组</h2>
            <button class="icon-button" type="button" data-action="close-sheet" aria-label="关闭">×</button>
          </div>
          ${noticeHTML()}
          ${groupFormsHTML()}
        </section>
      </div>
    `;
  }

  if (state.sheet === "submit" && group) {
    return submitSheetHTML(group);
  }

  return "";
}

function groupFormsHTML() {
  return `
    <section class="form-panel">
      <h2 class="section-title">创建群组</h2>
      <form id="createGroupForm" class="form-grid">
        <div class="field">
          <label for="groupName">名称</label>
          <input id="groupName" name="name" autocomplete="off" required>
        </div>
        <div class="field">
          <label for="groupSubtitle">副标题</label>
          <input id="groupSubtitle" name="subtitle" autocomplete="off" value="共享持仓与观点">
        </div>
        <button class="primary-button" type="submit" ${state.busy ? "disabled" : ""}>创建</button>
      </form>
    </section>
    <section class="form-panel">
      <h2 class="section-title">加入群组</h2>
      <form id="joinGroupForm" class="form-grid">
        <div class="field">
          <label for="inviteCode">邀请码</label>
          <input id="inviteCode" name="inviteCode" autocomplete="off" autocapitalize="characters" required>
        </div>
        <button class="secondary-button" type="submit" ${state.busy ? "disabled" : ""}>加入</button>
      </form>
    </section>
  `;
}

function submitSheetHTML(group) {
  return `
    <div class="sheet">
      <section class="sheet-panel">
        <div class="sheet-header">
          <h2 class="sheet-title">${state.editHoldingID ? "编辑持仓" : "提交持仓"}</h2>
          <button class="icon-button" type="button" data-action="close-sheet" aria-label="关闭">×</button>
        </div>
        ${noticeHTML()}
        <div class="segmented">
          <button type="button" class="${state.submitMode === "manual" ? "active" : ""}" data-action="submit-mode" data-value="manual">手工输入</button>
          <button type="button" class="${state.submitMode === "screenshot" ? "active" : ""}" data-action="submit-mode" data-value="screenshot">截图导入</button>
        </div>
        ${state.submitMode === "manual" ? holdingFormHTML(group) : screenshotImportHTML()}
      </section>
    </div>
  `;
}

function holdingFormHTML(group) {
  const holding = state.editHoldingID ? groupHoldings(group.id).find((item) => item.id === state.editHoldingID) : null;
  return `
    <form id="holdingForm" class="form-grid">
      <div class="two-col form-grid">
        ${fieldHTML("symbol", "代码", holding?.symbol ?? "", "text", true)}
        ${fieldHTML("assetName", "名称", holding?.assetName ?? "", "text", false)}
      </div>
      <div class="two-col form-grid">
        ${selectHTML("market", "市场", holding?.market ?? "usStock", markets())}
        ${selectHTML("currency", "币种", holding?.currency ?? "USD", currencies())}
      </div>
      <div class="two-col form-grid">
        ${fieldHTML("quantity", "数量", holding?.quantity ?? "", "number", true)}
        ${fieldHTML("averageCost", "成本价", holding?.averageCost ?? "", "number", true)}
      </div>
      <div class="two-col form-grid">
        ${fieldHTML("lastPrice", "现价", holding?.lastPrice ?? "", "number", true)}
        ${selectHTML("visibility", "可见性", holding?.visibility ?? "full", visibilities())}
      </div>
      <div class="field">
        <label for="note">备注</label>
        <textarea id="note" name="note">${escapeHTML(holding?.note ?? "")}</textarea>
      </div>
      <button class="primary-button" type="submit" ${state.busy ? "disabled" : ""}>${holding ? "保存" : "提交"}</button>
    </form>
  `;
}

function screenshotImportHTML() {
  return `
    <form id="screenshotForm" class="form-grid">
      <div class="two-col form-grid">
        ${selectHTML("defaultVisibility", "默认可见性", "amountOnly", visibilities())}
        <div class="field">
          <label for="brokerHint">券商</label>
          <input id="brokerHint" name="brokerHint" value="富途">
        </div>
      </div>
      <label class="file-drop">
        <span class="subtle">选择持仓截图</span>
        <input name="image" type="file" accept="image/*" required>
      </label>
      <button class="primary-button" type="submit" ${state.busy ? "disabled" : ""}>解析截图</button>
    </form>
    ${draftsHTML()}
  `;
}

function draftsHTML() {
  if (!state.drafts.length) {
    return "";
  }

  return `
    <section class="section">
      <div class="section-header">
        <h3 class="section-title">解析结果</h3>
        <button class="secondary-button" type="button" data-action="import-drafts" ${state.busy ? "disabled" : ""}>全部导入</button>
      </div>
      <div class="draft-list">
        ${state.drafts.map((draft) => holdingDraftHTML(draft)).join("")}
      </div>
    </section>
  `;
}

function holdingHTML(holding, options = {}) {
  const owner = memberForHolding(holding);
  const showValues = canSeeValues(holding);
  const showCost = canSeeCost(holding);
  const marketValue = Number(holding.quantity) * Number(holding.lastPrice);
  const costBasis = Number(holding.quantity) * Number(holding.averageCost);
  const pnl = marketValue - costBasis;

  return `
    <article class="list-item">
      <div class="holding-row">
        <div class="min-w-0">
          <div class="holding-title">${escapeHTML(holding.assetName || holding.symbol)}</div>
          <div class="holding-meta">
            <span>${escapeHTML(holding.symbol)}</span>
            <span>${escapeHTML(labelForMarket(holding.market))}</span>
            <span>${escapeHTML(owner?.displayName || "")}</span>
            ${privacyPillHTML(holding)}
          </div>
        </div>
        <div class="value">
          ${showValues ? money(marketValue, holding.currency) : "仅标的"}
        </div>
      </div>
      <div class="row-meta">
        ${showValues ? `<span>数量 ${formatNumber(holding.quantity)}</span><span>现价 ${money(holding.lastPrice, holding.currency)}</span>` : ""}
        ${showCost ? `<span>成本 ${money(holding.averageCost, holding.currency)}</span><span class="${classForNumber(pnl)}">${signedMoney(pnl, holding.currency)}</span>` : ""}
        ${holding.priceDate ? `<span>收盘价 ${escapeHTML(holding.priceDate)}</span>` : ""}
      </div>
      ${options.editable ? `
        <div class="actions">
          <button class="secondary-button" type="button" data-action="edit-holding" data-value="${escapeAttr(holding.id)}">编辑</button>
          <button class="danger-button" type="button" data-action="delete-holding" data-value="${escapeAttr(holding.id)}">删除</button>
        </div>
      ` : ""}
    </article>
  `;
}

function holdingDraftHTML(draft) {
  const complete = draft.quantity !== null && draft.averageCost !== null && draft.lastPrice !== null;
  return `
    <article class="list-item">
      <div class="holding-row">
        <div class="min-w-0">
          <div class="holding-title">${escapeHTML(draft.assetName || draft.symbol)}</div>
          <div class="holding-meta">
            <span>${escapeHTML(draft.symbol)}</span>
            <span>${escapeHTML(labelForMarket(draft.market))}</span>
            <span>${escapeHTML(draft.currency)}</span>
            <span>${Math.round(Number(draft.confidence ?? 0) * 100)}%</span>
          </div>
        </div>
        <span class="pill ${complete ? "green" : "red"}">${complete ? "可导入" : "需核对"}</span>
      </div>
      <div class="row-meta">
        <span>数量 ${formatMaybe(draft.quantity)}</span>
        <span>成本 ${formatMaybe(draft.averageCost)}</span>
        <span>现价 ${formatMaybe(draft.lastPrice)}</span>
      </div>
    </article>
  `;
}

function memberButtonHTML(member, groupID, active) {
  const holdings = groupHoldings(groupID).filter((holding) => holding.ownerID === member.id);
  const summary = visibleSummary(holdings);
  return `
    <button class="list-item member-row ${active ? "active" : ""}" type="button" data-action="select-member" data-value="${escapeAttr(member.id)}">
      <div class="member-row">
        <div class="account">
          ${avatarHTML(member)}
          <div class="min-w-0">
            <div class="member-name">${escapeHTML(member.displayName)}</div>
            <div class="member-meta">${holdings.length} 项持仓</div>
          </div>
        </div>
        <div class="value">${summary.marketValue ? money(summary.marketValue, summary.currency) : "暂无"}</div>
      </div>
    </button>
  `;
}

function exposureHTML(exposure) {
  return `
    <article class="list-item">
      <div class="holding-row">
        <div class="min-w-0">
          <div class="holding-title">${escapeHTML(exposure.assetName || exposure.symbol)}</div>
          <div class="holding-meta">
            <span>${escapeHTML(exposure.symbol)}</span>
            <span>${exposure.holderCount} 人持有</span>
            <span>${escapeHTML(exposure.currency)}</span>
          </div>
        </div>
        <div class="value">${money(exposure.marketValue, exposure.currency)}</div>
      </div>
      <div class="row-meta">
        <span>数量 ${formatNumber(exposure.quantity)}</span>
        <span class="${classForNumber(exposure.pnl)}">${signedMoney(exposure.pnl, exposure.currency)}</span>
      </div>
    </article>
  `;
}

function eventHTML(event) {
  const typeLabel = {
    created: "新增",
    updated: "更新",
    deleted: "删除"
  }[event.type] ?? event.type;

  return `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div class="timeline-body">
        <div><strong>${escapeHTML(typeLabel)} ${escapeHTML(event.symbol)}</strong></div>
        <div class="row-meta">
          <span>${escapeHTML(event.assetName || event.symbol)}</span>
          <span>${formatDateTime(event.createdAt)}</span>
        </div>
        <div class="row-meta">
          <span>数量 ${formatNumber(event.quantity)}</span>
          <span>现价 ${money(event.lastPrice, event.currency)}</span>
        </div>
      </div>
    </div>
  `;
}

function tabbarHTML() {
  const tabs = [
    ["overview", "总览", icon("chart")],
    ["members", "成员", icon("users")],
    ["mine", "我的", icon("user")]
  ];

  return `
    <nav class="tabbar">
      ${tabs.map(([id, label, svg]) => `
        <button type="button" class="${state.activeTab === id ? "active" : ""}" data-action="tab" data-value="${id}" aria-label="${label}">
          ${svg}
          <span>${label}</span>
        </button>
      `).join("")}
    </nav>
  `;
}

async function createGroup(formData) {
  await runBusy(async () => {
    const result = await api("/api/groups", {
      method: "POST",
      body: {
        name: formData.get("name"),
        subtitle: formData.get("subtitle")
      }
    });
    await refreshBootstrap();
    state.activeGroupID = result.group.id;
    state.sheet = "";
    state.message = "群组已创建。";
  });
}

async function joinGroup(formData) {
  await runBusy(async () => {
    const result = await api("/api/groups/join", {
      method: "POST",
      body: { inviteCode: formData.get("inviteCode") }
    });
    await refreshBootstrap();
    state.activeGroupID = result.group.id;
    state.sheet = "";
    state.message = "已加入群组。";
  });
}

async function saveHolding(formData) {
  const group = activeGroupFor(state.data?.groups ?? []);
  if (!group) {
    return;
  }

  const payload = holdingPayloadFromForm(formData);
  const path = state.editHoldingID
    ? `/api/groups/${encodeURIComponent(group.id)}/holdings/${encodeURIComponent(state.editHoldingID)}`
    : `/api/groups/${encodeURIComponent(group.id)}/holdings`;

  await runBusy(async () => {
    await api(path, {
      method: state.editHoldingID ? "PUT" : "POST",
      body: payload
    });
    await refreshBootstrap();
    state.sheet = "";
    state.editHoldingID = "";
    state.message = "持仓已保存。";
  });
}

async function deleteHolding(holdingID) {
  const group = activeGroupFor(state.data?.groups ?? []);
  if (!group || !window.confirm("确认删除这条持仓？")) {
    return;
  }

  await runBusy(async () => {
    await api(`/api/groups/${encodeURIComponent(group.id)}/holdings/${encodeURIComponent(holdingID)}`, {
      method: "DELETE"
    });
    await refreshBootstrap();
    state.message = "持仓已删除。";
  });
}

async function parseScreenshot(formData, form) {
  const file = form.elements.image.files?.[0];
  if (!file) {
    state.error = "请选择截图。";
    render();
    return;
  }

  await runBusy(async () => {
    const imageDataURL = await imageFileToDataURL(file);
    const result = await api("/api/imports/parse-screenshot", {
      method: "POST",
      body: {
        imageDataURL,
        defaultVisibility: formData.get("defaultVisibility"),
        brokerHint: formData.get("brokerHint"),
        locale: navigator.language || "zh-Hans"
      }
    });
    state.drafts = result.holdings ?? [];
    state.message = result.warnings?.[0] || `识别到 ${state.drafts.length} 条持仓。`;
  });
}

async function importDrafts() {
  const group = activeGroupFor(state.data?.groups ?? []);
  if (!group) {
    return;
  }

  const importable = state.drafts.filter((draft) => (
    draft.symbol && draft.quantity !== null && draft.averageCost !== null && draft.lastPrice !== null
  ));

  if (!importable.length) {
    state.error = "没有完整的草稿可以导入。";
    render();
    return;
  }

  await runBusy(async () => {
    for (const draft of importable) {
      await api(`/api/groups/${encodeURIComponent(group.id)}/holdings`, {
        method: "POST",
        body: {
          symbol: draft.symbol,
          assetName: draft.assetName || draft.symbol,
          market: draft.market || "usStock",
          quantity: draft.quantity,
          averageCost: draft.averageCost,
          lastPrice: draft.lastPrice,
          currency: draft.currency || "USD",
          visibility: draft.visibility || "amountOnly",
          note: draft.note || "截图导入"
        }
      });
    }
    await refreshBootstrap();
    state.sheet = "";
    state.drafts = [];
    state.message = `已导入 ${importable.length} 条持仓。`;
  });
}

async function refreshBootstrap() {
  const data = await api("/api/bootstrap");
  state.data = normalizeBootstrap(data);
  const groups = state.data.groups ?? [];
  if (!groups.some((group) => group.id === state.activeGroupID)) {
    state.activeGroupID = groups[0]?.id ?? "";
  }
}

async function runBusy(task) {
  state.busy = true;
  state.error = "";
  render();
  try {
    await task();
  } catch (error) {
    state.error = error.message || "操作失败。";
  } finally {
    state.busy = false;
    render();
  }
}

async function api(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.headers ?? {})
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.auth !== false && state.session) {
    headers["X-Member-ID"] = state.session.currentMemberID;
    headers["X-Session-Token"] = state.session.sessionToken;
  }

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `请求失败：${response.status}`);
  }
  return payload;
}

function setSessionFromBootstrap(payload) {
  state.session = {
    currentMemberID: payload.currentMemberID,
    sessionToken: payload.sessionToken,
    user: payload.user
  };
  localStorage.setItem(sessionKey, JSON.stringify(state.session));
}

function loadSession() {
  try {
    const raw = localStorage.getItem(sessionKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(sessionKey);
  state.session = null;
  state.data = null;
  state.activeGroupID = "";
  state.selectedMemberID = "";
  state.sheet = "";
}

function normalizeBootstrap(data) {
  if (data?.user && state.session) {
    state.session.user = data.user;
    localStorage.setItem(sessionKey, JSON.stringify(state.session));
  }
  return {
    user: data?.user ?? state.session?.user ?? null,
    groups: data?.groups ?? [],
    holdings: data?.holdings ?? [],
    holdingEvents: data?.holdingEvents ?? []
  };
}

function closeSheet() {
  state.sheet = "";
  state.editHoldingID = "";
  state.drafts = [];
  state.error = "";
  state.message = "";
  render();
}

function activeGroupFor(groups) {
  return groups.find((group) => group.id === state.activeGroupID) ?? groups[0] ?? null;
}

function groupHoldings(groupID) {
  return (state.data?.holdings ?? [])
    .filter((holding) => holding.groupID === groupID)
    .sort(byUpdatedAt);
}

function byUpdatedAt(first, second) {
  return new Date(second.updatedAt ?? 0) - new Date(first.updatedAt ?? 0);
}

function visibleSummary(holdings) {
  let currency = "USD";
  let marketValue = 0;
  let costBasis = 0;

  for (const holding of holdings) {
    if (!canSeeValues(holding)) {
      continue;
    }
    currency = holding.currency || currency;
    marketValue += Number(holding.quantity) * Number(holding.lastPrice);
    if (canSeeCost(holding)) {
      costBasis += Number(holding.quantity) * Number(holding.averageCost);
    }
  }

  return {
    currency,
    marketValue,
    pnl: costBasis ? marketValue - costBasis : 0
  };
}

function exposureRows(holdings) {
  const grouped = new Map();
  for (const holding of holdings) {
    if (!canSeeValues(holding)) {
      continue;
    }
    const key = `${holding.symbol}|${holding.currency}`;
    const existing = grouped.get(key) ?? {
      symbol: holding.symbol,
      assetName: holding.assetName,
      currency: holding.currency,
      quantity: 0,
      marketValue: 0,
      costBasis: 0,
      holderIDs: new Set()
    };
    existing.quantity += Number(holding.quantity);
    existing.marketValue += Number(holding.quantity) * Number(holding.lastPrice);
    if (canSeeCost(holding)) {
      existing.costBasis += Number(holding.quantity) * Number(holding.averageCost);
    }
    existing.holderIDs.add(holding.ownerID);
    grouped.set(key, existing);
  }

  return Array.from(grouped.values())
    .map((item) => ({
      ...item,
      holderCount: item.holderIDs.size,
      pnl: item.costBasis ? item.marketValue - item.costBasis : 0
    }))
    .sort((first, second) => second.marketValue - first.marketValue);
}

function canSeeValues(holding) {
  return isMine(holding) || holding.visibility !== "symbolOnly";
}

function canSeeCost(holding) {
  return isMine(holding) || holding.visibility === "full";
}

function isMine(holding) {
  return holding.ownerID === state.session?.currentMemberID;
}

function memberForHolding(holding) {
  return (state.data?.groups ?? [])
    .flatMap((group) => group.members ?? [])
    .find((member) => member.id === holding.ownerID);
}

function holdingPayloadFromForm(formData) {
  return {
    symbol: formData.get("symbol"),
    assetName: formData.get("assetName"),
    market: formData.get("market"),
    quantity: Number(formData.get("quantity")),
    averageCost: Number(formData.get("averageCost")),
    lastPrice: Number(formData.get("lastPrice")),
    currency: formData.get("currency"),
    visibility: formData.get("visibility"),
    note: formData.get("note")
  };
}

async function imageFileToDataURL(file) {
  const source = await fileToImage(file);
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderGoogleButton() {
  const slot = document.querySelector("#googleButton");
  const clientID = state.config?.googleClientID;
  if (!slot || !clientID) {
    return;
  }

  waitForGoogle()
    .then((google) => {
      slot.innerHTML = "";
      google.accounts.id.initialize({
        client_id: clientID,
        callback: handleGoogleCredential,
        ux_mode: "popup"
      });
      google.accounts.id.renderButton(slot, {
        type: "standard",
        theme: "outline",
        size: "large",
        shape: "rectangular",
        text: "continue_with",
        width: Math.min(360, slot.getBoundingClientRect().width || 320)
      });
    })
    .catch(() => {
      slot.innerHTML = `<div class="error">Google 登录组件加载失败。</div>`;
    });
}

function waitForGoogle() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (window.google?.accounts?.id) {
        clearInterval(timer);
        resolve(window.google);
      }
      if (attempts > 80) {
        clearInterval(timer);
        reject(new Error("Google script timeout"));
      }
    }, 100);
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

function noticeHTML() {
  return [
    state.error ? `<div class="error">${escapeHTML(state.error)}</div>` : "",
    state.message ? `<div class="notice">${escapeHTML(state.message)}</div>` : ""
  ].join("");
}

function metricHTML(label, value, numericValue = null) {
  const numberClass = numericValue === null ? "" : classForNumber(numericValue);
  return `
    <div class="metric">
      <div class="metric-label">${escapeHTML(label)}</div>
      <div class="metric-value ${numberClass}">${escapeHTML(value)}</div>
    </div>
  `;
}

function fieldHTML(name, label, value, type = "text", required = false) {
  const inputMode = type === "number" ? "decimal" : "text";
  const step = type === "number" ? ` step="any"` : "";
  return `
    <div class="field">
      <label for="${escapeAttr(name)}">${escapeHTML(label)}</label>
      <input id="${escapeAttr(name)}" name="${escapeAttr(name)}" type="${type}" inputmode="${inputMode}" value="${escapeAttr(value)}"${step} ${required ? "required" : ""}>
    </div>
  `;
}

function selectHTML(name, label, selected, options) {
  return `
    <div class="field">
      <label for="${escapeAttr(name)}">${escapeHTML(label)}</label>
      <select id="${escapeAttr(name)}" name="${escapeAttr(name)}">
        ${options.map(([value, text]) => `<option value="${escapeAttr(value)}" ${value === selected ? "selected" : ""}>${escapeHTML(text)}</option>`).join("")}
      </select>
    </div>
  `;
}

function markets() {
  return [
    ["usStock", "美股"],
    ["hkStock", "港股"],
    ["cnStock", "A 股"],
    ["fund", "基金/ETF"],
    ["crypto", "加密资产"],
    ["cash", "现金"]
  ];
}

function currencies() {
  return [["USD", "USD"], ["HKD", "HKD"], ["CNY", "CNY"], ["SGD", "SGD"]];
}

function visibilities() {
  return [["full", "完整可见"], ["amountOnly", "隐藏成本"], ["symbolOnly", "仅标的"]];
}

function labelForMarket(value) {
  return Object.fromEntries(markets())[value] ?? value ?? "";
}

function privacyPillHTML(holding) {
  const label = Object.fromEntries(visibilities())[holding.visibility] ?? "完整可见";
  const color = holding.visibility === "full" ? "green" : holding.visibility === "amountOnly" ? "blue" : "";
  return `<span class="pill ${color}">${escapeHTML(label)}</span>`;
}

function avatarHTML(user) {
  const pictureURL = user?.pictureURL || user?.picture;
  const name = user?.displayName || "持仓圈用户";
  if (pictureURL) {
    return `<div class="avatar"><img src="${escapeAttr(pictureURL)}" alt=""></div>`;
  }
  return `<div class="avatar">${escapeHTML(name.trim().slice(0, 1) || "持")}</div>`;
}

function icon(name) {
  const paths = {
    chart: `<path d="M4 18h16M7 15V9m5 6V5m5 10v-4" />`,
    users: `<path d="M8 19a4 4 0 0 1 8 0M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 2a3 3 0 0 1 3 3M16 5a3 3 0 0 1 0 6" />`,
    user: `<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" />`
  };
  return `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

function money(value, currency = "USD") {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "-";
  }
  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency,
      maximumFractionDigits: number >= 100 ? 0 : 2
    }).format(number);
  } catch {
    return `${formatNumber(number)} ${currency}`;
  }
}

function signedMoney(value, currency = "USD") {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "-";
  }
  const formatted = money(Math.abs(number), currency);
  if (number > 0) {
    return `+${formatted}`;
  }
  if (number < 0) {
    return `-${formatted}`;
  }
  return formatted;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "-";
  }
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(number);
}

function formatMaybe(value) {
  return value === null || value === undefined ? "待确认" : formatNumber(value);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function classForNumber(value) {
  const number = Number(value);
  if (number > 0) {
    return "positive";
  }
  if (number < 0) {
    return "negative";
  }
  return "";
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHTML(value);
}

window.positionCircleGoogleCallback = handleGoogleCredential;
