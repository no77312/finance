const app = document.querySelector("#app");
const sessionKey = "position-circle:pwa-session";
const fxRatesToUSD = {
  USD: 1,
  HKD: 0.1282,
  CNY: 0.1392,
  SGD: 0.7421
};

let noticeTimer = 0;

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
  draftMeta: null,
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
      armNoticeDismiss();
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
      clearNotice();
      clearSession();
      render();
      return;
    }

    if (action === "tab") {
      state.activeTab = value;
      state.sheet = "";
      clearNotice();
      render();
      return;
    }

    if (action === "sheet") {
      state.sheet = value;
      clearNotice();
      if (value === "submit") {
        state.editHoldingID = "";
        state.drafts = [];
        state.draftMeta = null;
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
      clearNotice();
      render();
      return;
    }

    if (action === "select-group") {
      state.activeGroupID = value;
      state.selectedMemberID = "";
      state.sheet = "";
      clearNotice();
      render();
      return;
    }

    if (action === "copy-invite") {
      copyInviteCode(value);
      return;
    }

    if (action === "select-member") {
      state.selectedMemberID = value;
      render();
      return;
    }

    if (action === "open-member") {
      state.activeTab = "members";
      state.selectedMemberID = value;
      state.sheet = "";
      clearNotice();
      render();
      return;
    }

    if (action === "edit-holding") {
      state.editHoldingID = value;
      state.submitMode = "manual";
      state.sheet = "submit";
      clearNotice();
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
    setNotice("error", "没有收到 Google 登录凭证。");
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
    clearNotice();
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
      </section>
      ${toastHTML()}
    </main>
  `;

  renderGoogleButton();
}

function renderApp() {
  const data = state.data ?? { groups: [], holdings: [], holdingEvents: [], portfolioSnapshots: [] };
  const groups = data.groups ?? [];
  const activeGroup = activeGroupFor(groups);

  app.className = "app-shell";
  app.innerHTML = `
    ${topbarHTML(activeGroup)}
    ${activeGroup ? mainContentHTML(activeGroup) : emptyWorkspaceHTML()}
    ${tabbarHTML()}
    ${sheetHTML(activeGroup)}
    ${toastHTML()}
  `;
}

function topbarHTML(activeGroup) {
  const tabLabel = {
    overview: "总览",
    members: "成员",
    mine: "我的"
  }[state.activeTab] ?? "持仓圈";

  return `
    <header class="topbar">
      <div class="topbar-row">
        <div class="topbar-copy min-w-0">
          <div class="topbar-label">${escapeHTML(tabLabel)}</div>
          <div class="topbar-heading">${escapeHTML(activeGroup?.name || "持仓圈")}</div>
        </div>
        <button class="secondary-button compact-button topbar-menu-button" type="button" data-action="sheet" data-value="groups">群组</button>
      </div>
      <div class="topbar-subtle">${escapeHTML(activeGroup?.subtitle || "创建或加入一个群组开始共享持仓。")}</div>
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
  const consensusExposures = exposureRows(holdings)
    .filter((exposure) => exposure.holderCount > 1);
  const exposures = consensusExposures.slice(0, 8);
  const snapshots = recentSnapshotSummaries(group.id).slice(0, 6);

  return `
    <main class="content overview-layout">
      <section class="section">
        ${overviewDashboardHTML(group, holdings, consensusExposures)}
        <div class="section-header">
          <div class="section-header-copy">
            <h2 class="section-title">共识标的</h2>
            <div class="subtle">只展示 2 位及以上成员同时持有的标的</div>
          </div>
          <span class="subtle">${exposures.length} 项</span>
        </div>
        <div class="list">
          ${exposures.length ? exposures.map(exposureHTML).join("") : `<div class="empty">目前还没有多人同时持有的公开标的。</div>`}
        </div>
      </section>
      ${overviewMembersSectionHTML(group)}
      <section class="section section-wide">
        <div class="section-header">
          <div class="section-header-copy">
            <h2 class="section-title">最近更新</h2>
            <div class="subtle">按每次提交展示仓位占比变化</div>
          </div>
          <button class="primary-button" type="button" data-action="sheet" data-value="submit">提交持仓</button>
        </div>
        <div class="list">
          ${snapshots.length ? snapshots.map(snapshotUpdateHTML).join("") : `<div class="empty">还没有成员提交持仓。</div>`}
        </div>
      </section>
    </main>
  `;
}

function membersHTML(group) {
  const selectedID = state.selectedMemberID || group.members?.[0]?.id || "";
  state.selectedMemberID = selectedID;
  const selectedMember = group.members?.find((member) => member.id === selectedID);

  return `
    <main class="content member-layout">
      <section class="section">
        <div class="section-header">
          <div class="section-header-copy">
            <h2 class="section-title">成员</h2>
            <div class="subtle">快速比较每个人的组合结构</div>
          </div>
          <span class="subtle">${group.members?.length ?? 0} 人</span>
        </div>
        <div class="list">
          ${(group.members ?? []).map((member) => memberButtonHTML(member, group.id, member.id === selectedID)).join("")}
        </div>
      </section>
      ${portfolioSectionHTML(group, selectedID, {
        title: selectedMember?.displayName || "成员持仓",
        owner: selectedMember
      })}
    </main>
  `;
}

function mineHTML(group) {
  const user = state.session.user ?? state.data?.user;
  const events = (state.data?.holdingEvents ?? [])
    .filter((event) => event.groupID === group.id && event.ownerID === state.session.currentMemberID)
    .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
    .slice(0, 12);

  return `
    <main class="content">
      ${myProfileHTML(user, group)}
      ${portfolioSectionHTML(group, state.session.currentMemberID, {
        title: "我的持仓",
        editable: true,
        actionLabel: "提交持仓"
      })}
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

function myProfileHTML(user, group) {
  const groupCount = state.data?.groups?.length ?? 0;
  return `
    <section class="section section-wide">
      <div class="panel profile-card">
        <div class="profile-card-head">
          <div class="account">
            ${avatarHTML(user)}
            <div class="min-w-0">
              <div class="account-name">${escapeHTML(user?.displayName || "持仓圈用户")}</div>
              <div class="account-mail">${escapeHTML(user?.email || "Google 登录")}</div>
            </div>
          </div>
          <button class="text-button compact-button" type="button" data-action="sign-out">退出</button>
        </div>
        <div class="profile-meta-row">
          <span>当前群组 ${escapeHTML(group.name)}</span>
          <span>已加入 ${groupCount} 个群组</span>
        </div>
      </div>
    </section>
  `;
}

function overviewDashboardHTML(group, holdings, consensusExposures) {
  const summary = visibleSummary(holdings);
  const members = group.members ?? [];
  const contributingIDs = new Set(holdings.map((holding) => holding.ownerID));
  const visibleHoldings = holdings.filter((holding) => canSeeValues(holding));
  const latestSnapshotAt = groupLatestSnapshotAt(group.id);
  const signals = groupSignalRows(group, holdings, consensusExposures);
  const marketRows = groupMarketRows(visibleHoldings).slice(0, 4);

  return `
    <div class="panel group-overview-panel">
      <div class="overview-heading compact">
        <div class="min-w-0">
          <div class="topbar-label">群组概况</div>
          <h2 class="section-title">${escapeHTML(group.name)}</h2>
          <div class="subtle">${escapeHTML(group.subtitle || "共享持仓与观点")}</div>
        </div>
        ${group.inviteCode
          ? `<button class="pill blue pill-button invite-button" type="button" data-action="copy-invite" data-value="${escapeAttr(group.inviteCode)}">邀请码 <strong>${escapeHTML(group.inviteCode)}</strong></button>`
          : ""}
      </div>
      <div class="overview-kpi-row">
        ${overviewKPIHTML("已提交", `${contributingIDs.size}/${members.length || 0}`)}
        ${overviewKPIHTML("可见市值", money(summary.marketValue, "USD"))}
        ${overviewKPIHTML("共识标的", `${consensusExposures.length}`)}
        ${overviewKPIHTML("最近更新", latestSnapshotAt ? formatDateTime(latestSnapshotAt) : "等待提交")}
      </div>
      <div class="overview-signal-list">
        ${signals.map(signalRowHTML).join("")}
      </div>
      <div class="overview-market-row">
        <span class="overview-market-label">市场分布</span>
        <div class="overview-market-chips">
          ${marketRows.length
            ? marketRows.map((row, index) => `<span class="legend-chip tone-${index % 6}"><strong>${escapeHTML(row.label)}</strong><span>${escapeHTML(formatPercent(row.weight))}</span></span>`).join("")
            : `<span class="legend-chip">暂无可见仓位</span>`}
        </div>
      </div>
    </div>
  `;
}

function overviewKPIHTML(label, value) {
  return `
    <div class="overview-kpi">
      <span>${escapeHTML(label)}</span>
      <strong>${escapeHTML(value)}</strong>
    </div>
  `;
}

function groupSignalRows(group, holdings, consensusExposures) {
  const visibleHoldings = holdings.filter((holding) => canSeeValues(holding));
  const allVisibleExposures = exposureRows(holdings);
  const consensusValue = consensusExposures.reduce((sum, exposure) => sum + exposure.marketValue, 0);
  const totalVisibleValue = visibleHoldings.reduce((sum, holding) => sum + holdingMarketValueUSD(holding), 0);
  const consensusStrength = totalVisibleValue > 0 ? consensusValue / totalVisibleValue : 0;
  const consensusMembers = membersForExposure(consensusExposures[0]?.holderIDs ?? []);
  const topSymbols = allVisibleExposures.slice(0, 6).map((exposure) => ({
    symbol: exposure.symbol,
    weight: totalVisibleValue > 0 ? exposure.marketValue / totalVisibleValue : 0
  }));
  const top3Weight = allVisibleExposures
    .slice(0, 3)
    .reduce((sum, exposure) => sum + (totalVisibleValue > 0 ? exposure.marketValue / totalVisibleValue : 0), 0);
  const activeMembers = membersWithRecentSnapshots(group.id, 24);

  return [
    {
      label: "共识强度",
      value: formatPercent(consensusStrength),
      detail: consensusExposures.length ? `${consensusExposures.length} 个多人持有标的` : "等待形成共同持仓",
      progress: consensusStrength,
      avatars: consensusMembers
    },
    {
      label: "集中度 Top3",
      value: formatPercent(top3Weight),
      detail: topSymbols.slice(0, 3).map((item) => item.symbol).join(" / ") || "暂无可见仓位",
      segments: topSymbols
    },
    {
      label: "活跃度",
      value: activeMembers.length ? `${activeMembers.length} 人` : "暂无",
      detail: activeMembers.length ? "最近 24 小时有提交" : "最近 24 小时暂无提交",
      dots: Math.min(Math.max(activeMembers.length, 0), 5),
      avatars: activeMembers
    }
  ];
}

function signalRowHTML(signal) {
  return `
    <div class="overview-signal-row">
      <div class="overview-signal-copy min-w-0">
        <div class="overview-signal-label">${escapeHTML(signal.label)}</div>
        <div class="overview-signal-detail">${escapeHTML(signal.detail)}</div>
      </div>
      <div class="overview-signal-visual">
        <div class="overview-signal-value">${escapeHTML(signal.value)}</div>
        ${signal.segments ? miniAllocationHTML(signal.segments, "overview-signal-strip") : signal.dots !== undefined ? activityDotsHTML(signal.dots) : compactProgressHTML(signal.progress)}
        ${signal.avatars?.length ? avatarStackHTML(signal.avatars, 4) : ""}
      </div>
    </div>
  `;
}

function activityDotsHTML(activeCount) {
  return `
    <div class="activity-dots" aria-hidden="true">
      ${Array.from({ length: 5 }, (_, index) => `<span class="${index < activeCount ? "active" : ""}"></span>`).join("")}
    </div>
  `;
}

function compactProgressHTML(value = 0) {
  const width = Math.max(0, Math.min(Number(value) || 0, 1)) * 100;
  return `
    <div class="compact-progress" aria-hidden="true">
      <div class="compact-progress-fill" style="width: ${width}%;"></div>
    </div>
  `;
}

function membersForExposure(memberIDs) {
  return memberIDs
    .map((memberID) => memberForID(memberID))
    .filter(Boolean);
}

function membersWithRecentSnapshots(groupID, hours = 24) {
  const cutoff = Date.now() - (hours * 60 * 60 * 1000);
  const memberIDs = new Set();
  for (const snapshot of groupSnapshots(groupID)) {
    const createdAt = new Date(snapshot.createdAt ?? 0).getTime();
    if (Number.isFinite(createdAt) && createdAt >= cutoff) {
      memberIDs.add(snapshot.ownerID);
    }
  }
  return Array.from(memberIDs)
    .map((memberID) => memberForID(memberID))
    .filter(Boolean);
}

function groupMarketRows(holdings) {
  const total = holdings.reduce((sum, holding) => sum + holdingMarketValueUSD(holding), 0);
  const grouped = new Map();
  for (const holding of holdings) {
    const marketValue = holdingMarketValueUSD(holding);
    grouped.set(holding.market, (grouped.get(holding.market) ?? 0) + marketValue);
  }

  return Array.from(grouped.entries())
    .map(([market, marketValue]) => ({
      market,
      label: labelForMarket(market),
      marketValue,
      weight: total > 0 ? marketValue / total : 0
    }))
    .sort((first, second) => second.marketValue - first.marketValue);
}

function portfolioSectionHTML(group, ownerID, options = {}) {
  const holdings = groupHoldings(group.id).filter((holding) => holding.ownerID === ownerID);
  const insights = buildPortfolioInsights(group.id, ownerID, holdings);

  return `
    <section class="section ${escapeAttr(options.sectionClass || "")}">
      <div class="section-header">
        <h2 class="section-title">${escapeHTML(options.title || "持仓")}</h2>
        ${options.actionLabel ? `<button class="primary-button" type="button" data-action="sheet" data-value="submit">${escapeHTML(options.actionLabel)}</button>` : `<span class="subtle">${holdings.length} 项</span>`}
      </div>
      ${portfolioSummaryHTML(insights, {
        owner: options.owner,
        holdings
      })}
      <div class="list">
        ${holdings.length
          ? insights.sortedHoldings.map((holding) => holdingHTML(holding, {
            editable: options.editable,
            emphasizeWeight: true,
            portfolio: insights.statsByHoldingID.get(holding.id)
          })).join("")
          : `<div class="empty">${options.editable ? "你还没有在这个群组提交持仓。" : "这个成员还没有提交持仓。"}</div>`}
      </div>
    </section>
  `;
}

function overviewMembersSectionHTML(group) {
  const members = group.members ?? [];
  return `
    <section class="section">
      <div class="section-header">
        <h2 class="section-title">成员组合</h2>
        <span class="subtle">${members.length} 人</span>
      </div>
      <div class="member-overview-grid">
        ${members.map((member) => memberOverviewCardHTML(member, group.id)).join("")}
      </div>
    </section>
  `;
}

function memberOverviewCardHTML(member, groupID) {
  const holdings = groupHoldings(groupID).filter((holding) => holding.ownerID === member.id);
  const insights = buildPortfolioInsights(groupID, member.id, holdings);
  const summary = visibleSummary(holdings);
  const latestActivity = latestActivityAt(holdings, insights.latestSnapshotAt);
  const primaryValue = memberPrimaryValue(summary, holdings, insights);
  const caption = memberOverviewCaption(holdings, insights);

  return `
    <button class="list-item member-overview-card" type="button" data-action="open-member" data-value="${escapeAttr(member.id)}">
      <div class="member-overview-head">
        <div class="account">
          ${avatarHTML(member)}
          <div class="min-w-0">
            <div class="member-name">${escapeHTML(member.displayName)}</div>
            <div class="member-meta">${escapeHTML(caption)}</div>
          </div>
        </div>
        <div class="value-stack">
          <div class="member-overview-value">${escapeHTML(primaryValue)}</div>
          <div class="value-caption">${escapeHTML(memberOverviewWeightCopy(holdings, insights))}</div>
        </div>
      </div>
      ${miniAllocationHTML(insights.topSlices, "member-allocation-strip")}
      <div class="member-symbol-row">
        ${memberTopSymbolsHTML(insights, holdings)}
      </div>
      <div class="member-card-meta">
        <span>${escapeHTML(memberOverviewConcentrationCopy(holdings, insights))}</span>
        <span>${latestActivity ? `更新 ${formatDateTime(latestActivity)}` : "暂无更新"}</span>
      </div>
    </button>
  `;
}

function latestActivityAt(holdings, fallback = null) {
  const latestHolding = holdings.slice().sort(byUpdatedAt)[0];
  const latestHoldingAt = latestHolding?.updatedAt ?? null;
  if (!latestHoldingAt) {
    return fallback;
  }
  if (!fallback) {
    return latestHoldingAt;
  }
  return new Date(latestHoldingAt) > new Date(fallback) ? latestHoldingAt : fallback;
}

function memberPrimaryValue(summary, holdings, insights) {
  if (summary.marketValue > 0) {
    return money(summary.marketValue, "USD");
  }
  if (holdings.length) {
    return insights.hiddenCount === holdings.length ? "仅公开标的" : "暂无可见";
  }
  return "未提交";
}

function memberOverviewCaption(holdings, insights) {
  if (!holdings.length) {
    return "等待首次提交";
  }
  if (insights.hiddenCount > 0) {
    return `公开 ${insights.visibleCount}/${holdings.length} 项持仓`;
  }
  return `${holdings.length} 项持仓`;
}

function memberOverviewWeightCopy(holdings, insights) {
  if (!holdings.length) {
    return "等待提交";
  }
  if (!insights.topSlices.length) {
    return "仓位不可见";
  }
  return `最大仓位 ${formatPercent(insights.maxWeight)}`;
}

function memberOverviewConcentrationCopy(holdings, insights) {
  if (!holdings.length) {
    return "等待首次提交";
  }
  if (!insights.topSlices.length) {
    return "公开仓位不可见";
  }
  return `前三集中 ${formatPercent(insights.top3Weight)}`;
}

function miniAllocationHTML(slices, className = "") {
  if (!slices.length) {
    return "";
  }

  return `
    <div class="allocation-strip ${escapeAttr(className)}" aria-hidden="true">
      ${slices.map((slice, index) => `
        <div class="allocation-segment tone-${index % 6}" style="width: ${Math.max(slice.weight * 100, 0)}%;"></div>
      `).join("")}
    </div>
  `;
}

function memberTopSymbolsHTML(insights, holdings) {
  if (!insights.topSlices.length) {
    return holdings.length
      ? `<span class="legend-chip">仅公开标的</span>`
      : `<span class="legend-chip">等待提交</span>`;
  }

  return insights.topSlices.slice(0, 3).map((slice, index) => `
    <span class="legend-chip tone-${index % 6}">
      <strong>${escapeHTML(slice.symbol)}</strong>
      <span>${escapeHTML(formatPercent(slice.weight))}</span>
    </span>
  `).join("");
}

function sheetHTML(group) {
  if (!state.sheet) {
    return "";
  }

  if (state.sheet === "groups") {
    const groups = state.data?.groups ?? [];
    return `
      <div class="sheet">
        <section class="sheet-panel">
          <div class="sheet-header">
            <h2 class="sheet-title">群组</h2>
            <button class="icon-button" type="button" data-action="close-sheet" aria-label="关闭">×</button>
          </div>
          ${groups.length ? groupMenuHTML(groups) : ""}
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

function groupMenuHTML(groups) {
  return `
    <section class="group-menu">
      <div class="section-header">
        <div class="section-header-copy">
          <h3 class="section-title">切换群组</h3>
          <div class="subtle">在这里切换已有群组，或继续创建新的群组</div>
        </div>
        <span class="subtle">${groups.length} 个</span>
      </div>
      <div class="group-menu-list">
        ${groups.map((group) => groupMenuItemHTML(group, group.id === state.activeGroupID)).join("")}
      </div>
    </section>
  `;
}

function groupMenuItemHTML(group, active) {
  return `
    <button class="group-menu-item ${active ? "active" : ""}" type="button" data-action="select-group" data-value="${escapeAttr(group.id)}" aria-pressed="${active ? "true" : "false"}">
      <div class="min-w-0">
        <div class="group-menu-item-name">${escapeHTML(group.name)}</div>
        <div class="group-menu-item-meta">
          <span>${group.members?.length ?? 0} 人</span>
          ${group.inviteCode ? `<span>邀请码 ${escapeHTML(group.inviteCode)}</span>` : ""}
        </div>
      </div>
      <span class="pill ${active ? "blue" : ""}">${active ? "当前群组" : "切换"}</span>
    </button>
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
          <label for="brokerHint">券商提示（可选）</label>
          <input id="brokerHint" name="brokerHint" placeholder="可留空，模型会自动判断">
        </div>
      </div>
      <label class="file-drop">
        <span class="file-drop-title">选择持仓截图</span>
        <span class="subtle">可一次选择多张截图；同券商账户按同代码覆盖，不同券商账户按同代码累计。</span>
        <input name="images" type="file" accept="image/*" multiple required>
      </label>
      <button class="primary-button" type="submit" ${state.busy ? "disabled" : ""}>解析截图</button>
    </form>
    ${draftsHTML()}
  `;
}

function draftsHTML() {
  if (!state.drafts.length && !state.draftMeta) {
    return "";
  }

  return `
    <section class="section">
        <div class="section-header">
          <div class="section-header-copy">
            <h3 class="section-title">解析结果</h3>
            ${draftMetaHTML()}
          </div>
          <button class="secondary-button" type="button" data-action="import-drafts" ${state.busy || !state.drafts.length ? "disabled" : ""}>同步本次持仓</button>
        </div>
        ${draftWarningsHTML()}
        <div class="draft-list">
          ${state.drafts.length ? state.drafts.map((draft) => holdingDraftHTML(draft)).join("") : `<div class="empty">还没有可导入的识别结果。</div>`}
        </div>
    </section>
  `;
}

function draftMetaHTML() {
  const meta = state.draftMeta;
  if (!meta) {
    return "";
  }

  const mergeCopy = draftMergeSummary(meta);
  return `
    <div class="subtle">
      已解析 ${meta.fileCount} 张截图，识别 ${meta.rawCount} 条，合并后 ${meta.mergedCount} 条${mergeCopy ? `，${mergeCopy}` : ""}
    </div>
  `;
}

function draftMergeSummary(meta) {
  const parts = [];
  if (meta.replacedCount) {
    parts.push(`同账户覆盖 ${meta.replacedCount} 条`);
  }
  if (meta.accumulatedCount) {
    parts.push(`跨券商累计 ${meta.accumulatedCount} 次`);
  }
  return parts.join("，");
}

function draftWarningsHTML() {
  const warnings = state.draftMeta?.warnings ?? [];
  if (!warnings.length) {
    return "";
  }

  return `
    <div class="import-warning-list">
      ${warnings.slice(0, 4).map((warning) => `<div>${escapeHTML(warning)}</div>`).join("")}
    </div>
  `;
}

function holdingHTML(holding, options = {}) {
  const owner = memberForHolding(holding);
  const showValues = canSeeValues(holding);
  const showCost = canSeeCost(holding);
  const marketValue = holdingMarketValueUSD(holding);
  const costBasis = holdingCostBasisUSD(holding);
  const pnl = marketValue - costBasis;
  const portfolio = options.portfolio ?? null;
  const emphasizeWeight = Boolean(options.emphasizeWeight && portfolio);
  const primaryValue = emphasizeWeight
    ? weightHeadline(portfolio)
    : (showValues ? money(marketValue, "USD") : "仅标的");
  const secondaryValue = emphasizeWeight
    ? (showValues ? money(marketValue, "USD") : "仅标的")
    : (showValues ? "可见市值" : "金额不可见");

  return `
    <article class="list-item holding-card">
      <div class="holding-card-head">
        <div class="min-w-0">
          <div class="holding-title">${escapeHTML(holding.assetName || holding.symbol)}</div>
          <div class="holding-meta">
            <span>${escapeHTML(holding.symbol)}</span>
            <span>${escapeHTML(labelForMarket(holding.market))}</span>
            <span>${escapeHTML(owner?.displayName || "")}</span>
            ${sourceCurrencyHTML(holding.currency)}
          </div>
        </div>
        <div class="holding-card-side">
          ${privacyPillHTML(holding)}
          <div class="value-stack">
            <div class="${emphasizeWeight ? "weight-value" : "holding-primary-value"}">${escapeHTML(primaryValue)}</div>
            <div class="value-caption">${escapeHTML(secondaryValue)}</div>
          </div>
        </div>
      </div>
      ${holdingStatsHTML({
        holding,
        showValues,
        showCost,
        marketValue,
        pnl
      })}
      ${emphasizeWeight ? holdingWeightHTML(portfolio) : ""}
      ${holdingChangeHTML(holding)}
      ${options.editable ? `
        <div class="actions">
          <button class="secondary-button compact-button" type="button" data-action="edit-holding" data-value="${escapeAttr(holding.id)}">编辑</button>
          <button class="danger-button compact-button" type="button" data-action="delete-holding" data-value="${escapeAttr(holding.id)}">删除</button>
        </div>
      ` : ""}
    </article>
  `;
}

function holdingDraftHTML(draft) {
  const complete = draft.quantity !== null && draft.averageCost !== null && draft.lastPrice !== null;
  const sourceLabel = draftSourceLabel(draft);
  return `
    <article class="list-item">
      <div class="holding-row">
        <div class="min-w-0">
          <div class="holding-title">${escapeHTML(draft.assetName || draft.symbol)}</div>
          <div class="holding-meta">
            <span>${escapeHTML(draft.symbol)}</span>
            <span>${escapeHTML(labelForMarket(draft.market))}</span>
            ${sourceCurrencyHTML(draft.currency)}
            <span>${Math.round(Number(draft.confidence ?? 0) * 100)}%</span>
            ${sourceLabel ? `<span>${escapeHTML(sourceLabel)}</span>` : ""}
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
  const insights = buildPortfolioInsights(groupID, member.id, holdings);
  const latestActivity = latestActivityAt(holdings, insights.latestSnapshotAt);
  return `
    <button class="list-item member-list-card ${active ? "active" : ""}" type="button" data-action="select-member" data-value="${escapeAttr(member.id)}">
      <div class="member-row">
        <div class="account">
          ${avatarHTML(member)}
          <div class="min-w-0">
            <div class="member-name">${escapeHTML(member.displayName)}</div>
            <div class="member-meta">${holdings.length} 项持仓</div>
          </div>
        </div>
        <div class="value-stack">
          <div class="member-list-value">${summary.marketValue ? money(summary.marketValue, "USD") : "暂无"}</div>
          <div class="value-caption">${escapeHTML(memberOverviewWeightCopy(holdings, insights))}</div>
        </div>
      </div>
      ${miniAllocationHTML(insights.topSlices, "member-list-strip")}
      <div class="member-list-footer">
        <span>${escapeHTML(memberOverviewConcentrationCopy(holdings, insights))}</span>
        <span>${latestActivity ? formatDateTime(latestActivity) : "暂无更新"}</span>
      </div>
    </button>
  `;
}

function exposureHTML(exposure) {
  const holders = exposure.holderIDs
    .map((memberID) => memberForID(memberID))
    .filter(Boolean);

  return `
    <article class="list-item exposure-card">
      <div class="holding-card-head">
        <div class="min-w-0">
          <div class="holding-title">${escapeHTML(exposure.assetName || exposure.symbol)}</div>
          <div class="holding-meta">
            <span>${escapeHTML(exposure.symbol)}</span>
            <span>${exposure.holderCount} 人持有</span>
            ${sourceCurrencyHTML(exposure.currency)}
          </div>
        </div>
        <div class="value-stack">
          <div class="holding-primary-value">${money(exposure.marketValue, "USD")}</div>
          <div class="value-caption">合计可见市值</div>
        </div>
      </div>
      <div class="consensus-holder-row">
        ${avatarStackHTML(holders, 4)}
        <div class="consensus-holder-copy">${escapeHTML(holders.map((member) => member.displayName).join("、") || `${exposure.holderCount} 位成员`)}</div>
      </div>
      <div class="row-meta">
        <span>合计数量 ${formatNumber(exposure.quantity)}</span>
        <span>${exposure.holderCount} 位成员形成共识</span>
      </div>
    </article>
  `;
}

function holdingStatsHTML({
  holding,
  showValues,
  showCost,
  marketValue,
  pnl
}) {
  if (!showValues) {
    return `<div class="holding-hidden-note">这条持仓仅公开标的，金额、仓位与盈亏不会展示。</div>`;
  }

  const stats = [
    {
      label: "数量",
      value: formatNumber(holding.quantity)
    },
    {
      label: "现价",
      value: money(convertMoneyToUSD(holding.lastPrice, holding.currency), "USD")
    }
  ];

  if (showCost) {
    stats.splice(1, 0, {
      label: "成本",
      value: money(convertMoneyToUSD(holding.averageCost, holding.currency), "USD")
    });
    stats.push({
      label: "盈亏",
      value: signedMoney(pnl, "USD"),
      tone: classForNumber(pnl)
    });
  } else {
    stats.push({
      label: "市值",
      value: money(marketValue, "USD")
    });
  }

  return `
    <div class="holding-stat-grid">
      ${stats.map((stat) => `
        <div class="holding-stat">
          <div class="holding-stat-label">${escapeHTML(stat.label)}</div>
          <div class="holding-stat-value ${escapeAttr(stat.tone || "")}">${escapeHTML(stat.value)}</div>
        </div>
      `).join("")}
      ${holding.priceDate ? `
        <div class="holding-stat">
          <div class="holding-stat-label">价格日期</div>
          <div class="holding-stat-value">${escapeHTML(holding.priceDate)}</div>
        </div>
      ` : ""}
    </div>
    ${showCost ? "" : `<div class="holding-hidden-note">这条持仓隐藏了成本价，占比仅按当前可见市值计算。</div>`}
  `;
}

function snapshotUpdateHTML(summary) {
  return `
    <article class="list-item snapshot-card">
      <div class="snapshot-card-head">
        <div class="account account-compact">
          ${avatarHTML(summary.owner)}
          <div class="min-w-0">
            <div class="account-name">${escapeHTML(summary.owner?.displayName || "成员")}</div>
            <div class="member-meta">${escapeHTML(summary.previousSnapshot ? "组合调仓" : "首次提交组合")}</div>
          </div>
        </div>
        <div class="snapshot-meta">
          <span class="pill ${summary.sourceTone}">${escapeHTML(summary.sourceLabel)}</span>
          <span class="subtle">${escapeHTML(formatDateTime(summary.snapshot.createdAt))}</span>
        </div>
      </div>
      ${summary.primaryChange ? snapshotHighlightHTML(summary.primaryChange) : ""}
      <div class="weight-summary">
        ${summary.summaryChips.length ? summary.summaryChips.map((chip) => `
          <span class="weight-chip ${escapeAttr(chip.tone)}">${escapeHTML(chip.label)}</span>
        `).join("") : `<span class="weight-chip">仓位占比无变化</span>`}
      </div>
      <div class="snapshot-change-list">
        ${summary.rows.length ? summary.rows.map(snapshotChangeRowHTML).join("") : `<div class="snapshot-empty">本次提交没有产生新的仓位占比变化。</div>`}
      </div>
      ${summary.note ? `<div class="holding-change"><span>${escapeHTML(summary.note)}</span></div>` : ""}
    </article>
  `;
}

function snapshotHighlightHTML(change) {
  const tone = changeToneClass(change.status);
  return `
    <div class="snapshot-highlight ${tone}">
      <div class="min-w-0">
        <div class="snapshot-highlight-label">主要变化</div>
        <div class="snapshot-highlight-title">${escapeHTML(change.assetName || change.symbol)}</div>
        <div class="snapshot-highlight-meta">${escapeHTML(change.symbol)} · ${escapeHTML(change.statusLabel)}</div>
      </div>
      <div class="snapshot-highlight-value">
        <strong>${escapeHTML(formatPercent(change.beforeWeight))} -> ${escapeHTML(formatPercent(change.afterWeight))}</strong>
        <span>${escapeHTML(signedPercentPoint(change.delta))}</span>
      </div>
    </div>
  `;
}

function snapshotChangeRowHTML(change) {
  const tone = changeToneClass(change.status);

  return `
    <div class="snapshot-change-row">
      <div class="snapshot-change-symbol min-w-0">
        <strong>${escapeHTML(change.assetName || change.symbol)}</strong>
        <span>${escapeHTML(change.symbol)} · ${escapeHTML(change.statusLabel)}</span>
      </div>
      <div class="snapshot-change-values ${tone}">
        <strong>${escapeHTML(formatPercent(change.beforeWeight))} -> ${escapeHTML(formatPercent(change.afterWeight))}</strong>
        <span>${escapeHTML(signedPercentPoint(change.delta))}</span>
      </div>
    </div>
  `;
}

function changeToneClass(status) {
  if (status === "up" || status === "new") {
    return "positive";
  }
  if (status === "down" || status === "removed") {
    return "negative";
  }
  return "";
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
          ${sourceCurrencyHTML(event.currency)}
        </div>
        <div class="row-meta">
          <span>数量 ${formatNumber(event.quantity)}</span>
          <span>现价 ${money(convertMoneyToUSD(event.lastPrice, event.currency), "USD")}</span>
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
    setNotice("success", "群组已创建。");
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
    setNotice("success", "已加入群组。");
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
    setNotice("success", "持仓已保存。");
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
    setNotice("success", "持仓已删除。");
  });
}

async function parseScreenshot(formData, form) {
  const files = Array.from(form.elements.images.files ?? []);
  if (!files.length) {
    setNotice("error", "请选择至少一张截图。");
    return;
  }

  await runBusy(async () => {
    const parsed = [];
    const warnings = [];
    const brokerHint = String(formData.get("brokerHint") ?? "").trim();

    for (const [index, file] of files.entries()) {
      const imageDataURL = await imageFileToDataURL(file);
      const result = await api("/api/imports/parse-screenshot", {
        method: "POST",
        body: {
          imageDataURL,
          defaultVisibility: formData.get("defaultVisibility"),
          brokerHint,
          locale: navigator.language || "zh-Hans"
        }
      });

      const holdings = result.holdings ?? [];
      parsed.push(...holdings.map((draft) => ({
        ...draft,
        importSource: file.name || `截图 ${index + 1}`,
        importIndex: index + 1,
        importSourceType: result.source || "unknown",
        importBrokerHint: brokerHint
      })));

      for (const warning of result.warnings ?? []) {
        warnings.push(`第 ${index + 1} 张：${warning}`);
      }
    }

    const merged = mergeDrafts(parsed);
    state.drafts = merged.drafts;
    state.draftMeta = {
      fileCount: files.length,
      rawCount: parsed.length,
      mergedCount: merged.drafts.length,
      duplicateCount: merged.duplicateCount,
      replacedCount: merged.replacedCount,
      accumulatedCount: merged.accumulatedCount,
      warnings
    };

    const copy = files.length > 1
      ? `已解析 ${files.length} 张截图，合并 ${merged.drafts.length} 条持仓。`
      : `识别到 ${merged.drafts.length} 条持仓。`;
    setNotice("success", warnings[0] || copy);
  });
}

function mergeDrafts(drafts) {
  const byAccount = new Map();
  let replacedCount = 0;

  for (const draft of drafts) {
    const symbol = normalizeSymbol(draft.symbol);
    if (!symbol) {
      continue;
    }

    const normalizedDraft = {
      ...draft,
      symbol,
      accountKey: draftAccountKey(draft),
      brokerName: cleanDraftText(draft.brokerName),
      accountName: cleanDraftText(draft.accountName)
    };
    const accountKey = `${symbol}|${normalizedDraft.accountKey}`;

    if (byAccount.has(accountKey)) {
      replacedCount += 1;
    }

    byAccount.set(accountKey, replaceDraft(byAccount.get(accountKey), normalizedDraft));
  }

  const bySymbol = new Map();
  let accumulatedCount = 0;

  for (const draft of byAccount.values()) {
    if (bySymbol.has(draft.symbol)) {
      accumulatedCount += 1;
      bySymbol.set(draft.symbol, accumulateDrafts(bySymbol.get(draft.symbol), draft));
      continue;
    }

    bySymbol.set(draft.symbol, draft);
  }

  return {
    drafts: Array.from(bySymbol.values()).sort((first, second) => first.symbol.localeCompare(second.symbol)),
    duplicateCount: replacedCount + accumulatedCount,
    replacedCount,
    accumulatedCount
  };
}

function normalizeSymbol(symbol) {
  return String(symbol ?? "").trim().toUpperCase();
}

function draftAccountKey(draft) {
  const explicitKey = normalizeSourceKey(draft.accountKey);
  if (explicitKey) {
    return explicitKey;
  }

  const brokerKey = normalizeSourceKey(draft.brokerName);
  const accountKey = normalizeSourceKey(draft.accountName);
  if (brokerKey || accountKey) {
    return [brokerKey, accountKey].filter(Boolean).join(":");
  }

  return `screenshot-${draft.importIndex || "unknown"}`;
}

function normalizeSourceKey(value) {
  return cleanDraftText(value)
    .toLocaleLowerCase()
    .replace(/[|]/g, " ")
    .trim();
}

function cleanDraftText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function replaceDraft(previousDraft, nextDraft) {
  if (!previousDraft) {
    return {
      ...nextDraft,
      note: mergedDraftNote(nextDraft)
    };
  }

  return {
    ...nextDraft,
    brokerName: nextDraft.brokerName || previousDraft.brokerName,
    accountName: nextDraft.accountName || previousDraft.accountName,
    importSource: joinUnique([previousDraft.importSource, nextDraft.importSource]),
    note: mergedDraftNote(nextDraft, previousDraft)
  };
}

function accumulateDrafts(previousDraft, nextDraft) {
  const previousQuantity = finiteNumber(previousDraft.quantity);
  const nextQuantity = finiteNumber(nextDraft.quantity);
  const quantity = sumNumbers(previousQuantity, nextQuantity);
  const previousMarketValue = finiteNumber(previousDraft.marketValue);
  const nextMarketValue = finiteNumber(nextDraft.marketValue);

  return {
    ...previousDraft,
    assetName: previousDraft.assetName || nextDraft.assetName || previousDraft.symbol,
    market: previousDraft.market || nextDraft.market,
    quantity,
    averageCost: weightedAverageCost(previousDraft, nextDraft, previousQuantity, nextQuantity),
    lastPrice: finiteNumber(nextDraft.lastPrice) ?? finiteNumber(previousDraft.lastPrice),
    marketValue: sumNumbers(previousMarketValue, nextMarketValue),
    currency: previousDraft.currency || nextDraft.currency || "USD",
    visibility: previousDraft.visibility || nextDraft.visibility || "amountOnly",
    confidence: Math.min(Number(previousDraft.confidence ?? 1), Number(nextDraft.confidence ?? 1)),
    note: accumulatedDraftNote(previousDraft, nextDraft),
    rawText: joinUnique([previousDraft.rawText, nextDraft.rawText], "\n"),
    importSource: joinUnique([previousDraft.importSource, nextDraft.importSource]),
    brokerName: joinUnique([previousDraft.brokerName, nextDraft.brokerName]),
    accountName: joinUnique([previousDraft.accountName, nextDraft.accountName]),
    accountKey: joinUnique([previousDraft.accountKey, nextDraft.accountKey], "+")
  };
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sumNumbers(first, second) {
  if (first === null) {
    return second;
  }
  if (second === null) {
    return first;
  }
  return roundNumber(first + second);
}

function weightedAverageCost(previousDraft, nextDraft, previousQuantity, nextQuantity) {
  const previousCost = finiteNumber(previousDraft.averageCost);
  const nextCost = finiteNumber(nextDraft.averageCost);
  if (
    previousQuantity !== null
    && nextQuantity !== null
    && previousCost !== null
    && nextCost !== null
    && previousQuantity + nextQuantity > 0
  ) {
    return roundNumber(((previousQuantity * previousCost) + (nextQuantity * nextCost)) / (previousQuantity + nextQuantity));
  }

  return nextCost ?? previousCost;
}

function roundNumber(value) {
  return Math.round(Number(value) * 1000000) / 1000000;
}

function accumulatedDraftNote(previousDraft, nextDraft) {
  const sourceLabel = joinUnique([draftSourceLabel(previousDraft), draftSourceLabel(nextDraft)]);
  return sourceLabel ? `多券商累计：${sourceLabel}` : "多券商累计";
}

function mergedDraftNote(nextDraft, previousDraft) {
  const source = nextDraft.importSource ? `来源：${nextDraft.importSource}` : "";
  if (!previousDraft) {
    return nextDraft.note || source;
  }
  return nextDraft.note || source || previousDraft.note || "多截图合并";
}

function draftSourceLabel(draft) {
  const account = [draft.brokerName, draft.accountName].map(cleanDraftText).filter(Boolean).join(" ");
  return account || cleanDraftText(draft.accountKey) || cleanDraftText(draft.importSource);
}

function joinUnique(values, separator = "、") {
  const seen = new Set();
  const uniqueValues = [];
  for (const value of values) {
    const text = cleanDraftText(value);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    uniqueValues.push(text);
  }
  return uniqueValues.join(separator);
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
    setNotice("error", "没有完整的草稿可以导入。");
    return;
  }

  await runBusy(async () => {
    const result = await api(`/api/groups/${encodeURIComponent(group.id)}/holdings/sync`, {
      method: "PUT",
      body: {
        holdings: importable.map((draft) => ({
          symbol: draft.symbol,
          assetName: draft.assetName || draft.symbol,
          market: draft.market || "usStock",
          quantity: draft.quantity,
          averageCost: draft.averageCost,
          lastPrice: draft.lastPrice,
          currency: draft.currency || "USD",
          visibility: draft.visibility || "amountOnly",
          note: draft.note || "截图同步"
        }))
      }
    });
    await refreshBootstrap();
    state.sheet = "";
    state.drafts = [];
    state.draftMeta = null;
    setNotice("success", `已同步 ${result.summary.snapshotCount} 条持仓，新增 ${result.summary.createdCount}，更新 ${result.summary.updatedCount}，删除 ${result.summary.deletedCount}。`);
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
  clearNotice();
  render();
  try {
    await task();
  } catch (error) {
    setNotice("error", error.message || "操作失败。");
  } finally {
    state.busy = false;
    render();
  }
}

async function copyInviteCode(text) {
  if (!text) {
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      copyTextFallback(text);
    }
    setNotice("success", "邀请码已复制。");
  } catch {
    setNotice("error", "复制失败，请手动复制。");
  }
}

function copyTextFallback(text) {
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  input.style.pointerEvents = "none";
  input.style.inset = "0 auto auto -9999px";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
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
  state.drafts = [];
  state.draftMeta = null;
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
    holdingEvents: data?.holdingEvents ?? [],
    portfolioSnapshots: data?.portfolioSnapshots ?? []
  };
}

function closeSheet() {
  state.sheet = "";
  state.editHoldingID = "";
  state.drafts = [];
  state.draftMeta = null;
  clearNotice();
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
  let marketValue = 0;
  let costBasis = 0;

  for (const holding of holdings) {
    if (!canSeeValues(holding)) {
      continue;
    }
    marketValue += holdingMarketValueUSD(holding);
    if (canSeeCost(holding)) {
      costBasis += holdingCostBasisUSD(holding);
    }
  }

  return {
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
    existing.marketValue += holdingMarketValueUSD(holding);
    if (canSeeCost(holding)) {
      existing.costBasis += holdingCostBasisUSD(holding);
    }
    existing.holderIDs.add(holding.ownerID);
    grouped.set(key, existing);
  }

  return Array.from(grouped.values())
    .map((item) => ({
      ...item,
      holderIDs: Array.from(item.holderIDs),
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
  return memberForID(holding.ownerID);
}

function memberForID(memberID) {
  return (state.data?.groups ?? [])
    .flatMap((group) => group.members ?? [])
    .find((member) => member.id === memberID);
}

function holdingEventsFor(holding) {
  return (state.data?.holdingEvents ?? [])
    .filter((event) => event.holdingID === holding.id)
    .sort((first, second) => new Date(first.createdAt) - new Date(second.createdAt));
}

function holdingChangeSummary(holding) {
  const events = holdingEventsFor(holding);
  const created = events.find((event) => event.type === "created");
  const updated = [...events].reverse().find((event) => event.type === "updated");
  const items = [];

  if (created) {
    items.push(`创建 ${formatDateTime(created.createdAt)}`);
  }

  if (updated) {
    items.push(`变更 ${formatDateTime(updated.createdAt)}`);
  } else if (!created && holding.updatedAt) {
    items.push(`更新 ${formatDateTime(holding.updatedAt)}`);
  }

  return items;
}

function holdingChangeHTML(holding) {
  const items = holdingChangeSummary(holding);
  if (!items.length) {
    return "";
  }

  return `
    <div class="holding-change">
      ${items.map((item) => `<span>${escapeHTML(item)}</span>`).join("")}
    </div>
  `;
}

function groupLatestSnapshotAt(groupID) {
  return groupSnapshots(groupID)[0]?.createdAt ?? null;
}

function groupSnapshots(groupID) {
  return (state.data?.portfolioSnapshots ?? [])
    .filter((snapshot) => snapshot.groupID === groupID)
    .sort((first, second) => new Date(second.createdAt ?? 0) - new Date(first.createdAt ?? 0));
}

function recentSnapshotSummaries(groupID) {
  return groupSnapshots(groupID)
    .map((snapshot) => snapshotSummary(snapshot))
    .filter((summary) => summary);
}

function snapshotSummary(snapshot) {
  const owner = memberForID(snapshot.ownerID);
  const previousSnapshot = previousSnapshotFor(snapshot);
  const currentContext = snapshotPortfolioContext(snapshot);
  const currentRows = [...currentContext.rows].sort((first, second) => second.weight - first.weight);
  const hiddenCount = Math.max(0, (snapshot.holdings?.length ?? 0) - currentRows.length);
  const sourceLabel = snapshot.source === "screenshot"
    ? "截图导入"
    : snapshot.source === "manual"
      ? "手工提交"
      : "历史快照";
  const sourceTone = snapshot.source === "screenshot" ? "blue" : "";

  if (!previousSnapshot) {
    return {
      snapshot,
      owner,
      previousSnapshot: null,
      rows: currentRows.slice(0, 4).map((row) => ({
        ...row,
        beforeWeight: 0,
        afterWeight: row.weight,
        delta: row.weight,
        status: "new",
        statusLabel: "首次出现"
      })),
      summaryChips: [
        {
          label: `${currentRows.length} 项公开仓位`,
          tone: ""
        }
      ],
      primaryChange: currentRows[0] ? {
        ...currentRows[0],
        beforeWeight: 0,
        afterWeight: currentRows[0].weight,
        delta: currentRows[0].weight,
        status: "new",
        statusLabel: "首次出现"
      } : null,
      note: hiddenCount > 0 ? `另有 ${hiddenCount} 项仅公开标的，未纳入仓位占比。` : "",
      sourceLabel,
      sourceTone
    };
  }

  const previousContext = snapshotPortfolioContext(previousSnapshot);
  const changes = snapshotChangeRows(currentContext, previousContext);
  const counts = countSnapshotStatuses(changes);

  return {
    snapshot,
    owner,
    previousSnapshot,
    rows: changes.slice(0, 5),
    primaryChange: changes[0] ?? null,
    summaryChips: snapshotSummaryChips(counts),
    note: hiddenCount > 0 ? `本次有 ${hiddenCount} 项仅公开标的，未纳入仓位占比变化。` : "",
    sourceLabel,
    sourceTone
  };
}

function previousSnapshotFor(snapshot) {
  const snapshots = portfolioSnapshotsFor(snapshot.groupID, snapshot.ownerID);
  const index = snapshots.findIndex((candidate) => candidate.id === snapshot.id);
  return index > 0 ? snapshots[index - 1] : null;
}

function snapshotChangeRows(currentContext, previousContext) {
  const currentRows = new Map(currentContext.rows.map((row) => [row.symbol, row]));
  const previousRows = new Map(previousContext.rows.map((row) => [row.symbol, row]));
  const symbols = new Set([...currentRows.keys(), ...previousRows.keys()]);
  const changes = [];

  for (const symbol of symbols) {
    const current = currentRows.get(symbol) ?? null;
    const previous = previousRows.get(symbol) ?? null;
    const beforeWeight = previous?.weight ?? 0;
    const afterWeight = current?.weight ?? 0;
    const delta = afterWeight - beforeWeight;

    if (Math.abs(delta) < 0.001) {
      continue;
    }

    const status = beforeWeight === 0
      ? "new"
      : afterWeight === 0
        ? "removed"
        : delta > 0
          ? "up"
          : "down";

    changes.push({
      symbol,
      assetName: current?.assetName || previous?.assetName || symbol,
      beforeWeight,
      afterWeight,
      delta,
      status,
      statusLabel: {
        new: "新进",
        removed: "移除",
        up: "加仓",
        down: "减仓"
      }[status] ?? "调整"
    });
  }

  return changes.sort((first, second) => {
    const deltaGap = Math.abs(second.delta) - Math.abs(first.delta);
    if (Math.abs(deltaGap) > 0.0001) {
      return deltaGap;
    }
    return second.afterWeight - first.afterWeight;
  });
}

function countSnapshotStatuses(changes) {
  return changes.reduce((counts, change) => {
    counts[change.status] = (counts[change.status] ?? 0) + 1;
    return counts;
  }, {});
}

function snapshotSummaryChips(counts) {
  const chips = [];
  if (counts.new) {
    chips.push({ label: `新进 ${counts.new}`, tone: "positive" });
  }
  if (counts.up) {
    chips.push({ label: `加仓 ${counts.up}`, tone: "positive" });
  }
  if (counts.down) {
    chips.push({ label: `减仓 ${counts.down}`, tone: "negative" });
  }
  if (counts.removed) {
    chips.push({ label: `移除 ${counts.removed}`, tone: "negative" });
  }
  return chips;
}

function portfolioSummaryHTML(insights, options = {}) {
  if (!insights.totalCount) {
    return "";
  }

  const topSlice = insights.topSlices[0] ?? null;
  const owner = options.owner ?? null;
  const holdings = options.holdings ?? [];
  const summary = visibleSummary(holdings);
  const primaryValue = owner ? memberPrimaryValue(summary, holdings, insights) : money(insights.totalVisibleValue, "USD");

  return `
    <div class="panel portfolio-summary">
      ${owner ? `
        <div class="portfolio-owner-row">
          <div class="account">
            ${avatarHTML(owner)}
            <div class="min-w-0">
              <div class="account-name">${escapeHTML(owner.displayName)}</div>
              <div class="account-mail">${escapeHTML(memberOverviewCaption(holdings, insights))}</div>
            </div>
          </div>
          <div class="value-stack">
            <div class="member-overview-value">${escapeHTML(primaryValue)}</div>
            <div class="value-caption">${escapeHTML(portfolioFreshnessCopy(insights, holdings))}</div>
          </div>
        </div>
      ` : ""}
      <div class="portfolio-focus">
        <div class="min-w-0">
          <div class="portfolio-focus-label">当前主仓位</div>
          <div class="portfolio-focus-title">${topSlice ? escapeHTML(topSlice.symbol) : "暂无公开仓位"}</div>
          <div class="subtle">${topSlice ? escapeHTML(topSlice.assetName || topSlice.symbol) : escapeHTML(portfolioCoverageCopy(insights))}</div>
        </div>
        <div class="value-stack">
          <div class="weight-value">${topSlice ? escapeHTML(formatPercent(topSlice.weight)) : "-"}</div>
          <div class="value-caption">最大仓位</div>
        </div>
      </div>
      ${allocationStripHTML(insights.topSlices)}
      <div class="portfolio-stat-grid portfolio-stat-grid-compact">
        ${portfolioStatHTML("公开持仓", `${insights.visibleCount}/${insights.totalCount}`)}
        ${portfolioStatHTML("前三集中", formatPercent(insights.top3Weight))}
        ${portfolioStatHTML("本次变化", insights.previousSnapshotAt ? `${insights.changeCount} 项` : "首版")}
        ${portfolioStatHTML("退出仓位", insights.previousSnapshotAt ? `${insights.removedCount} 项` : "0 项")}
      </div>
      <div class="portfolio-note">
        <span>${escapeHTML(portfolioCoverageCopy(insights))}</span>
        <span>${escapeHTML(portfolioComparisonCopy(insights))}</span>
      </div>
    </div>
  `;
}

function portfolioFreshnessCopy(insights, holdings) {
  const latest = latestActivityAt(holdings, insights.latestSnapshotAt);
  return latest ? `更新 ${formatDateTime(latest)}` : "暂无更新";
}

function portfolioStatHTML(label, value) {
  return `
    <div class="portfolio-stat">
      <div class="portfolio-stat-label">${escapeHTML(label)}</div>
      <div class="portfolio-stat-value">${escapeHTML(value)}</div>
    </div>
  `;
}

function allocationStripHTML(slices) {
  if (!slices.length) {
    return "";
  }

  return `
    <div class="allocation-wrap">
      <div class="allocation-strip" aria-label="仓位分布">
        ${slices.map((slice, index) => `
          <div
            class="allocation-segment tone-${index % 6}"
            style="width: ${Math.max(slice.weight * 100, 0)}%;"
            title="${escapeAttr(`${slice.symbol} ${formatPercent(slice.weight)}`)}"
          ></div>
        `).join("")}
      </div>
      <div class="allocation-legend">
        ${slices.slice(0, 4).map((slice, index) => `
          <span class="legend-chip tone-${index % 6}">
            <strong>${escapeHTML(slice.symbol)}</strong>
            <span>${escapeHTML(formatPercent(slice.weight))}</span>
          </span>
        `).join("")}
      </div>
    </div>
  `;
}

function buildPortfolioInsights(groupID, ownerID, holdings = []) {
  const currentContext = currentPortfolioContext(holdings);
  const snapshots = portfolioSnapshotsFor(groupID, ownerID);
  const previousSnapshot = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
  const hasPreviousSnapshot = Boolean(previousSnapshot);
  const previousContext = previousSnapshot ? snapshotPortfolioContext(previousSnapshot) : emptyPortfolioContext();
  const currentSymbols = new Set(holdings.map((holding) => holding.symbol));
  const sortedVisible = [...currentContext.rows].sort((first, second) => second.weight - first.weight);
  const sortedHoldings = holdings.slice().sort((first, second) => {
    const firstWeight = currentContext.byHoldingID.get(first.id)?.weight ?? -1;
    const secondWeight = currentContext.byHoldingID.get(second.id)?.weight ?? -1;
    if (secondWeight !== firstWeight) {
      return secondWeight - firstWeight;
    }
    return byUpdatedAt(first, second);
  });

  const statsByHoldingID = new Map();
  let changeCount = 0;

  for (const holding of sortedHoldings) {
    const current = currentContext.byHoldingID.get(holding.id) ?? {
      marketValue: 0,
      weight: null
    };
    const previousWeight = previousContext.byHoldingID.get(holding.id) ?? previousContext.bySymbol.get(holding.symbol) ?? null;
    const delta = current.weight === null || previousWeight === null ? null : current.weight - previousWeight;
    const status = weightStatus(current.weight, previousWeight, delta, hasPreviousSnapshot);

    if (hasPreviousSnapshot && (status === "new" || status === "up" || status === "down")) {
      changeCount += 1;
    }

    statsByHoldingID.set(holding.id, {
      marketValue: current.marketValue,
      weight: current.weight,
      previousWeight,
      delta,
      status
    });
  }

  let removedCount = 0;
  if (hasPreviousSnapshot) {
    for (const symbol of previousContext.bySymbol.keys()) {
      if (!currentSymbols.has(symbol)) {
        removedCount += 1;
      }
    }
  }

  return {
    totalCount: holdings.length,
    visibleCount: currentContext.rows.length,
    hiddenCount: holdings.length - currentContext.rows.length,
    totalVisibleValue: currentContext.totalVisibleValue,
    maxWeight: sortedVisible[0]?.weight ?? 0,
    top3Weight: sortedVisible.slice(0, 3).reduce((sum, row) => sum + row.weight, 0),
    changeCount,
    removedCount,
    latestSnapshotAt: snapshots[snapshots.length - 1]?.createdAt ?? null,
    previousSnapshotAt: previousSnapshot?.createdAt ?? null,
    topSlices: sortedVisible.slice(0, 6),
    sortedHoldings,
    statsByHoldingID
  };
}

function portfolioSnapshotsFor(groupID, ownerID) {
  return (state.data?.portfolioSnapshots ?? [])
    .filter((snapshot) => snapshot.groupID === groupID && snapshot.ownerID === ownerID)
    .sort((first, second) => new Date(first.createdAt ?? 0) - new Date(second.createdAt ?? 0));
}

function currentPortfolioContext(holdings) {
  const visibleHoldings = holdings.filter((holding) => canSeeValues(holding));
  const totalVisibleValue = visibleHoldings.reduce((sum, holding) => sum + holdingMarketValueUSD(holding), 0);
  const byHoldingID = new Map();
  const bySymbol = new Map();
  const rowsBySymbol = new Map();

  for (const holding of visibleHoldings) {
    const marketValue = holdingMarketValueUSD(holding);
    const weight = totalVisibleValue > 0 ? marketValue / totalVisibleValue : 0;
    byHoldingID.set(holding.id, { marketValue, weight });
    bySymbol.set(holding.symbol, (bySymbol.get(holding.symbol) ?? 0) + weight);
    const row = rowsBySymbol.get(holding.symbol) ?? {
      symbol: holding.symbol,
      assetName: holding.assetName,
      marketValue: 0,
      weight: 0
    };
    row.marketValue += marketValue;
    row.weight += weight;
    rowsBySymbol.set(holding.symbol, row);
  }

  return {
    totalVisibleValue,
    byHoldingID,
    bySymbol,
    rows: Array.from(rowsBySymbol.values())
  };
}

function snapshotPortfolioContext(snapshot) {
  const visibleHoldings = (snapshot.holdings ?? []).filter((holding) => canSeeSnapshotValues(snapshot, holding));
  const totalVisibleValue = visibleHoldings.reduce((sum, holding) => sum + snapshotHoldingMarketValueUSD(holding), 0);
  const byHoldingID = new Map();
  const bySymbol = new Map();
  const rowsBySymbol = new Map();

  for (const holding of visibleHoldings) {
    const marketValue = snapshotHoldingMarketValueUSD(holding);
    const weight = totalVisibleValue > 0 ? marketValue / totalVisibleValue : 0;
    byHoldingID.set(holding.holdingID, weight);
    bySymbol.set(holding.symbol, (bySymbol.get(holding.symbol) ?? 0) + weight);
    const row = rowsBySymbol.get(holding.symbol) ?? {
      symbol: holding.symbol,
      assetName: holding.assetName,
      marketValue: 0,
      weight: 0
    };
    row.marketValue += marketValue;
    row.weight += weight;
    rowsBySymbol.set(holding.symbol, row);
  }

  return {
    totalVisibleValue,
    byHoldingID,
    bySymbol,
    rows: Array.from(rowsBySymbol.values())
  };
}

function emptyPortfolioContext() {
  return {
    totalVisibleValue: 0,
    byHoldingID: new Map(),
    bySymbol: new Map(),
    rows: []
  };
}

function canSeeSnapshotValues(snapshot, holding) {
  return snapshot.ownerID === state.session?.currentMemberID || holding.visibility !== "symbolOnly";
}

function snapshotHoldingMarketValueUSD(holding) {
  return convertMoneyToUSD(Number(holding.quantity) * Number(holding.lastPrice), holding.currency);
}

function weightStatus(weight, previousWeight, delta, hasPreviousSnapshot = true) {
  if (!hasPreviousSnapshot) {
    return weight === null ? "hidden" : "initial";
  }
  if (weight === null) {
    return "hidden";
  }
  if (previousWeight === null) {
    return "new";
  }
  if (Math.abs(delta ?? 0) < 0.001) {
    return "flat";
  }
  return delta > 0 ? "up" : "down";
}

function weightHeadline(portfolio) {
  if (!portfolio || portfolio.weight === null) {
    return "不可见";
  }
  return formatPercent(portfolio.weight);
}

function holdingWeightHTML(portfolio) {
  if (!portfolio) {
    return "";
  }

  const chips = [];
  if (portfolio.weight === null) {
    chips.push(`<span class="weight-chip">仓位不可见</span>`);
  } else {
    chips.push(`<span class="weight-chip strong">占比 ${escapeHTML(formatPercent(portfolio.weight))}</span>`);
  }

  const deltaLabel = weightDeltaLabel(portfolio);
  if (deltaLabel) {
    chips.push(`<span class="weight-chip ${weightChipTone(portfolio.status)}">${escapeHTML(deltaLabel)}</span>`);
  }

  return `
    <div class="weight-summary">
      ${chips.join("")}
    </div>
    ${portfolio.weight === null ? "" : `
      <div class="weight-bar" aria-hidden="true">
        <div class="weight-fill ${weightChipTone(portfolio.status)}" style="width: ${Math.max(0, Math.min(portfolio.weight * 100, 100))}%;"></div>
      </div>
    `}
  `;
}

function weightDeltaLabel(portfolio) {
  if (!portfolio || portfolio.weight === null) {
    return "";
  }
  if (portfolio.status === "initial") {
    return "";
  }
  if (portfolio.previousWeight === null) {
    return "新进仓位";
  }
  if (portfolio.status === "flat") {
    return "较上次持平";
  }
  return `较上次 ${signedPercentPoint(portfolio.delta)}`;
}

function weightChipTone(status) {
  if (status === "up" || status === "new") {
    return "positive";
  }
  if (status === "down") {
    return "negative";
  }
  return "";
}

function portfolioCoverageCopy(insights) {
  if (insights.hiddenCount > 0) {
    return `按可见市值计算，隐藏 ${insights.hiddenCount} 项未纳入占比。`;
  }
  return "按当前可见市值计算。";
}

function portfolioComparisonCopy(insights) {
  if (!insights.previousSnapshotAt) {
    return insights.latestSnapshotAt ? `最新快照 ${formatDateTime(insights.latestSnapshotAt)}` : "等待下一次提交形成对比。";
  }
  return `对比 ${formatDateTime(insights.previousSnapshotAt)} 的上一版组合。`;
}

function fxRateToUSD(currency) {
  return fxRatesToUSD[currency] ?? 1;
}

function convertMoneyToUSD(value, currency = "USD") {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return number * fxRateToUSD(currency);
}

function holdingMarketValueUSD(holding) {
  return convertMoneyToUSD(Number(holding.quantity) * Number(holding.lastPrice), holding.currency);
}

function holdingCostBasisUSD(holding) {
  return convertMoneyToUSD(Number(holding.quantity) * Number(holding.averageCost), holding.currency);
}

function sourceCurrencyHTML(currency) {
  if (!currency || currency === "USD") {
    return "";
  }
  return `<span>原币 ${escapeHTML(currency)}</span>`;
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

function setNotice(type, text, duration = 2600) {
  clearNotice();
  if (!text) {
    return;
  }

  state.error = type === "error" ? text : "";
  state.message = type === "success" ? text : "";
  armNoticeDismiss(duration);
  render();
}

function clearNotice() {
  if (noticeTimer) {
    window.clearTimeout(noticeTimer);
    noticeTimer = 0;
  }
  state.error = "";
  state.message = "";
}

function armNoticeDismiss(duration = 2600) {
  if (noticeTimer) {
    window.clearTimeout(noticeTimer);
  }
  noticeTimer = window.setTimeout(() => {
    state.error = "";
    state.message = "";
    noticeTimer = 0;
    render();
  }, duration);
}

function toastHTML() {
  const text = state.error || state.message;
  if (!text) {
    return "";
  }

  return `
    <div class="toast-layer" aria-live="polite">
      <div class="toast ${state.error ? "toast-error" : "toast-success"}">${escapeHTML(text)}</div>
    </div>
  `;
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

function avatarStackHTML(users, limit = 4) {
  const items = users.slice(0, limit);
  const extraCount = Math.max(0, users.length - items.length);
  return `
    <div class="avatar-stack" aria-hidden="true">
      ${items.map((user) => miniAvatarHTML(user)).join("")}
      ${extraCount ? `<span class="mini-avatar mini-avatar-more">+${extraCount}</span>` : ""}
    </div>
  `;
}

function miniAvatarHTML(user) {
  const pictureURL = user?.pictureURL || user?.picture;
  const name = user?.displayName || "成员";
  return pictureURL
    ? `<span class="mini-avatar"><img src="${escapeAttr(pictureURL)}" alt=""></span>`
    : `<span class="mini-avatar">${escapeHTML(name.trim().slice(0, 1) || "持")}</span>`;
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

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "-";
  }
  return new Intl.NumberFormat("zh-CN", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(number);
}

function signedPercentPoint(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "-";
  }
  const absolute = `${formatPercent(Math.abs(number))}`;
  if (number > 0) {
    return `+${absolute}`;
  }
  if (number < 0) {
    return `-${absolute}`;
  }
  return absolute;
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
