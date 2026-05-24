const PEOPLE = ["성진", "소원"];
const STORAGE_KEY = "couple-budget-board-v1";
const SUPABASE_TABLE = "boards";

let state = {
  months: {},
  posts: [],
};
const supabaseConfig = window.MONEY_BOARD_SUPABASE || {};
const cloudStorageEnabled = Boolean(supabaseConfig.url && supabaseConfig.anonKey && supabaseConfig.boardId);

const els = {
  monthInput: document.querySelector("#monthInput"),
  prevMonth: document.querySelector("#prevMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  entryForm: document.querySelector("#entryForm"),
  personInput: document.querySelector("#personInput"),
  incomeInput: document.querySelector("#incomeInput"),
  expenseInput: document.querySelector("#expenseInput"),
  savingsInput: document.querySelector("#savingsInput"),
  vooInput: document.querySelector("#vooInput"),
  stockInput: document.querySelector("#stockInput"),
  memoInput: document.querySelector("#memoInput"),
  totalIncome: document.querySelector("#totalIncome"),
  totalExpense: document.querySelector("#totalExpense"),
  totalSavings: document.querySelector("#totalSavings"),
  totalVoo: document.querySelector("#totalVoo"),
  totalStock: document.querySelector("#totalStock"),
  totalBalance: document.querySelector("#totalBalance"),
  reportMonth: document.querySelector("#reportMonth"),
  personReports: document.querySelector("#personReports"),
  historyTable: document.querySelector("#historyTable"),
  exportBtn: document.querySelector("#exportBtn"),
  importInput: document.querySelector("#importInput"),
  postForm: document.querySelector("#postForm"),
  postTitleInput: document.querySelector("#postTitleInput"),
  postUrlInput: document.querySelector("#postUrlInput"),
  postBodyInput: document.querySelector("#postBodyInput"),
  postList: document.querySelector("#postList"),
  commentTemplate: document.querySelector("#commentTemplate"),
};

init();

els.monthInput.addEventListener("change", () => {
  ensureMonth(els.monthInput.value);
  fillFormForPerson();
  render();
});

els.prevMonth.addEventListener("click", () => shiftMonth(-1));
els.nextMonth.addEventListener("click", () => shiftMonth(1));
els.personInput.addEventListener("change", fillFormForPerson);

els.entryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const month = els.monthInput.value;
  const person = els.personInput.value;

  ensureMonth(month);
  state.months[month][person] = {
    income: numberFrom(els.incomeInput),
    expense: numberFrom(els.expenseInput),
    savings: numberFrom(els.savingsInput),
    voo: numberFrom(els.vooInput),
    stock: numberFrom(els.stockInput),
    memo: els.memoInput.value.trim(),
  };

  await persist();
  render();
});

els.exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `couple-budget-board-${currentMonthKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

els.importInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const imported = JSON.parse(await file.text());
    if (!imported.months || !Array.isArray(imported.posts)) {
      throw new Error("지원하지 않는 파일 형식입니다.");
    }
    state.months = imported.months;
    state.posts = imported.posts;
    await persist();
    ensureMonth(els.monthInput.value);
    fillFormForPerson();
    render();
  } catch (error) {
    alert(error.message || "가져오기에 실패했습니다.");
  } finally {
    event.target.value = "";
  }
});

els.postForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.posts.unshift({
    id: createId(),
    title: els.postTitleInput.value.trim(),
    url: els.postUrlInput.value.trim(),
    body: els.postBodyInput.value.trim(),
    createdAt: new Date().toISOString(),
    comments: [],
  });
  els.postForm.reset();
  await persist();
  renderPosts();
});

async function init() {
  try {
    state = await loadState();
  } catch (error) {
    alert(error.message || "데이터를 불러오지 못했습니다.");
    state = loadLocalState();
  }

  els.monthInput.value = currentMonthKey();
  ensureMonth(els.monthInput.value);
  fillFormForPerson();
  render();
}

function render() {
  const month = els.monthInput.value;
  const rows = PEOPLE.map((person) => state.months[month][person]);
  const totals = sumRows(rows);

  els.totalIncome.textContent = won(totals.income);
  els.totalExpense.textContent = won(totals.expenseWithStock);
  els.totalSavings.textContent = won(totals.savings);
  els.totalVoo.textContent = won(totals.voo);
  els.totalStock.textContent = won(totals.stock);
  els.totalBalance.textContent = won(totals.balance);
  els.reportMonth.textContent = monthLabel(month);

  renderPersonReports(month);
  renderHistory();
  renderPosts();
}

function renderPersonReports(month) {
  els.personReports.innerHTML = PEOPLE.map((person) => {
    const item = state.months[month][person];
    const invested = item.savings + item.voo + item.stock;
    const balance = item.income - item.expense - invested;
    const ratio = item.income > 0 ? Math.min(100, Math.round((invested / item.income) * 100)) : 0;

    return `
      <article class="person-card">
        <h3>${person}</h3>
        <div class="metric"><span>월급</span><strong>${won(item.income)}</strong></div>
        <div class="metric"><span>생활비</span><strong>${won(item.expense)}</strong></div>
        <div class="metric"><span>적금</span><strong>${won(item.savings)}</strong></div>
        <div class="metric"><span>VOO</span><strong>${won(item.voo)}</strong></div>
        <div class="metric"><span>주식투자</span><strong>${won(item.stock)}</strong></div>
        <div class="metric"><span>지출 합계(생활비+VOO+주식)</span><strong>${won(item.expense + item.voo + item.stock)}</strong></div>
        <div class="ratio-bar" title="저축+투자율"><span style="width: ${ratio}%"></span></div>
        <div class="metric"><span>저축+투자율</span><strong>${ratio}%</strong></div>
        <div class="metric"><span>남는 돈</span><strong>${won(balance)}</strong></div>
        <p class="memo">${escapeHtml(item.memo) || "메모 없음"}</p>
      </article>
    `;
  }).join("");
}

function renderHistory() {
  const months = Object.keys(state.months).sort().reverse();

  if (months.length === 0) {
    els.historyTable.innerHTML = `<tr><td colspan="5" class="empty">저장된 기록이 없습니다.</td></tr>`;
    return;
  }

  els.historyTable.innerHTML = months.map((month) => {
    const totals = sumRows(PEOPLE.map((person) => state.months[month][person]));
    return `
      <tr>
        <td>${monthLabel(month)}</td>
        <td>${won(totals.income)}</td>
        <td>${won(totals.expenseWithStock)}</td>
        <td>${won(totals.savings + totals.voo)}</td>
        <td>${won(totals.balance)}</td>
      </tr>
    `;
  }).join("");
}

function renderPosts() {
  if (state.posts.length === 0) {
    els.postList.innerHTML = `<p class="empty">아직 게시물이 없습니다.</p>`;
    return;
  }

  els.postList.innerHTML = "";
  state.posts.forEach((post) => {
    const article = document.createElement("article");
    article.className = "post";
    article.innerHTML = `
      <h3>${escapeHtml(post.title)}</h3>
      ${post.url ? `<a href="${escapeAttribute(post.url)}" target="_blank" rel="noreferrer">${escapeHtml(post.url)}</a>` : ""}
      ${post.body ? `<p class="post-body">${escapeHtml(post.body)}</p>` : ""}
      <div class="comment-list">
        ${post.comments.map((comment) => `
          <div class="comment"><strong>${escapeHtml(comment.author)}</strong> ${escapeHtml(comment.text)}</div>
        `).join("") || `<span class="empty">댓글 없음</span>`}
      </div>
    `;

    const form = els.commentTemplate.content.firstElementChild.cloneNode(true);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      post.comments.push({
        author: data.get("author"),
        text: data.get("text").trim(),
        createdAt: new Date().toISOString(),
      });
      await persist();
      renderPosts();
    });
    article.append(form);
    els.postList.append(article);
  });
}

function fillFormForPerson() {
  const item = state.months[els.monthInput.value][els.personInput.value];
  els.incomeInput.value = item.income || "";
  els.expenseInput.value = item.expense || "";
  els.savingsInput.value = item.savings || "";
  els.vooInput.value = item.voo || "";
  els.stockInput.value = item.stock || "";
  els.memoInput.value = item.memo || "";
}

function shiftMonth(amount) {
  const [year, month] = els.monthInput.value.split("-").map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  els.monthInput.value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  ensureMonth(els.monthInput.value);
  fillFormForPerson();
  render();
}

function ensureMonth(month) {
  if (!state.months[month]) {
    state.months[month] = {};
  }

  PEOPLE.forEach((person) => {
    if (!state.months[month][person]) {
      state.months[month][person] = {
        income: 0,
        expense: 0,
        savings: 0,
        voo: 0,
        stock: 0,
        memo: "",
      };
    } else if (typeof state.months[month][person].stock !== "number") {
      state.months[month][person].stock = 0;
    }
  });
}

function sumRows(rows) {
  const totals = rows.reduce((sum, item) => ({
    income: sum.income + (item.income || 0),
    expense: sum.expense + (item.expense || 0),
    savings: sum.savings + (item.savings || 0),
    voo: sum.voo + (item.voo || 0),
    stock: sum.stock + (item.stock || 0),
  }), { income: 0, expense: 0, savings: 0, voo: 0, stock: 0 });

  return {
    ...totals,
    expenseWithStock: totals.expense + totals.voo + totals.stock,
    balance: totals.income - totals.expense - totals.savings - totals.voo - totals.stock,
  };
}

async function loadState() {
  if (cloudStorageEnabled) {
    return loadCloudState();
  }

  return loadLocalState();
}

function loadLocalState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        months: parsed.months || {},
        posts: parsed.posts || [],
      };
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  return {
    months: {},
    posts: [],
  };
}

async function persist() {
  if (cloudStorageEnabled) {
    await saveCloudState();
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function loadCloudState() {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${SUPABASE_TABLE}?id=eq.${encodeURIComponent(supabaseConfig.boardId)}&select=data`, {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    throw new Error("Supabase 데이터를 불러오지 못했습니다.");
  }

  const rows = await response.json();
  if (rows.length > 0) {
    return normalizeState(rows[0].data);
  }

  await saveCloudState({
    months: {},
    posts: [],
  });

  return {
    months: {},
    posts: [],
  };
}

async function saveCloudState(nextState = state) {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${SUPABASE_TABLE}`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(),
      "Prefer": "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      id: supabaseConfig.boardId,
      data: nextState,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error("Supabase 저장에 실패했습니다.");
  }
}

function supabaseUrl() {
  return supabaseConfig.url.replace(/\/$/, "");
}

function supabaseHeaders() {
  return {
    "apikey": supabaseConfig.anonKey,
    "Authorization": `Bearer ${supabaseConfig.anonKey}`,
    "Content-Type": "application/json",
  };
}

function normalizeState(value) {
  return {
    months: value && value.months ? value.months : {},
    posts: value && Array.isArray(value.posts) ? value.posts : [],
  };
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month) {
  const [year, monthNumber] = month.split("-");
  return `${year}년 ${Number(monthNumber)}월`;
}

function numberFrom(input) {
  return Number(input.value || 0);
}

function won(value) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(value);
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
