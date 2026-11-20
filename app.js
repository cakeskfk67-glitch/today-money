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

// 진행 막대의 채움 비율(0~100), 색 단계, 안내 문구를 정한다.
// 단계: 한도의 80% 미만 = ok(초록), 80% 이상~한도 이하 = warn(주황), 한도 초과 = bad(빨강)
function progressInfo(r) {
  if (r.todayLimit === 0) {
    // 이번 달 예산을 이미 다 쓴 상태
    return { percent: 100, level: "bad", message: "이번 달 예산을 모두 썼어요.", label: "예산 소진" };
  }
  const used = r.spentToday / r.todayLimit;
  const percent = Math.min(100, Math.round(used * 100));
  const label = `오늘 한도의 ${Math.round(used * 100)}% 사용`;
  if (used > 1) {
    return { percent: 100, level: "bad", message: "오늘 한도를 넘었어요. 내일 한도에서 줄어들어요.", label };
  }
  if (used === 1) {
    return { percent: 100, level: "warn", message: "오늘 한도를 딱 맞게 다 썼어요.", label };
  }
  if (used >= 0.8) {
    return { percent, level: "warn", message: "한도가 얼마 남지 않았어요.", label };
  }
  return { percent, level: "ok", message: "오늘 한도 중 남은 돈이에요.", label };
}

// 테스트(node)에서 불러 쓸 수 있게 내보내기
if (typeof module !== "undefined") {
  module.exports = { calculate, progressInfo, toDateString, daysInMonth };
}

// ===== 화면과 저장 (브라우저에서만 실행) =====
if (typeof document !== "undefined") {
  const STORAGE_KEY = "today-money-v1";

  const $ = (id) => document.getElementById(id);
  const won = (n) => Math.abs(n).toLocaleString("ko-KR") + "원";

  const CATEGORIES = ["식비", "카페·간식", "교통", "쇼핑", "문화·여가", "기타"];
  let editingId = null; // 수정 중인 지출의 id (없으면 null)

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
    const p = progressInfo(r);
    hero.classList.remove("ok", "warn", "bad");
    hero.classList.add(p.level);
    $("today-left").textContent = r.todayLeft < 0 ? won(r.todayLeft) + " 초과" : won(r.todayLeft);
    $("today-status").textContent = p.message;
    $("bar-fill").style.width = p.percent + "%";
    $("bar-label").textContent = p.label;
    $("bar").setAttribute("aria-valuenow", String(p.percent));

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
      if (e.id === editingId) li.className = "editing";

      const info = document.createElement("div");
      info.className = "info";
      const top = document.createElement("div");
      const date = document.createElement("span");
      date.className = "date";
      date.textContent = e.date.slice(5).replace("-", "/");
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = e.category || "기타";
      top.append(date, tag);
      info.appendChild(top);
      if (e.memo) {
        const memo = document.createElement("div");
        memo.className = "memo";
        memo.textContent = e.memo;
        info.appendChild(memo);
      }

      const right = document.createElement("div");
      right.className = "right";
      const amount = document.createElement("strong");
      amount.textContent = won(e.amount);
      const actions = document.createElement("div");
      actions.className = "actions";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "수정";
      editBtn.addEventListener("click", () => startEdit(e.id));
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "danger";
      delBtn.textContent = "삭제";
      delBtn.addEventListener("click", () => deleteExpense(e.id));
      actions.append(editBtn, delBtn);
      right.append(amount, actions);

      li.append(info, right);
      list.appendChild(li);
    }
  }

  // 입력 폼을 "새 지출 추가" 상태로 되돌린다 (날짜는 항상 오늘로)
  function resetForm() {
    editingId = null;
    const todayStr = toDateString(new Date());
    $("expense-amount").value = "";
    $("expense-memo").value = "";
    $("expense-date").value = todayStr;
    $("expense-date").max = todayStr;
    $("form-title").textContent = "지출 기록하기";
    $("expense-submit").textContent = "추가";
    $("edit-cancel").hidden = true;
    showError($("expense-error"), "");
  }

  function startEdit(id) {
    const e = state.expenses.find((x) => x.id === id);
    if (!e) return;
    editingId = id;
    $("expense-amount").value = e.amount;
    $("expense-category").value = e.category || "기타";
    $("expense-memo").value = e.memo || "";
    $("expense-date").value = e.date;
    $("form-title").textContent = "지출 수정하기";
    $("expense-submit").textContent = "저장";
    $("edit-cancel").hidden = false;
    showError($("expense-error"), "");
    render();
    $("expense-form").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function deleteExpense(id) {
    if (!confirm("이 지출을 삭제할까요?")) return;
    state.expenses = state.expenses.filter((x) => x.id !== id);
    save();
    if (editingId === id) resetForm();
    render();
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
    const category = $("expense-category").value;
    const memo = $("expense-memo").value.trim();
    if (editingId !== null) {
      const target = state.expenses.find((x) => x.id === editingId);
      if (target) Object.assign(target, { amount: value, date, category, memo });
    } else {
      state.expenses.push({ id: Date.now(), amount: value, date, category, memo });
    }
    save();
    resetForm();
    render();
  });

  $("edit-cancel").addEventListener("click", () => {
    resetForm();
    render();
  });

  $("reset-budget").addEventListener("click", () => {
    state.month = null; // 예산 입력 화면으로 (기존 지출 기록은 유지)
    save();
    render();
  });

  // 카테고리 선택지 채우기
  for (const name of CATEGORIES) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    $("expense-category").appendChild(opt);
  }

  // 지출 날짜 기본값은 오늘, 미래 날짜는 선택 불가
  resetForm();
  render();
}
