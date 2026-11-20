// ===== 계산 로직 (화면과 분리해서 테스트하기 쉽게 둠) =====

// 날짜는 항상 "내 컴퓨터의 오늘" 기준 문자열(YYYY-MM-DD)로 다룬다.
function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysInMonth(year, month) {
  // month: 1~12
  return new Date(year, month, 0).getDate();
}

// today: "YYYY-MM-DD", expenses: [{amount, date}], budget: 숫자
// 규칙: 오늘 한도 = (월 예산 - 오늘 이전 이번 달 지출) ÷ 오늘 포함 남은 일수
function calculate(budget, expenses, today) {
  const [y, m, d] = today.split("-").map(Number);
  const monthPrefix = today.slice(0, 7);
  const daysLeft = daysInMonth(y, m) - d + 1;

  let spentBefore = 0;
  let spentToday = 0;
  for (const e of expenses) {
    if (!e.date.startsWith(monthPrefix)) continue; // 다른 달 지출은 제외
    if (e.date < today) spentBefore += e.amount;
    else if (e.date === today) spentToday += e.amount;
  }

  const availableBeforeToday = budget - spentBefore;
  const todayLimit = availableBeforeToday > 0 ? Math.floor(availableBeforeToday / daysLeft) : 0;
  const todayLeft = todayLimit - spentToday; // 음수면 초과
  const monthLeft = budget - spentBefore - spentToday;

  return { daysLeft, todayLimit, spentToday, todayLeft, monthLeft };
}

// 테스트(node)에서 불러 쓸 수 있게 내보내기
if (typeof module !== "undefined") {
  module.exports = { calculate, toDateString, daysInMonth };
}

// ===== 화면과 저장 (브라우저에서만 실행) =====
if (typeof document !== "undefined") {
  const STORAGE_KEY = "today-money-v1";

  const $ = (id) => document.getElementById(id);
  const won = (n) => Math.abs(n).toLocaleString("ko-KR") + "원";

  let state = load();

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved.budget === "number" && Array.isArray(saved.expenses)) return saved;
    } catch (e) { /* 저장 데이터가 깨졌으면 새로 시작 */ }
    return { budget: null, month: null, expenses: [] };
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function parseAmount(text) {
    const digits = text.replace(/[^0-9]/g, "");
    return digits ? Number(digits) : NaN;
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.hidden = !msg;
  }

  function render() {
    const today = toDateString(new Date());
    const thisMonth = today.slice(0, 7);

    // 예산이 없거나 달이 바뀌면 예산 입력 화면
    if (state.budget === null || state.month !== thisMonth) {
      $("main").hidden = true;
      $("setup").hidden = false;
      if (state.budget !== null) $("budget-input").value = state.budget;
      return;
    }

    $("setup").hidden = true;
    $("main").hidden = false;

    const r = calculate(state.budget, state.expenses, today);

    $("today-label").textContent = today.replace(/-/g, ".");
    $("today-limit").textContent = won(r.todayLimit);
    $("today-spent").textContent = won(r.spentToday);
    $("days-left").textContent = r.daysLeft + "일";
    $("month-left").textContent = (r.monthLeft < 0 ? "-" : "") + won(r.monthLeft);

    const hero = document.querySelector(".hero");
    hero.classList.remove("ok", "warn", "bad");
    if (r.todayLeft < 0) {
      $("today-left").textContent = won(r.todayLeft) + " 초과";
      $("today-status").textContent = "오늘 한도를 넘었어요. 내일 한도에서 줄어들어요.";
      hero.classList.add("bad");
    } else {
      $("today-left").textContent = won(r.todayLeft);
      const ratio = r.todayLimit > 0 ? r.todayLeft / r.todayLimit : 0;
      $("today-status").textContent = r.todayLimit === 0 ? "이번 달 예산을 모두 썼어요." : "오늘 한도 중 남은 돈이에요.";
      hero.classList.add(ratio <= 0.2 ? "warn" : "ok");
    }

    renderList(thisMonth);
  }

  function renderList(thisMonth) {
    const list = $("expense-list");
    list.innerHTML = "";
    const items = state.expenses
      .filter((e) => e.date.startsWith(thisMonth))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
    $("empty-msg").hidden = items.length > 0;
    for (const e of items) {
      const li = document.createElement("li");
      const date = document.createElement("span");
      date.className = "date";
      date.textContent = e.date.slice(5).replace("-", "/");
      const amount = document.createElement("strong");
      amount.textContent = won(e.amount);
      li.append(date, amount);
      list.appendChild(li);
    }
  }

  $("budget-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const value = parseAmount($("budget-input").value);
    if (!Number.isFinite(value) || value <= 0) {
      showError($("budget-error"), "1원 이상의 숫자를 입력해 주세요.");
      return;
    }
    showError($("budget-error"), "");
    state.budget = value;
    state.month = toDateString(new Date()).slice(0, 7);
    save();
    render();
  });

  $("expense-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const value = parseAmount($("expense-amount").value);
    const date = $("expense-date").value;
    if (!Number.isFinite(value) || value <= 0) {
      showError($("expense-error"), "1원 이상의 금액을 입력해 주세요.");
      return;
    }
    if (!date) {
      showError($("expense-error"), "날짜를 선택해 주세요.");
      return;
    }
    showError($("expense-error"), "");
    state.expenses.push({ id: Date.now(), amount: value, date });
    save();
    $("expense-amount").value = "";
    render();
  });

  $("reset-budget").addEventListener("click", () => {
    state.month = null; // 예산 입력 화면으로 (기존 지출 기록은 유지)
    save();
    render();
  });

  // 지출 날짜 기본값은 오늘, 미래 날짜는 선택 불가
  const todayStr = toDateString(new Date());
  $("expense-date").value = todayStr;
  $("expense-date").max = todayStr;

  render();
}
