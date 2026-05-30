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
  reportMonth: document.querySelector("#reportMonth"),
  personReports: document.querySelector("#personReports"),
  stockList: document.querySelector("#stockList"),
  stockListCount: document.querySelector("#stockListCount"),
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
  fillFormForPeople();
  render();
});

els.prevMonth.addEventListener("click", () => shiftMonth(-1));
els.nextMonth.addEventListener("click", () => shiftMonth(1));

els.entryForm.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-add-investment]");
  if (!button) return;

  const person = button.dataset.addInvestment;
  await addInvestment(person);
});

els.stockList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-investment]");
  if (!button) return;

  await deleteInvestment(button.dataset.person, button.dataset.deleteInvestment);
});

els.entryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const month = els.monthInput.value;

  ensureMonth(month);
  PEOPLE.forEach((person) => {
    state.months[month][person] = readPersonInputs(person);
  });

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
    fillFormForPeople();
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
  fillFormForPeople();
  render();
}

function render() {
  const month = els.monthInput.value;
  els.reportMonth.textContent = monthLabel(month);

  renderPersonReports(month);
  renderStockList(month);
  renderHistory();
  renderPosts();
}

function renderPersonReports(month) {
  els.personReports.innerHTML = PEOPLE.map((person) => {
    const item = state.months[month][person];
    const stockTotal = getInvestmentTotal(item);
    const invested = item.savings + item.voo + stockTotal;
    const balance = item.income - item.expense - invested;
    const ratio = item.income > 0 ? Math.min(100, Math.round((invested / item.income) * 100)) : 0;

    return `
      <article class="person-card">
        <h3>${person}</h3>
        <div class="metric"><span>월급</span><strong>${won(item.income)}</strong></div>
        <div class="metric"><span>고정비</span><strong>${won(item.expense)}</strong></div>
        <div class="metric"><span>적금</span><strong>${won(item.savings)}</strong></div>
        <div class="metric"><span>VOO</span><strong>${won(item.voo)}</strong></div>
        <div class="metric"><span>주식투자</span><strong>${won(stockTotal)}</strong></div>
        <div class="metric"><span>시드머니</span><strong>${won(item.seed)}</strong></div>
        <div class="metric"><span>지출 합계(고정비+VOO+주식)</span><strong>${won(item.expense + item.voo + stockTotal)}</strong></div>
        <div class="ratio-bar" title="저축+투자율"><span style="width: ${ratio}%"></span></div>
        <div class="metric"><span>저축+투자율</span><strong>${ratio}%</strong></div>
        <div class="metric"><span>남는 돈</span><strong>${won(balance)}</strong></div>
        <p class="memo">${escapeHtml(item.memo) || "메모 없음"}</p>
      </article>
    `;
  }).join("");
}

function renderStockList(month) {
  const items = PEOPLE.flatMap((person) => (
    state.months[month][person].investments.map((investment) => ({
      ...investment,
      person,
    }))
  ));

  els.stockListCount.textContent = `${items.length}개`;
  els.stockList.innerHTML = PEOPLE.map((person) => {
    const personItems = state.months[month][person].investments;
    const total = personItems.reduce((sum, item) => sum + (item.amount || 0), 0);

    return `
      <section class="investor-stock-card">
        <div class="investor-stock-head">
          <div>
            <h4>${person}</h4>
            <span>${personItems.length}개 종목</span>
          </div>
          <strong>${won(total)}</strong>
        </div>
        <div class="stock-list">
          ${personItems.length === 0 ? `<p class="empty">아직 입력된 종목이 없습니다.</p>` : personItems.map((item) => `
            <article class="stock-item">
              <div class="stock-symbol">${escapeHtml(stockInitial(item.name))}</div>
              <div>
                <strong>${escapeHtml(item.name)}</strong>
                <span>${formatDate(item.date)} 구입</span>
              </div>
              <em>${won(item.amount)}</em>
              <button type="button" class="delete-investment" data-person="${person}" data-delete-investment="${item.id}" title="삭제">×</button>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }).join("");
}

function renderHistory() {
  const months = Object.keys(state.months).sort().reverse();

  if (months.length === 0) {
    els.historyTable.innerHTML = `<tr><td colspan="7" class="empty">저장된 기록이 없습니다.</td></tr>`;
    return;
  }

  els.historyTable.innerHTML = months.map((month) => {
    ensureMonth(month);
    const totals = sumRows(PEOPLE.map((person) => state.months[month][person]));
    return `
      <tr>
        <td>${monthLabel(month)}</td>
        <td>${won(state.months[month]["성진"].income)}</td>
        <td>${won(state.months[month]["소원"].income)}</td>
        <td>${won(totals.expenseWithStock)}</td>
        <td>${won(totals.savings + totals.voo + totals.stock)}</td>
        <td>${won(totals.seed)}</td>
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

function fillFormForPeople() {
  PEOPLE.forEach((person) => {
    const item = state.months[els.monthInput.value][person];
    setPersonField(person, "income", item.income || "");
    setPersonField(person, "expense", item.expense || "");
    setPersonField(person, "savings", item.savings || "");
    setPersonField(person, "voo", item.voo || "");
    setPersonField(person, "seed", item.seed || "");
    setPersonField(person, "memo", item.memo || "");
  });
}

function readPersonInputs(person) {
  return {
    income: numberFrom(getPersonField(person, "income")),
    expense: numberFrom(getPersonField(person, "expense")),
    savings: numberFrom(getPersonField(person, "savings")),
    voo: numberFrom(getPersonField(person, "voo")),
    stock: getInvestmentTotal(currentPersonData(person)),
    seed: numberFrom(getPersonField(person, "seed")),
    stockMemo: "",
    investments: currentPersonData(person).investments || [],
    memo: getPersonField(person, "memo").value.trim(),
  };
}

function getPersonField(person, field) {
  return document.querySelector(`[data-person="${person}"][data-field="${field}"]`);
}

function setPersonField(person, field, value) {
  getPersonField(person, field).value = value;
}

async function addInvestment(person) {
  const month = els.monthInput.value;
  ensureMonth(month);
  syncCurrentInputs(month);

  const nameInput = getInvestmentField(person, "name");
  const dateInput = getInvestmentField(person, "date");
  const amountInput = getInvestmentField(person, "amount");
  const name = nameInput.value.trim();

  if (!name) {
    alert("종목명을 입력해 주세요.");
    return;
  }

  state.months[month][person].investments.push({
    id: createId(),
    name,
    date: dateInput.value || todayKey(),
    amount: numberFrom(amountInput),
  });
  state.months[month][person].stock = getInvestmentTotal(state.months[month][person]);

  nameInput.value = "";
  dateInput.value = "";
  amountInput.value = "";

  await persist();
  render();
}

async function deleteInvestment(person, investmentId) {
  const month = els.monthInput.value;
  ensureMonth(month);
  syncCurrentInputs(month);

  state.months[month][person].investments = state.months[month][person].investments.filter((item) => item.id !== investmentId);
  state.months[month][person].stock = getInvestmentTotal(state.months[month][person]);

  await persist();
  render();
}

function syncCurrentInputs(month) {
  PEOPLE.forEach((person) => {
    state.months[month][person] = readPersonInputs(person);
  });
}

function currentPersonData(person) {
  ensureMonth(els.monthInput.value);
  return state.months[els.monthInput.value][person];
}

function getInvestmentField(person, field) {
  return document.querySelector(`[data-invest-person="${person}"][data-invest-field="${field}"]`);
}

function shiftMonth(amount) {
  const [year, month] = els.monthInput.value.split("-").map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  els.monthInput.value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  ensureMonth(els.monthInput.value);
  fillFormForPeople();
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
        seed: 0,
        stockMemo: "",
        investments: [],
        memo: "",
      };
    } else {
      const item = state.months[month][person];
      if (typeof item.stock !== "number") item.stock = 0;
      if (typeof item.seed !== "number") item.seed = 0;
      if (typeof item.stockMemo !== "string") item.stockMemo = "";
      if (!Array.isArray(item.investments)) {
        item.investments = migrateStockMemoToInvestments(item);
      }
      item.stock = getInvestmentTotal(item);
    }
  });
}

function sumRows(rows) {
  const totals = rows.reduce((sum, item) => ({
    income: sum.income + (item.income || 0),
    expense: sum.expense + (item.expense || 0),
    savings: sum.savings + (item.savings || 0),
    voo: sum.voo + (item.voo || 0),
    stock: sum.stock + getInvestmentTotal(item),
    seed: sum.seed + (item.seed || 0),
  }), { income: 0, expense: 0, savings: 0, voo: 0, stock: 0, seed: 0 });

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

function parseStockNames(value) {
  return String(value || "")
    .split(/[\n,;/]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function migrateStockMemoToInvestments(item) {
  return parseStockNames(item.stockMemo).map((name, index) => ({
    id: createId(),
    name,
    date: "",
    amount: index === 0 ? item.stock || 0 : 0,
  }));
}

function getInvestmentTotal(item) {
  if (!Array.isArray(item.investments)) {
    return item.stock || 0;
  }

  return item.investments.reduce((sum, investment) => sum + (investment.amount || 0), 0);
}

function stockInitial(name) {
  const cleanName = String(name || "").trim();
  return cleanName.slice(0, 2).toUpperCase() || "ST";
}

function formatDate(value) {
  if (!value) return "날짜 없음";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${Number(month)}월 ${Number(day)}일`;
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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
