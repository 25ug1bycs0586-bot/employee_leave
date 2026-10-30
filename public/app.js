const app = document.getElementById("app");
const toastRegion = document.getElementById("toast-region");
const state = {
  token: sessionStorage.getItem("leavewise-token"),
  user: null,
  page: "dashboard",
  dashboard: null,
  leaves: [],
  employees: [],
  departments: [],
  sidebarOpen: false,
};

const leaveTypes = [
  ["casual", "Casual Leave", "CL"],
  ["sick", "Sick Leave", "SL"],
  ["earned", "Earned Leave", "EL"],
  ["maternity", "Maternity Leave", "ML"],
  ["paternity", "Paternity Leave", "PL"],
  ["unpaid", "Unpaid Leave", "LWP"],
];
const balanceTypes = ["casual", "sick", "earned", "maternity", "paternity"];
const leaveColors = ["", "green", "blue", "orange", "", ""];
const iconMap = {
  dashboard: "fa-solid fa-house", apply: "fa-solid fa-calendar-plus",
  requests: "fa-solid fa-list-check", employees: "fa-solid fa-users",
  departments: "fa-solid fa-building", reports: "fa-solid fa-chart-line",
  profile: "fa-solid fa-user",
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const initials = (name = "") => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "LW";
const leaveLabel = (key) => leaveTypes.find(([value]) => value === key)?.[1] || key;
const leaveCode = (key) => leaveTypes.find(([value]) => value === key)?.[2] || key;
const dateValue = (value) => value ? new Date(value) : null;
const dateText = (value, options = { month: "short", day: "numeric", year: "numeric" }) => {
  let date;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    date = new Date(year, month - 1, day);
  } else {
    date = dateValue(value);
  }
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, options) : "—";
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const fullName = (user = state.user) => user?.name || "Your workspace";

function serverHelpMessage() {
  if (window.location.protocol === "file:") {
    return "This page was opened as a local file, so sign-in and registration cannot reach the backend. Start Leavewise with `npm start`, then open http://localhost:3001.";
  }
  return "Leavewise could not reach its API. Make sure `npm start` is running and MongoDB is available, then open the same port shown in the server terminal (default: http://localhost:3001).";
}

async function api(url, options = {}) {
  if (window.location.protocol === "file:") throw new Error(serverHelpMessage());
  const headers = new Headers(options.headers || {});
  if (state.token) headers.set("Authorization", `Bearer ${state.token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch {
    throw new Error(serverHelpMessage());
  }
  let payload;
  try {
    payload = JSON.parse(await response.text());
  } catch {
    throw new Error(`The server at ${window.location.origin} returned a web page instead of the Leavewise API. Open Leavewise on its Express port (default: http://localhost:3001), not a file or another app's port.`);
  }
  if (!response.ok) {
    if (response.status === 401 && state.token) {
      state.token = null;
      state.user = null;
      sessionStorage.removeItem("leavewise-token");
      renderAuth();
    }
    throw new Error(payload.message || "The request could not be completed.");
  }
  return payload;
}

function toast(message, error = false) {
  const element = document.createElement("div");
  element.className = `toast${error ? " error" : ""}`;
  element.textContent = message;
  toastRegion.append(element);
  window.setTimeout(() => element.remove(), 3400);
}

function setSession(payload) {
  state.token = payload.token;
  state.user = payload.user;
  sessionStorage.setItem("leavewise-token", payload.token);
}

function renderAuth(mode = "login", departments = []) {
  const registering = mode === "register";
  app.innerHTML = `
    <main class="auth-screen">
      <section class="auth-art">
        <div class="brand"><div class="brand-mark">l</div><div class="brand-name">leave<span>wise</span></div></div>
        <div class="auth-message">
          <div class="eyebrow" style="color:#ddd7ff">A little more breathing room</div>
          <h1>Time off, made clear.</h1>
          <p>One calm place to plan your time away, keep track of your days, and stay in sync with your team.</p>
        </div>
        <div class="auth-quote">Thoughtful time-off management for teams that care.</div>
      </section>
      <section class="auth-main">
        <div class="auth-box">
          <div class="eyebrow">${registering ? "YOUR NEXT CHAPTER" : "WELCOME BACK"}</div>
          <h2>${registering ? "Create your account" : "Sign in to Leavewise"}</h2>
          <p>${registering ? "Join your team and make time for what matters." : "Your team's time-off hub is ready when you are."}</p>
          ${window.location.protocol === "file:" ? `<div class="server-notice" role="status"><strong>Open Leavewise through its server</strong><span>You're viewing a local file. Start the app with <code>npm start</code>, then visit <a href="http://localhost:3001">http://localhost:3001</a>. MongoDB must be running too.</span></div>` : ""}
          <div class="auth-error" id="auth-error" role="alert"></div>
          <form id="auth-form" class="auth-form">
            ${registering ? `
              <div class="field"><label for="auth-name">Full name <span class="required">*</span></label><input class="input" id="auth-name" name="name" autocomplete="name" placeholder="e.g. Alex Morgan" required minlength="2"></div>
              <div class="field"><label for="auth-department">Department <span class="required">*</span></label>
                <select class="select" id="auth-department" name="department" required>
                  <option value="">Choose your department</option>${departments.map((dept) => `<option value="${escapeHtml(dept.name)}">${escapeHtml(dept.name)}</option>`).join("")}
                </select>
              </div>` : ""}
            <div class="field"><label for="auth-email">Work email <span class="required">*</span></label><input class="input" id="auth-email" name="email" type="email" autocomplete="email" placeholder="you@company.com" required></div>
            <div class="field"><label for="auth-password">Password <span class="required">*</span></label><input class="input" id="auth-password" name="password" type="password" autocomplete="${registering ? "new-password" : "current-password"}" placeholder="${registering ? "At least 8 characters" : "Enter your password"}" minlength="${registering ? 8 : 1}" required></div>
            <button type="submit" class="button button-primary">${registering ? "Create account" : "Sign in"} <span>→</span></button>
          </form>
          <div class="auth-switch">${registering ? "Already have an account?" : "New to Leavewise?"}
            <button type="button" data-auth-mode="${registering ? "login" : "register"}">${registering ? "Sign in" : "Create an account"}</button>
          </div>
        </div>
      </section>
    </main>`;
}

async function loadDepartmentsPublic() {
  try {
    const result = await api("/api/public/departments");
    renderAuth("register", result.departments);
  } catch (error) {
    showAuthError(error.message);
  }
}

function showAuthError(message) {
  const error = document.getElementById("auth-error");
  if (error) {
    error.textContent = message;
    error.classList.add("visible");
  } else toast(message, true);
}

function navigationItems() {
  const common = [
    ["dashboard", "Overview"],
    ["apply", "Apply for leave"],
    ["requests", state.user.role === "admin" ? "Leave requests" : "My requests"],
  ];
  return state.user.role === "admin"
    ? [...common, ["employees", "Employees"], ["departments", "Departments"], ["reports", "Reports"], ["profile", "My profile"]]
    : [...common, ["profile", "My profile"]];
}

function shell(content, title, subtitle, action = "") {
  const nav = navigationItems();
  const pendingCount = state.dashboard?.summary?.pending || 0;
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar${state.sidebarOpen ? " open" : ""}">
        <a class="brand" href="#" data-page="dashboard"><div class="brand-mark">l</div><div class="brand-name">leave<span>wise</span></div></a>
        <div class="workspace-label">Workspace</div>
        <nav class="nav-list" aria-label="Main navigation">
          ${nav.map(([key, label]) => `<button class="nav-link${state.page === key ? " active" : ""}" type="button" data-page="${key}">
            <i class="nav-icon ${iconMap[key]}" aria-hidden="true"></i><span>${label}</span>
            ${key === "requests" && state.user.role === "admin" && pendingCount ? `<span class="nav-count">${pendingCount}</span>` : ""}
          </button>`).join("")}
        </nav>
        <div class="sidebar-bottom">
          <div class="help-card"><b>Need a hand?</b><p>Questions about your leave? Reach out to your People &amp; Culture team.</p></div>
          <div class="user-mini">
            <div class="avatar">${escapeHtml(initials(fullName()))}</div>
            <div class="user-mini-copy"><strong>${escapeHtml(fullName())}</strong><small>${state.user.role === "admin" ? "HR administrator" : escapeHtml(state.user.department)}</small></div>
            <button class="icon-button" type="button" data-action="logout" aria-label="Sign out" title="Sign out">↪</button>
          </div>
        </div>
      </aside>
      <section class="main-area">
        <header class="topbar">
          <div class="topbar-left"><button class="icon-button mobile-menu" type="button" data-action="menu" aria-label="Open menu">☰</button><span class="crumb">Workspace&nbsp; /</span><span class="crumb-current">${escapeHtml(title)}</span></div>
          <div class="topbar-right"><span class="today-label">${new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span><div class="avatar top-avatar">${escapeHtml(initials(fullName()))}</div></div>
        </header>
        <main class="content">
          <div class="page-heading"><div><div class="eyebrow">${state.user.role === "admin" ? "PEOPLE OPERATIONS" : "YOUR WORKSPACE"}</div><h1>${escapeHtml(title)}</h1><p class="page-subtitle">${escapeHtml(subtitle)}</p></div>${action}</div>
          ${content}
        </main>
      </section>
    </div>`;
}

function pageTitle(page = state.page) {
  const titles = {
    dashboard: "Good " + (new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"),
    apply: "Request time off",
    requests: state.user.role === "admin" ? "Leave requests" : "My requests",
    employees: "Your people",
    departments: "Departments",
    reports: "Leave insights",
    profile: "Your profile",
  };
  return titles[page] || "Leavewise";
}

function statusBadge(status) {
  return `<span class="status status-${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}

function avatarCell(person) {
  return `<div class="person-cell"><div class="avatar">${escapeHtml(initials(person.employeeName || person.name))}</div><div class="person-detail"><b>${escapeHtml(person.employeeName || person.name)}</b><small>${escapeHtml(person.employeeId || person.email || "")}</small></div></div>`;
}

function leaveTable(rows, admin = false, compact = false) {
  if (!rows.length) return `<div class="empty-state"><div class="empty-icon">▤</div>No leave requests to show yet.</div>`;
  const headings = `${admin ? "<th>Employee</th>" : ""}<th>Leave type</th><th>Dates</th><th>Days</th><th>Status</th>${admin && !compact ? "<th>Action</th>" : ""}`;
  const body = rows.map((leave) => {
    const employee = admin ? `<td>${avatarCell(leave)}</td>` : "";
    const dates = `${dateText(leave.startDate, { month: "short", day: "numeric" })} – ${dateText(leave.endDate, { month: "short", day: "numeric", year: "numeric" })}`;
    const action = admin && !compact
      ? `<td><div class="row-actions"><button class="text-link" data-action="leave-details" data-id="${leave._id}">Details</button>${leave.status === "pending" ? `<button class="button button-primary button-small" data-action="approve" data-id="${leave._id}">Approve</button><button class="button button-quiet button-small" data-action="reject" data-id="${leave._id}">Review</button>` : ""}</div></td>`
      : "";
    const cancel = !admin && leave.status === "pending" && !compact
      ? `<button class="button button-quiet button-small" data-action="cancel-leave" data-id="${leave._id}">Cancel</button>` : "";
    return `<tr>${employee}<td><strong>${escapeHtml(leaveLabel(leave.leaveType))}</strong>${leave.documentFilename ? `<div class="field-hint"><button class="text-link" data-action="download-document" data-filename="${escapeHtml(leave.documentFilename)}" data-name="${escapeHtml(leave.documentOriginalName || "supporting-document")}">View document ↗</button></div>` : ""}</td><td>${dates}</td><td>${leave.days}</td><td>${statusBadge(leave.status)}</td>${action}${!admin && !compact ? `<td>${cancel}</td>` : ""}</tr>`;
  }).join("");
  const cancelHeader = !admin && !compact ? "<th></th>" : "";
  return `<div class="table-wrap"><table><thead><tr>${headings}${cancelHeader}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function balanceMarkup(user = state.user) {
  const balances = user?.balances || {};
  return `<div class="balance-list">${balanceTypes.map((key, index) => {
    const total = Number(balances[key] ?? 0);
    const used = Math.max(0, (index === 0 ? 12 : index === 1 ? 10 : index === 2 ? 15 : index === 3 ? 90 : 10) - total);
    const maximum = index === 3 ? 90 : index === 4 ? 10 : index === 0 ? 12 : index === 1 ? 10 : 15;
    const fill = maximum ? Math.min(100, Math.round(total / maximum * 100)) : 0;
    return `<div><div class="balance-row-head"><div class="balance-name"><span class="balance-dot ${leaveColors[index]}"></span>${leaveLabel(key)}</div><span class="balance-meta"><b>${total}</b> days left · ${used} used</span></div><div class="progress-track"><div class="progress-fill ${leaveColors[index]}" style="width:${fill}%"></div></div></div>`;
  }).join("")}</div>`;
}

function statsMarkup(items, columns = 4) {
  return `<div class="stats-grid${columns === 5 ? " stats-five" : ""}">${items.map((item) => `<article class="stat-card">
    <div class="stat-top"><span>${escapeHtml(item.label)}</span><span class="stat-icon ${item.color || ""}">${item.icon}</span></div>
    <div class="stat-value">${escapeHtml(item.value)}</div><div class="stat-note">${escapeHtml(item.note)}</div>
  </article>`).join("")}</div>`;
}

function monthSeries(leaves) {
  const now = new Date();
  return Array.from({ length: 6 }, (_value, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const count = leaves.filter((leave) => {
      const date = dateValue(leave.createdAt);
      return date && date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear();
    }).length;
    return { label: month.toLocaleDateString(undefined, { month: "short" }), count };
  });
}

function chartMarkup(leaves) {
  const series = monthSeries(leaves);
  const peak = Math.max(1, ...series.map((item) => item.count));
  const points = series.map((item, index) => {
    const x = 12 + index * 75;
    const y = 130 - (item.count / peak) * 92;
    return `${x},${y}`;
  });
  const pointMarkup = series.map((item, index) => {
    const x = 12 + index * 75;
    const y = 130 - (item.count / peak) * 92;
    return `<circle cx="${x}" cy="${y}" r="3.5" fill="#fff" stroke="#6858df" stroke-width="2"/><text x="${x}" y="157" text-anchor="middle" fill="#a5a8b5" font-size="9">${item.label}</text>`;
  }).join("");
  return `<div class="chart-area"><svg viewBox="0 0 390 165" role="img" aria-label="Monthly leave request trend">
    <defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#8172ed" stop-opacity=".18"/><stop offset="100%" stop-color="#8172ed" stop-opacity="0"/></linearGradient></defs>
    <path d="M${points.join(" L")} L387,145 L12,145 Z" fill="url(#chart-fill)"/>
    <polyline points="${points.join(" ")}" fill="none" stroke="#6858df" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="8" y1="145" x2="386" y2="145" stroke="#eff0f5"/>
    ${pointMarkup}
  </svg></div>`;
}

function dashboardView() {
  const summary = state.dashboard?.summary || {};
  const requests = state.dashboard?.recent || [];
  const isAdmin = state.user.role === "admin";
  const stats = isAdmin
    ? [
      { label: "Active employees", value: summary.totalEmployees || 0, note: "Across all departments", icon: "♧", color: "" },
      { label: "Total requests", value: summary.totalRequests || 0, note: "All-time applications", icon: "▤", color: "blue" },
      { label: "Awaiting review", value: summary.pending || 0, note: "Needs your attention", icon: "◷", color: "orange" },
      { label: "Approved", value: summary.approved || 0, note: "Requests approved", icon: "✓", color: "green" },
      { label: "Declined", value: summary.rejected || 0, note: "Requests declined", icon: "×", color: "" },
    ]
    : [
      { label: "Days available", value: balanceTypes.reduce((sum, type) => sum + Number(state.user.balances?.[type] || 0), 0), note: "Across paid leave types", icon: "◷", color: "" },
      { label: "Pending requests", value: summary.pending || 0, note: "Waiting for a decision", icon: "◌", color: "orange" },
      { label: "Approved", value: summary.approved || 0, note: "Time away confirmed", icon: "✓", color: "green" },
      { label: "Total requests", value: summary.totalRequests || 0, note: "Your applications", icon: "▤", color: "blue" },
    ];
  const greetingName = escapeHtml(fullName().split(" ")[0]);
  const title = `${pageTitle()}${isAdmin ? "" : `, ${greetingName}`}`;
  const subtitle = isAdmin
    ? "A clear view of your team's time away and what's next."
    : "Here's your time-off overview. Make space for what matters.";
  const availableLeaves = requests.filter((leave) => leave.status === "pending");
  const actions = isAdmin
    ? `<button class="button button-primary" type="button" data-page="requests">Review requests <span>→</span></button>`
    : `<button class="button button-primary" type="button" data-page="apply">＋ Request time off</button>`;
  const chartPanel = `<section class="panel"><div class="panel-heading"><div><h2 class="panel-title">${isAdmin ? "Leave activity" : "Your leave activity"}</h2><p class="panel-subtitle">Requests created over the last six months</p></div><span class="stat-icon">⌁</span></div>${chartMarkup(state.leaves)}</section>`;
  const balancePanel = isAdmin
    ? `<section class="panel"><div class="panel-heading"><div><h2 class="panel-title">Needs your attention</h2><p class="panel-subtitle">${availableLeaves.length} request${availableLeaves.length === 1 ? "" : "s"} awaiting a decision</p></div><button class="text-link" data-page="requests">View all →</button></div>${availableLeaves.length ? leaveTable(availableLeaves.slice(0, 3), true, true) : `<div class="empty-state"><div class="empty-icon">✓</div>You're all caught up.</div>`}</section>`
    : `<section class="panel"><div class="panel-heading"><div><h2 class="panel-title">Your leave balance</h2><p class="panel-subtitle">Available days for this year</p></div><span class="stat-icon">◷</span></div>${balanceMarkup()}</section>`;
  const tableSection = `<section class="panel"><div class="panel-heading"><div><h2 class="panel-title">${isAdmin ? "Recent requests" : "Recent time off"}</h2><p class="panel-subtitle">${isAdmin ? "The latest activity across your team" : "Your latest leave applications"}</p></div><button class="text-link" data-page="requests">View all →</button></div>${leaveTable(requests, isAdmin, true)}</section>`;
  return {
    title,
    subtitle,
    action: actions,
    content: `${statsMarkup(stats, isAdmin ? 5 : 4)}<div class="dashboard-grid"><div class="layout-stack">${tableSection}${chartPanel}</div><div class="layout-stack">${balancePanel}${isAdmin ? `<section class="panel"><div class="panel-heading"><div><h2 class="panel-title">Quick actions</h2><p class="panel-subtitle">Manage your people operations</p></div></div><div class="layout-stack"><button class="button button-quiet" data-page="employees">＋ &nbsp;Add an employee</button><button class="button button-quiet" data-page="departments">▦ &nbsp;Manage departments</button><button class="button button-quiet" data-page="reports">⌁ &nbsp;View leave reports</button></div></section>` : ""}</div></div>`,
  };
}

function applyView() {
  const form = `<div class="form-card"><section class="panel">
    <div class="form-callout"><span>✦</span><div><strong>A quick note before you start</strong>Leave is counted in calendar days, including the first and last day. Your manager will be notified once you submit.</div></div>
    <form id="leave-form">
      <div class="form-grid">
        <div class="field"><label>Employee ID</label><input class="input" value="${escapeHtml(state.user.employeeId)}" readonly></div>
        <div class="field"><label>Employee name</label><input class="input" value="${escapeHtml(state.user.name)}" readonly></div>
        <div class="field"><label>Department</label><input class="input" value="${escapeHtml(state.user.department)}" readonly></div>
        <div class="field"><label for="leave-type">Leave type <span class="required">*</span></label><select class="select" id="leave-type" name="leaveType" required><option value="">Choose a leave type</option>${leaveTypes.map(([key, label]) => `<option value="${key}">${label}${key !== "unpaid" && state.user.balances?.[key] !== undefined ? ` · ${state.user.balances[key]} days available` : ""}</option>`).join("")}</select></div>
        <div class="field"><label for="start-date">Start date <span class="required">*</span></label><input class="input" id="start-date" name="startDate" type="date" min="${todayISO()}" required></div>
        <div class="field"><label for="end-date">End date <span class="required">*</span></label><input class="input" id="end-date" name="endDate" type="date" min="${todayISO()}" required></div>
        <div class="field full"><div class="days-preview"><span>Duration</span><strong id="days-preview">Choose your dates</strong></div></div>
        <div class="field full"><label for="leave-reason">Reason for leave <span class="required">*</span></label><textarea class="textarea" id="leave-reason" name="reason" placeholder="Share a little context with your manager…" required minlength="3" maxlength="2000"></textarea></div>
        <div class="field full"><label for="leave-document">Supporting document <span class="subtle">(optional)</span></label><input class="input" id="leave-document" name="document" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"><span class="field-hint">PDF, PNG or JPG · up to 5 MB</span></div>
      </div>
      <div class="form-actions"><button class="button button-quiet" type="button" data-page="dashboard">Cancel</button><button class="button button-primary" type="submit">Submit request <span>→</span></button></div>
    </form>
  </section></div>`;
  return { title: "Request time off", subtitle: "A few details, and your request is on its way.", content: form };
}

function requestView() {
  const isAdmin = state.user.role === "admin";
  const statusFilter = document.getElementById("request-status")?.value || "";
  const employeeFilter = document.getElementById("request-employee")?.value || "";
  const departmentFilter = document.getElementById("request-department")?.value || "";
  const fromFilter = document.getElementById("request-from")?.value || "";
  const toFilter = document.getElementById("request-to")?.value || "";
  const filters = `<div class="filter-row">
    <select class="select" id="request-status"><option value="">All statuses</option>${["pending", "approved", "rejected", "cancelled"].map((item) => `<option value="${item}" ${statusFilter === item ? "selected" : ""}>${item[0].toUpperCase()}${item.slice(1)}</option>`).join("")}</select>
    ${isAdmin ? `<input class="input" id="request-employee" placeholder="Employee ID" value="${escapeHtml(employeeFilter)}"><select class="select" id="request-department"><option value="">All departments</option>${state.departments.map((dept) => `<option value="${escapeHtml(dept.name)}" ${departmentFilter === dept.name ? "selected" : ""}>${escapeHtml(dept.name)}</option>`).join("")}</select><input class="input" id="request-from" type="date" aria-label="From date" value="${escapeHtml(fromFilter)}"><input class="input" id="request-to" type="date" aria-label="To date" value="${escapeHtml(toFilter)}">` : ""}
    <button class="button button-quiet button-small" data-action="clear-filters">Clear filters</button>
  </div>`;
  const action = isAdmin ? `<button class="button button-primary" data-action="export-csv">↓ &nbsp;Export CSV</button>` : `<button class="button button-primary" data-page="apply">＋ Request time off</button>`;
  return {
    title: isAdmin ? "Leave requests" : "My requests",
    subtitle: isAdmin ? "Review applications and keep your team moving." : "Every request, all in one place. You're always in the loop.",
    action,
    content: `<section class="panel">${filters}<div id="request-table">${leaveTable(state.leaves, isAdmin)}</div></section>`,
  };
}

function employeesView() {
  const rows = state.employees.map((employee) => `<tr>
    <td>${avatarCell(employee)}</td><td>${escapeHtml(employee.department)}</td><td>${escapeHtml(employee.email)}</td><td>${escapeHtml(employee.phone || "—")}</td>
    <td><button class="text-link" data-action="employee-history" data-id="${employee.id}">View history</button></td>
    <td><div class="row-actions"><button class="button button-quiet button-small" data-action="edit-employee" data-id="${employee.id}">Edit</button><button class="button button-quiet button-small" data-action="edit-balance" data-id="${employee.id}">Balance</button><button class="icon-button" data-action="delete-employee" data-id="${employee.id}" title="Deactivate employee" aria-label="Deactivate employee">×</button></div></td>
  </tr>`).join("");
  const content = `<section class="panel"><div class="panel-heading"><div><h2 class="panel-title">Your team</h2><p class="panel-subtitle">${state.employees.length} active employees</p></div><button class="button button-primary button-small" data-action="add-employee">＋ Add employee</button></div>
    ${state.employees.length ? `<div class="table-wrap"><table><thead><tr><th>Employee</th><th>Department</th><th>Email</th><th>Phone</th><th>Leave history</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty-state"><div class="empty-icon">♧</div>No active employees yet. Add your first teammate.</div>`}
  </section>`;
  return { title: "Your people", subtitle: "Manage employee details, leave balances, and records.", action: `<button class="button button-primary" data-action="add-employee">＋ Add employee</button>`, content };
}

function departmentsView() {
  const counts = state.employees.reduce((map, employee) => {
    map[employee.department] = (map[employee.department] || 0) + 1;
    return map;
  }, {});
  const cards = state.departments.map((dept) => `<article class="panel dept-card">
    <div class="dept-card-top"><span class="dept-count">${counts[dept.name] || 0} ${counts[dept.name] === 1 ? "person" : "people"}</span><div class="row-actions"><button class="icon-button" title="Rename department" data-action="edit-department" data-id="${dept._id}" aria-label="Rename department">✎</button><button class="icon-button" title="Remove department" data-action="delete-department" data-id="${dept._id}" aria-label="Remove department">×</button></div></div>
    <h3>${escapeHtml(dept.name)}</h3><p>Department</p>
  </article>`).join("");
  const content = `<div class="dept-grid">${cards || `<section class="panel empty-state">No departments yet.</section>`}</div>`;
  return { title: "Departments", subtitle: "Keep your organization and its teams up to date.", action: `<button class="button button-primary" data-action="add-department">＋ Add department</button>`, content };
}

function reportsView() {
  const approved = state.leaves.filter((leave) => leave.status === "approved").length;
  const pending = state.leaves.filter((leave) => leave.status === "pending").length;
  const rejected = state.leaves.filter((leave) => leave.status === "rejected").length;
  const days = state.leaves.filter((leave) => leave.status === "approved").reduce((sum, leave) => sum + leave.days, 0);
  const byType = leaveTypes.map(([key, label], index) => {
    const count = state.leaves.filter((leave) => leave.leaveType === key).length;
    const percent = state.leaves.length ? Math.round(count / state.leaves.length * 100) : 0;
    return `<div><div class="balance-row-head"><div class="balance-name"><span class="balance-dot ${leaveColors[index]}"></span>${label}</div><span class="balance-meta">${count} requests</span></div><div class="progress-track"><div class="progress-fill ${leaveColors[index]}" style="width:${percent}%"></div></div></div>`;
  }).join("");
  return {
    title: "Leave insights",
    subtitle: "A snapshot of leave trends across your organization.",
    action: `<button class="button button-primary" data-action="export-csv">↓ &nbsp;Export CSV</button>`,
    content: `${statsMarkup([
      { label: "Requests reviewed", value: approved + rejected, note: `${approved} approved · ${rejected} declined`, icon: "✓", color: "green" },
      { label: "Awaiting review", value: pending, note: "Pending applications", icon: "◷", color: "orange" },
      { label: "Approved days", value: days, note: "Calendar days approved", icon: "▤", color: "blue" },
      { label: "Team size", value: state.employees.length, note: "Active employees", icon: "♧", color: "" },
    ])}<div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><h2 class="panel-title">Leave activity</h2><p class="panel-subtitle">Requests created over the last six months</p></div></div>${chartMarkup(state.leaves)}</section><section class="panel"><div class="panel-heading"><div><h2 class="panel-title">Requests by leave type</h2><p class="panel-subtitle">All requests in your organization</p></div></div><div class="balance-list">${byType}</div></section></div><section class="panel" style="margin-top:17px"><div class="panel-heading"><div><h2 class="panel-title">Recent requests</h2><p class="panel-subtitle">Use the leave requests page to filter employee, department, dates, and status.</p></div><button class="text-link" data-page="requests">View requests →</button></div>${leaveTable(state.leaves.slice(0, 8), true, true)}</section>`,
  };
}

function profileView() {
  const user = state.user;
  return {
    title: "Your profile",
    subtitle: "Your details and team information, all in one place.",
    content: `<div class="profile-grid">
      <section class="panel profile-card"><div class="avatar profile-avatar">${escapeHtml(initials(user.name))}</div><h2>${escapeHtml(user.name)}</h2><p>${user.role === "admin" ? "HR administrator" : escapeHtml(user.department)}</p><div class="profile-meta">
        <div class="meta-row"><span>Employee ID</span><strong>${escapeHtml(user.employeeId)}</strong></div><div class="meta-row"><span>Department</span><strong>${escapeHtml(user.department)}</strong></div><div class="meta-row"><span>Account type</span><strong>${user.role === "admin" ? "Administrator" : "Employee"}</strong></div>
      </div></section>
      <section class="panel"><div class="panel-heading"><div><h2 class="panel-title">Personal details</h2><p class="panel-subtitle">Update how your team can reach you.</p></div></div>
        <form id="profile-form"><div class="form-grid">
          <div class="field"><label for="profile-name">Full name</label><input class="input" id="profile-name" name="name" required minlength="2" value="${escapeHtml(user.name)}"></div>
          <div class="field"><label for="profile-email">Work email</label><input class="input" id="profile-email" name="email" type="email" required value="${escapeHtml(user.email)}"></div>
          <div class="field"><label for="profile-phone">Phone number</label><input class="input" id="profile-phone" name="phone" type="tel" maxlength="30" value="${escapeHtml(user.phone || "")}" placeholder="+1 555 0100"></div>
          <div class="field"><label>Department</label><input class="input" value="${escapeHtml(user.department)}" readonly></div>
        </div><div class="form-actions"><button class="button button-primary" type="submit">Save changes</button></div></form>
      </section>
      ${user.role !== "admin" ? `<section class="panel"><div class="panel-heading"><div><h2 class="panel-title">Leave balance</h2><p class="panel-subtitle">Your remaining paid leave days.</p></div></div>${balanceMarkup(user)}</section>` : ""}
    </div>`,
  };
}

async function renderPage() {
  if (!state.user) return renderAuth();
  const page = state.page;
  let view;
  if (page === "dashboard") view = dashboardView();
  else if (page === "apply") view = applyView();
  else if (page === "requests") view = requestView();
  else if (page === "employees") view = employeesView();
  else if (page === "departments") view = departmentsView();
  else if (page === "reports") view = reportsView();
  else view = profileView();
  shell(view.content, view.title, view.subtitle, view.action || "");
  if (page === "apply") updateDaysPreview();
}

async function refreshPage() {
  try {
    state.dashboard = await api("/api/dashboard");
    if (state.user.role === "admin") {
      const [leaveData, employeeData, departmentData] = await Promise.all([
        api("/api/leaves"), api("/api/employees"), api("/api/departments"),
      ]);
      state.leaves = leaveData.leaves;
      state.employees = employeeData.employees;
      state.departments = departmentData.departments;
    } else {
      const [leaveData, departmentData] = await Promise.all([api("/api/leaves"), api("/api/departments")]);
      state.leaves = leaveData.leaves;
      state.departments = departmentData.departments;
      state.user = state.dashboard.user;
    }
    await renderPage();
  } catch (error) {
    toast(error.message, true);
    if (state.user) await renderPage();
  }
}

async function go(page) {
  state.page = page;
  state.sidebarOpen = false;
  await refreshPage();
}

function updateDaysPreview() {
  const start = document.getElementById("start-date")?.value;
  const end = document.getElementById("end-date")?.value;
  const preview = document.getElementById("days-preview");
  if (!preview) return;
  if (!start || !end || end < start) {
    preview.textContent = start && end ? "End date must be on or after start date" : "Choose your dates";
    return;
  }
  const dayCount = Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
  preview.textContent = `${dayCount} calendar ${dayCount === 1 ? "day" : "days"}`;
}

function showModal(title, subtitle, body) {
  document.querySelector(".modal-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-header"><div><h2 id="modal-title">${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div><button class="modal-close" type="button" data-action="close-modal" aria-label="Close dialog">×</button></div>${body}
  </section>`;
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) backdrop.remove();
  });
  app.append(backdrop);
}

function employeeForm(employee = null) {
  const editing = Boolean(employee);
  showModal(editing ? "Edit employee" : "Add an employee", editing ? "Update your teammate's details." : "Create an account for a new teammate.", `
    <form id="employee-form" data-id="${editing ? employee.id : ""}">
      <div class="form-grid">
        <div class="field full"><label>Full name</label><input class="input" name="name" required minlength="2" value="${escapeHtml(employee?.name || "")}"></div>
        <div class="field"><label>Work email</label><input class="input" name="email" type="email" required value="${escapeHtml(employee?.email || "")}"></div>
        <div class="field"><label>Department</label><select class="select" name="department" required>${state.departments.map((dept) => `<option value="${escapeHtml(dept.name)}" ${employee?.department === dept.name ? "selected" : ""}>${escapeHtml(dept.name)}</option>`).join("")}</select></div>
        <div class="field"><label>Phone</label><input class="input" name="phone" maxlength="30" value="${escapeHtml(employee?.phone || "")}"></div>
        ${editing ? "" : `<div class="field"><label>Temporary password</label><input class="input" name="password" type="password" minlength="8" required autocomplete="new-password"><span class="field-hint">At least 8 characters. Share this securely with the employee.</span></div>`}
      </div>
      <div class="form-actions"><button class="button button-quiet" type="button" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">${editing ? "Save changes" : "Create employee"}</button></div>
    </form>`);
}

function balanceForm(employee) {
  showModal("Manage leave balance", employee.name, `<form id="balance-form" data-id="${employee.id}">
    <div class="form-grid">${balanceTypes.map((key) => `<div class="field"><label>${leaveLabel(key)} · days</label><input class="input" type="number" min="0" max="365" step="0.5" name="${key}" value="${Number(employee.balances?.[key] || 0)}" required></div>`).join("")}</div>
    <div class="form-actions"><button class="button button-quiet" type="button" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">Save balances</button></div>
  </form>`);
}

function departmentForm(department = null) {
  const editing = Boolean(department);
  showModal(editing ? "Rename department" : "Add a department", "Keep your teams organized.", `<form id="department-form" data-id="${editing ? department._id : ""}">
    <div class="field"><label>Department name</label><input class="input" name="name" required minlength="2" maxlength="80" value="${escapeHtml(department?.name || "")}" placeholder="e.g. Customer success"></div>
    <div class="form-actions"><button class="button button-quiet" type="button" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">${editing ? "Save changes" : "Add department"}</button></div>
  </form>`);
}

async function showEmployeeHistory(employee) {
  try {
    const response = await api(`/api/leaves?employeeId=${encodeURIComponent(employee.employeeId)}`);
    showModal(`${employee.name}'s leave history`, `${employee.employeeId} · ${employee.department}`, leaveTable(response.leaves, false, true));
  } catch (error) { toast(error.message, true); }
}

function showLeaveDetails(leave) {
  const documentButton = leave.documentFilename
    ? `<div class="field"><label>Supporting document</label><button class="text-link" type="button" data-action="download-document" data-filename="${escapeHtml(leave.documentFilename)}" data-name="${escapeHtml(leave.documentOriginalName || "supporting-document")}">Download ${escapeHtml(leave.documentOriginalName || "attachment")} ↗</button></div>`
    : "";
  const reviewerNote = leave.reviewerNote
    ? `<div class="field"><label>Review note</label><div class="days-preview" style="justify-content:flex-start;white-space:pre-wrap">${escapeHtml(leave.reviewerNote)}</div></div>`
    : "";
  showModal("Leave request details", `${leave.employeeName} · ${leave.employeeId}`, `<div class="layout-stack">
    <div class="form-grid">
      <div class="field"><label>Department</label><div class="days-preview">${escapeHtml(leave.department)}</div></div>
      <div class="field"><label>Leave type</label><div class="days-preview">${escapeHtml(leaveLabel(leave.leaveType))}</div></div>
      <div class="field"><label>Dates</label><div class="days-preview">${dateText(leave.startDate)} – ${dateText(leave.endDate)}</div></div>
      <div class="field"><label>Duration &amp; status</label><div class="days-preview">${leave.days} calendar ${leave.days === 1 ? "day" : "days"} · ${statusBadge(leave.status)}</div></div>
    </div>
    <div class="field"><label>Reason</label><div class="days-preview" style="justify-content:flex-start;white-space:pre-wrap">${escapeHtml(leave.reason)}</div></div>
    ${documentButton}${reviewerNote}
  </div>`);
}

function downloadCsv() {
  const headings = ["Employee ID", "Employee", "Department", "Leave type", "Start date", "End date", "Days", "Status", "Reason"];
  const rows = state.leaves.map((leave) => [
    leave.employeeId, leave.employeeName, leave.department, leaveLabel(leave.leaveType),
    dateText(leave.startDate), dateText(leave.endDate), leave.days, leave.status, leave.reason,
  ]);
  const csv = [headings, ...rows].map((row) => row.map((field) => {
    let value = String(field ?? "");
    if (/^\s*[=+\-@]/.test(value)) value = `'${value}`;
    return `"${value.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `leave-report-${todayISO()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast("Your report has been exported.");
}

app.addEventListener("click", async (event) => {
  const pageButton = event.target.closest("[data-page]");
  if (pageButton) {
    event.preventDefault();
    await go(pageButton.dataset.page);
    return;
  }
  const control = event.target.closest("[data-action]");
  if (!control) return;
  const { action, id } = control.dataset;
  try {
    if (action === "menu") {
      state.sidebarOpen = !state.sidebarOpen;
      document.querySelector(".sidebar")?.classList.toggle("open", state.sidebarOpen);
    } else if (action === "logout") {
      sessionStorage.removeItem("leavewise-token");
      state.token = null;
      state.user = null;
      renderAuth();
    } else if (action === "close-modal") {
      document.querySelector(".modal-backdrop")?.remove();
    } else if (action === "add-employee") {
      employeeForm();
    } else if (action === "edit-employee") {
      employeeForm(state.employees.find((employee) => employee.id === id));
    } else if (action === "edit-balance") {
      balanceForm(state.employees.find((employee) => employee.id === id));
    } else if (action === "employee-history") {
      await showEmployeeHistory(state.employees.find((employee) => employee.id === id));
    } else if (action === "leave-details") {
      showLeaveDetails(state.leaves.find((leave) => leave._id === id));
    } else if (action === "delete-employee") {
      const employee = state.employees.find((item) => item.id === id);
      if (employee && window.confirm(`Deactivate ${employee.name}? Their leave history will be retained.`)) {
        await api(`/api/employees/${id}`, { method: "DELETE" });
        toast("Employee deactivated.");
        await refreshPage();
      }
    } else if (action === "add-department") {
      departmentForm();
    } else if (action === "edit-department") {
      departmentForm(state.departments.find((department) => department._id === id));
    } else if (action === "delete-department") {
      const department = state.departments.find((item) => item._id === id);
      if (department && window.confirm(`Remove ${department.name}? Departments with active employees cannot be removed.`)) {
        await api(`/api/departments/${id}`, { method: "DELETE" });
        toast("Department removed.");
        await refreshPage();
      }
    } else if (action === "approve") {
      await api(`/api/leaves/${id}`, { method: "PATCH", body: JSON.stringify({ status: "approved" }) });
      toast("Leave request approved.");
      await refreshPage();
    } else if (action === "reject") {
      const leave = state.leaves.find((item) => item._id === id);
      showModal("Decline this request?", `${leave?.employeeName || "Employee"} · ${leaveLabel(leave?.leaveType)}`, `<form id="review-form" data-id="${id}">
        <div class="field"><label for="review-note">Reason for declining <span class="required">*</span></label><textarea class="textarea" id="review-note" name="reviewerNote" required minlength="2" maxlength="500" placeholder="Share a brief explanation with the employee…"></textarea></div>
        <div class="form-actions"><button class="button button-quiet" type="button" data-action="close-modal">Go back</button><button class="button button-danger" type="submit">Decline request</button></div>
      </form>`);
    } else if (action === "cancel-leave") {
      if (window.confirm("Cancel this pending leave request?")) {
        await api(`/api/leaves/${id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) });
        toast("Your request has been cancelled.");
        await refreshPage();
      }
    } else if (action === "export-csv") {
      downloadCsv();
    } else if (action === "download-document") {
      const response = await fetch(`/api/attachments/${encodeURIComponent(control.dataset.filename)}`, {
        headers: { Authorization: `Bearer ${state.token}` },
      });
      if (!response.ok) {
        let payload;
        try {
          payload = await response.json();
        } catch {
          throw new Error("The server returned an unreadable response.");
        }
        throw new Error(payload.message || "The attachment could not be downloaded.");
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(await response.blob());
      link.download = control.dataset.name || "supporting-document";
      link.click();
      URL.revokeObjectURL(link.href);
    } else if (action === "clear-filters") {
      await go("requests");
    }
  } catch (error) {
    toast(error.message, true);
  }
});

app.addEventListener("input", (event) => {
  if (event.target.id === "start-date" || event.target.id === "end-date") updateDaysPreview();
});
app.addEventListener("change", async (event) => {
  if (["request-status", "request-department", "request-from", "request-to"].includes(event.target.id)) {
    await applyRequestFilters();
  }
});
app.addEventListener("keydown", async (event) => {
  if (event.key === "Enter" && event.target.id === "request-employee") await applyRequestFilters();
});

async function applyRequestFilters() {
  const params = new URLSearchParams();
  const entries = [
    ["status", "request-status"], ["employeeId", "request-employee"],
    ["department", "request-department"], ["from", "request-from"], ["to", "request-to"],
  ];
  for (const [key, id] of entries) {
    const value = document.getElementById(id)?.value;
    if (value) params.set(key, value);
  }
  try {
    const response = await api(`/api/leaves?${params}`);
    state.leaves = response.leaves;
    const table = document.getElementById("request-table");
    if (table) table.innerHTML = leaveTable(state.leaves, state.user.role === "admin");
  } catch (error) { toast(error.message, true); }
}

app.addEventListener("submit", async (event) => {
  const form = event.target;
  event.preventDefault();
  try {
    if (form.id === "auth-form") {
      const data = Object.fromEntries(new FormData(form).entries());
      const registering = Boolean(data.name);
      const payload = await api(registering ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      });
      setSession(payload);
      state.page = "dashboard";
      await refreshPage();
    } else if (form.id === "leave-form") {
      const formData = new FormData(form);
      const payload = await api("/api/leaves", { method: "POST", body: formData });
      toast(`Your ${leaveLabel(payload.leave.leaveType).toLowerCase()} request has been sent.`);
      await go("requests");
    } else if (form.id === "profile-form") {
      const payload = await api("/api/me", { method: "PATCH", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      state.user = payload.user;
      toast("Your profile has been updated.");
      await refreshPage();
    } else if (form.id === "employee-form") {
      const id = form.dataset.id;
      const data = Object.fromEntries(new FormData(form).entries());
      await api(id ? `/api/employees/${id}` : "/api/employees", { method: id ? "PATCH" : "POST", body: JSON.stringify(data) });
      document.querySelector(".modal-backdrop")?.remove();
      toast(id ? "Employee details updated." : "Employee account created.");
      await refreshPage();
    } else if (form.id === "balance-form") {
      const data = Object.fromEntries([...new FormData(form).entries()].map(([key, value]) => [key, Number(value)]));
      await api(`/api/employees/${form.dataset.id}/balances`, { method: "PATCH", body: JSON.stringify(data) });
      document.querySelector(".modal-backdrop")?.remove();
      toast("Leave balances updated.");
      await refreshPage();
    } else if (form.id === "department-form") {
      const id = form.dataset.id;
      const data = Object.fromEntries(new FormData(form).entries());
      await api(id ? `/api/departments/${id}` : "/api/departments", { method: id ? "PATCH" : "POST", body: JSON.stringify(data) });
      document.querySelector(".modal-backdrop")?.remove();
      toast(id ? "Department renamed." : "Department added.");
      await refreshPage();
    } else if (form.id === "review-form") {
      const data = Object.fromEntries(new FormData(form).entries());
      await api(`/api/leaves/${form.dataset.id}`, { method: "PATCH", body: JSON.stringify({ ...data, status: "rejected" }) });
      document.querySelector(".modal-backdrop")?.remove();
      toast("Request declined and employee notified.");
      await refreshPage();
    }
  } catch (error) {
    if (form.id === "auth-form") showAuthError(error.message);
    else toast(error.message, true);
  }
});

app.addEventListener("click", async (event) => {
  const modeButton = event.target.closest("[data-auth-mode]");
  if (!modeButton) return;
  if (modeButton.dataset.authMode === "register") await loadDepartmentsPublic();
  else renderAuth("login");
});

async function bootstrap() {
  if (!state.token) return renderAuth();
  try {
    const result = await api("/api/me");
    state.user = result.user;
    await refreshPage();
  } catch (error) {
    renderAuth();
    toast(error.message, true);
  }
}

bootstrap();
