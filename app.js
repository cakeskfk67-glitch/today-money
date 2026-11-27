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

// ----- 고정지출(매달 같은 날 나가는 돈)과 지출이 많은 날 -----

// 결제일 계산: 매달 `day`일. 그 달에 없는 날(예: 2월 31일)이면 그 달의 마지막 날.
// 토·일이면 돌아오는 월요일로 미룬다. 월요일이 다음 달로 넘어가면 대신 바로 앞 금요일로 당긴다.
function adjustPayDate(year, month, day) {
  const last = daysInMonth(year, month);
  const target = new Date(year, month - 1, Math.min(day, last));
  const dow = target.getDay(); // 0=일, 6=토
  if (dow === 6 || dow === 0) {
    const forward = new Date(target);
    forward.setDate(forward.getDate() + (dow === 6 ? 2 : 1));
    if (forward.getMonth() === target.getMonth()) return toDateString(forward);
    const back = new Date(target);
    back.setDate(back.getDate() - (dow === 6 ? 1 : 2));
    return toDateString(back);
  }
  return toDateString(target);
}

// 이번 달에 해당하는 고정지출 목록을 날짜순으로 만든다.
// fixedList: [{id, name, amount, day}], ym: "YYYY-MM", actual: {"YYYY-MM": {id: 실제금액}},
// startDate: 예산을 입력한 날 (이 날짜 전에 이미 나간 고정지출은 입력한 예산에 반영돼 있으므로 제외)
function buildFixedItems(fixedList, ym, actual, startDate) {
  const [y, m] = ym.split("-").map(Number);
  const confirmed = (actual && actual[ym]) || {};
  const items = [];
  for (const f of fixedList || []) {
    const date = adjustPayDate(y, m, f.day);
    if (startDate && date < startDate) continue;
    const isConfirmed = Object.prototype.hasOwnProperty.call(confirmed, f.id);
    items.push({ id: f.id, name: f.name, date, amount: isConfirmed ? confirmed[f.id] : f.amount, confirmed: isConfirmed });
  }
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// today: "YYYY-MM-DD", expenses: [{amount, date}], budget: 숫자
// plan(선택): { fixed: [{date, amount}], planned: [{date, amount}] }
// 규칙: 오늘 한도 = (월 예산 - 오늘 이전 이번 달 지출 - 이번 달 고정지출 - 오늘 이후 예정된 지출) ÷ 오늘 포함 남은 일수
//       + 오늘 예정된 지출(지출이 많은 날로 미리 적어 둔 금액)
// 두 날짜("YYYY-MM-DD") 사이의 일수 (to - from)
function daysBetween(from, to) {
  const t = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(to) - t(from)) / 86400000);
}

// 용돈·월급 받는 날: 매달 `day`일. 그 달에 없는 날이면 마지막 날, 토·일이면 앞의 금요일에 받는다고 본다.
function adjustPayday(year, month, day) {
  const target = new Date(year, month - 1, Math.min(day, daysInMonth(year, month)));
  const dow = target.getDay();
  if (dow === 6) target.setDate(target.getDate() - 1);
  else if (dow === 0) target.setDate(target.getDate() - 2);
  return toDateString(target);
}

// 오늘 이후(오늘은 제외) 처음 오는 용돈일. 오늘이 용돈일이면 다음 달 용돈일.
function nextPayday(today, day) {
  const [y, m] = today.split("-").map(Number);
  const thisMonth = adjustPayday(y, m, day);
  if (thisMonth > today) return thisMonth;
  return m === 12 ? adjustPayday(y + 1, 1, day) : adjustPayday(y, m + 1, day);
}

// today: "YYYY-MM-DD", expenses: [{amount, date}], budget: 숫자
// plan(선택): { fixed: [{date, amount}], planned: [{date, amount}], start, end }
//   start/end("YYYY-MM-DD")를 주면 용돈일 기준: start 이후 지출만 세고, 남은 일수는 end(다음 용돈일) 전날까지.
//   주지 않으면 예전처럼 이번 달 기준(월말까지).
function calculate(budget, expenses, today, plan) {
  const [y, m, d] = today.split("-").map(Number);
  const monthPrefix = today.slice(0, 7);
  const range = plan && plan.start && plan.end ? { start: plan.start, end: plan.end } : null;
  const daysLeft = range ? Math.max(1, daysBetween(today, range.end)) : daysInMonth(y, m) - d + 1;

  let spentBefore = 0;
  let spentToday = 0;
  for (const e of expenses) {
    if (range ? e.date < range.start : !e.date.startsWith(monthPrefix)) continue; // 기간 밖(다른 달) 지출은 제외
    if (e.date < today) spentBefore += e.amount;
    else if (e.date === today) spentToday += e.amount;
  }

  let fixedTotal = 0;
  let plannedRemaining = 0; // 오늘을 포함해 앞으로 예정된 금액
  let plannedToday = 0;
  if (plan) {
    const inPeriod = (date) => (range ? date >= range.start && date < range.end : date.startsWith(monthPrefix));
    for (const f of plan.fixed || []) if (inPeriod(f.date)) fixedTotal += f.amount;
    for (const p of plan.planned || []) {
      if (!inPeriod(p.date) || p.date < today) continue;
      plannedRemaining += p.amount;
      if (p.date === today) plannedToday += p.amount;
    }
  }

  const availableBeforeToday = budget - spentBefore - fixedTotal - plannedRemaining;
  const baseLimit = availableBeforeToday > 0 ? Math.floor(availableBeforeToday / daysLeft) : 0;
  const todayLimit = baseLimit + plannedToday;
  const todayLeft = todayLimit - spentToday; // 음수면 초과
  const monthLeft = budget - spentBefore - spentToday - fixedTotal;

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

// 이번 달 통계: 총 지출, 카테고리별 합계(많은 순), 일별 지출, 하루 평균, 가장 많이 쓴 날
function monthStats(expenses, today) {
  const [y, m, d] = today.split("-").map(Number);
  const prefix = today.slice(0, 7);
  const days = daysInMonth(y, m);
  const byDay = Array.from({ length: days }, (_, i) => ({ day: i + 1, amount: 0 }));
  const catMap = {};
  let total = 0;

  for (const e of expenses) {
    if (!e.date.startsWith(prefix)) continue; // 이번 달만
    total += e.amount;
    byDay[Number(e.date.slice(8, 10)) - 1].amount += e.amount;
    const name = e.category || "기타";
    catMap[name] = (catMap[name] || 0) + e.amount;
  }

  const byCategory = Object.entries(catMap)
    .map(([name, amount]) => ({ name, amount, percent: total ? Math.round((amount / total) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);

  const maxDay = byDay.reduce((best, x) => (x.amount > best.amount ? x : best), { day: 0, amount: 0 });
  const average = Math.floor(total / d); // 이번 달 시작부터 오늘까지의 하루 평균

  return { total, byCategory, byDay, maxDay, average, today: d, days };
}

// 테스트(node)에서 불러 쓸 수 있게 내보내기
if (typeof module !== "undefined") {
  module.exports = { calculate, progressInfo, monthStats, toDateString, daysInMonth, adjustPayDate, buildFixedItems, adjustPayday, nextPayday, daysBetween };
}

// ===== 화면과 저장 (브라우저에서만 실행) =====
if (typeof document !== "undefined") {
  const STORAGE_KEY = "today-money-v1";

  const $ = (id) => document.getElementById(id);
  const won = (n) => Math.abs(n).toLocaleString("ko-KR") + "원";

  const CATEGORIES = ["식비", "카페·간식", "교통", "쇼핑", "문화·여가", "기타"];
  let editingId = null; // 수정 중인 지출의 id (없으면 null)

  let state = load();

  // 저장 형식: { budget, month, budgetStart, payday, periodEnd, expenses, fixed, fixedActual, planned }
  //  payday: 매달 용돈·월급 받는 날(1~31) 또는 null(정하지 않음 → 월말까지로 계산)
  //  periodEnd: 다음 용돈일 "YYYY-MM-DD" (payday 가 있을 때만)
  //  fixed: [{id, name, amount, day}]  매달 나가는 고정지출 (예정 금액, 결제일)
  //  fixedActual: {"YYYY-MM": {고정지출id: 실제 금액}}  결제일에 확인한 실제 금액
  //  planned: [{id, date, amount, memo}]  지출이 많을 것 같은 날과 예상 금액
  // 이전 버전에서 저장한 데이터(위 세 항목이 없음)도 그대로 읽는다.
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved.budget === "number" && Array.isArray(saved.expenses)) {
        if (!Array.isArray(saved.fixed)) saved.fixed = [];
        if (!saved.fixedActual || typeof saved.fixedActual !== "object") saved.fixedActual = {};
        if (!Array.isArray(saved.planned)) saved.planned = [];
        if (!saved.budgetStart && saved.month) saved.budgetStart = saved.month + "-01";
        if (!Number.isInteger(saved.payday)) saved.payday = null;
        if (typeof saved.periodEnd !== "string") saved.periodEnd = null;
        return saved;
      }
    } catch (e) { /* 저장 데이터가 깨졌으면 새로 시작 */ }
    return { budget: null, month: null, budgetStart: null, payday: null, periodEnd: null, expenses: [], fixed: [], fixedActual: {}, planned: [] };
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

    // 예산이 없거나, 달이 바뀌었거나(용돈일이 있으면 용돈일이 되었으면) 예산 입력 화면
    const usePayday = state.payday !== null && state.periodEnd !== null;
    const needSetup = state.budget === null || (usePayday ? today >= state.periodEnd : state.month !== thisMonth);
    if (needSetup) {
      $("main").hidden = true;
      $("setup").hidden = false;
      if (state.budget !== null) $("budget-input").value = state.budget;
      $("payday-input").value = state.payday !== null ? state.payday : "";
      const arrived = state.budget !== null && usePayday && today >= state.periodEnd;
      $("setup-note").hidden = !arrived;
      return;
    }

    $("setup").hidden = true;
    $("main").hidden = false;

    // 이번 달 고정지출과 예정된 지출을 미리 빼고 계산한다
    // (용돈일이 있으면 지금부터 다음 용돈일 전날까지가 계산 기간. 달을 넘길 수 있다)
    const period = usePayday ? { start: state.budgetStart, end: state.periodEnd } : null;
    let fixedItems;
    let plannedItems;
    if (period) {
      const months = new Set([period.start.slice(0, 7), thisMonth, period.end.slice(0, 7)]);
      fixedItems = [];
      for (const ym of [...months].sort()) {
        for (const f of buildFixedItems(state.fixed, ym, state.fixedActual, state.budgetStart)) {
          if (f.date < period.end) fixedItems.push(f);
        }
      }
      plannedItems = state.planned.filter((x) => x.date >= period.start && x.date < period.end);
    } else {
      fixedItems = buildFixedItems(state.fixed, thisMonth, state.fixedActual, state.budgetStart);
      plannedItems = state.planned.filter((x) => x.date.startsWith(thisMonth));
    }
    const r = calculate(state.budget, state.expenses, today, { fixed: fixedItems, planned: plannedItems, start: period && period.start, end: period && period.end });

    const fixedSum = fixedItems.reduce((s, x) => s + x.amount, 0);
    const plannedSum = plannedItems.filter((x) => x.date >= today).reduce((s, x) => s + x.amount, 0);
    const note = $("reserved-note");
    const parts = [];
    if (fixedSum > 0) parts.push(`고정지출 ${won(fixedSum)}`);
    if (plannedSum > 0) parts.push(`예정된 지출 ${won(plannedSum)}`);
    note.hidden = parts.length === 0;
    note.textContent = parts.length ? `${parts.join(" · ")}을 미리 빼고 계산했어요.` : "";

    renderCalendar(today, fixedItems, plannedItems);

    $("today-label").textContent = today.replace(/-/g, ".");
    $("today-limit").textContent = won(r.todayLimit);
    $("today-spent").textContent = won(r.spentToday);
    $("days-left").textContent = r.daysLeft + "일";
    $("month-left").textContent = (r.monthLeft < 0 ? "-" : "") + won(r.monthLeft);
    $("month-left-label").textContent = period ? "다음 용돈일까지 남은 돈" : "이번 달 남은 예산";
    $("days-left-label").textContent = period ? "용돈일까지 (오늘 포함)" : "남은 일수(오늘 포함)";

    const hero = document.querySelector(".hero");
    const p = progressInfo(r);
    hero.classList.remove("ok", "warn", "bad");
    hero.classList.add(p.level);
    $("today-left").textContent = r.todayLeft < 0 ? won(r.todayLeft) + " 초과" : won(r.todayLeft);
    $("today-status").textContent = p.message;
    $("bar-fill").style.width = p.percent + "%";
    $("bar-label").textContent = p.label;
    $("bar").setAttribute("aria-valuenow", String(p.percent));

    renderGame(r, p, today);
    renderAdventure(r, p, today, period);
    renderList(thisMonth);
    renderStats(today);
  }

  // ===== adventure 디자인: 캐릭터가 달리는 장면 (다른 디자인에서는 숨겨져 있어 영향 없음) =====
  // 캐릭터 6종 (Kenney CC0). 캐릭터를 탭하면 다음 캐릭터로 바뀌고 기억해 둔다.
  // 맨 앞이 기본 캐릭터 (여자 모험가)
  const HEROES = ["femaleAdventurer", "maleAdventurer", "malePerson", "femalePerson", "robot", "zombie"];
  const HERO_KEY = "today-money-hero";
  let heroName = (() => {
    try { const s = localStorage.getItem(HERO_KEY); if (HEROES.includes(s)) return s; } catch (e) { /* 무시 */ }
    return HEROES[0];
  })();
  const heroUrl = (frame) => `assets/hero/${heroName}/character_${heroName}_${frame}.png?v=${window.APP_VERSION || ""}`;
  const HERO_SEQ = {
    run: { frames: ["run0", "run1", "run2", "run1"], ms: 110 },
    walk: { frames: ["walk0", "walk1", "walk2", "walk3", "walk4", "walk5", "walk6", "walk7"], ms: 140 },
    cheer: { frames: ["cheer0", "cheer1"], ms: 420 },
    hit: { frames: ["hit"], ms: 0 }, // 지출 직후 깜짝 놀람
    sad: { frames: ["duck"], ms: 0 }, // 한도 초과: 웅크리고 속상한 표정
    idle: { frames: ["idle"], ms: 0 },
  };
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let heroTimer = null;
  let heroMode = null;
  let heroLock = false; // 지출 직후 잠깐 "아야" 동작을 보여 주는 동안 true

  // 이미지를 미리 불러 두어 동작이 바뀔 때 깜빡이지 않게 한다
  function preloadHero() {
    for (const seq of Object.values(HERO_SEQ)) for (const f of seq.frames) new Image().src = heroUrl(f);
  }
  preloadHero();

  function nextHero() {
    heroName = HEROES[(HEROES.indexOf(heroName) + 1) % HEROES.length];
    try { localStorage.setItem(HERO_KEY, heroName); } catch (e) { /* 무시 */ }
    preloadHero();
    $("a-track-hero").src = heroUrl("idle");
    const mode = heroMode;
    heroMode = null;
    setHeroMode(mode || "idle");
    const img = $("a-hero");
    img.classList.remove("swap");
    void img.offsetWidth;
    img.classList.add("swap");
    setTimeout(() => img.classList.remove("swap"), 450);
  }
  $("a-hero").addEventListener("click", nextHero);

  function setHeroMode(mode) {
    if (mode === heroMode) return;
    heroMode = mode;
    clearInterval(heroTimer);
    const img = $("a-hero");
    const seq = reduceMotion ? HERO_SEQ.idle : HERO_SEQ[mode];
    let i = 0;
    const step = () => { img.src = heroUrl(seq.frames[i % seq.frames.length]); i++; };
    step();
    if (seq.ms) heroTimer = setInterval(step, seq.ms);
  }

  function renderAdventure(r, p, today, period) {
    const scene = $("a-scene");
    scene.classList.remove("lv-ok", "lv-warn", "lv-bad");
    scene.classList.add("lv-" + p.level);
    const [y, m, d] = today.split("-").map(Number);
    const total = daysInMonth(y, m);

    $("a-date").textContent = `${m}월 ${d}일`;
    $("a-days").textContent = `남은 ${r.daysLeft}일`;
    $("a-month").textContent = (r.monthLeft < 0 ? "-" : "") + won(r.monthLeft);
    $("a-label").textContent = r.todayLeft < 0 ? "오늘 한도를 넘었어요" : "오늘 쓸 수 있는 돈";
    const amountText = r.todayLeft < 0 ? won(r.todayLeft) + " 초과" : won(r.todayLeft);
    $("a-amount").textContent = amountText;
    // 글자가 길면(예: 초과 금액) 폰 화면 폭에 맞게 숫자 크기를 줄인다
    scene.classList.toggle("long", amountText.length > 8);
    scene.classList.toggle("xlong", amountText.length > 11);

    // 코인 10칸
    const used = r.todayLimit === 0 ? 10 : Math.min(10, Math.floor((r.spentToday / r.todayLimit) * 10));
    const coins = $("a-coins");
    coins.innerHTML = "";
    for (let i = 0; i < 10; i++) {
      const c = document.createElement("i");
      if (i < used) c.className = "gone";
      coins.appendChild(c);
    }

    // 말풍선
    const left = won(Math.max(r.todayLeft, 0));
    let msg;
    if (p.level === "ok") msg = r.spentToday === 0 ? `오늘 <b>${left}</b> 쓸 수 있어요! 아낄수록 멀리 가요.` : `오늘 <b>${left}</b> 남았어요. 좋은 페이스예요!`;
    else if (r.todayLeft < 0) msg = `앗, <b>${won(r.todayLeft)}</b> 넘었어요! 내일 조금만 아껴요.`;
    else msg = `조심! <b>${left}</b> 남았어요.`;
    $("a-bubble").innerHTML = msg;

    // 목적지까지의 코스: 용돈일이 있으면 "용돈일까지", 없으면 "월말까지"
    let ratio;
    const goal = $("a-goal");
    if (period) {
      const total2 = Math.max(1, daysBetween(period.start, period.end));
      const left2 = Math.max(0, daysBetween(today, period.end));
      ratio = Math.min(1, Math.max(0, (total2 - left2) / total2));
      $("a-course-text").textContent = left2 === 1 ? "내일은 용돈일!" : `용돈일까지 D-${left2}`;
      $("a-goal-label").textContent = left2 === 1 ? "내일!" : `D-${left2}`;
      goal.classList.toggle("near", left2 <= 3);
      goal.hidden = false;
    } else {
      ratio = d / total;
      $("a-course-text").textContent = `월말까지 ${d}일 / ${total}일`;
      goal.hidden = true;
    }
    goal.style.setProperty("--s", String(0.72 + 0.4 * ratio));
    const pct = ratio * 100 + "%";
    $("a-track-fill").style.width = pct;
    $("a-track-hero").style.left = pct;
    $("a-track-hero").src = heroUrl("idle");

    // 캐릭터 동작: 오늘 안 썼으면 환호, 여유 있으면 달리기, 아슬아슬하면 걷기, 초과면 아야
    if (!heroLock) setHeroMode(p.level === "bad" ? "sad" : p.level === "warn" ? "walk" : r.spentToday === 0 ? "cheer" : "run");
  }

  // 지출을 기록했을 때의 연출: 화면 흔들림 + "-금액" 떠오르기 + 캐릭터 아야
  function spendFx(amount) {
    const scene = $("a-scene");
    scene.classList.remove("hit");
    void scene.offsetWidth; // 애니메이션을 처음부터 다시 재생
    scene.classList.add("hit");
    const f = document.createElement("span");
    f.className = "a-float";
    f.textContent = "-" + amount.toLocaleString("ko-KR");
    scene.appendChild(f);
    setTimeout(() => f.remove(), 1100);
    heroLock = true;
    heroMode = null;
    setHeroMode("hit");
    setTimeout(() => { heroLock = false; render(); }, 700);
  }

  // 아래에서 올라오는 지출 입력창 (adventure 디자인에서만 사용)
  // name: "expense"(지출) | "fixed"(고정지출) | "planned"(지출 많은 날) | "confirm"(실제 금액 확인)
  function openSheet(name) {
    document.body.dataset.sheet = name || "expense";
    document.body.classList.add("sheet-open");
  }
  function closeSheet() {
    document.body.classList.remove("sheet-open");
    delete document.body.dataset.sheet;
    editingFixedId = null;
    editingPlannedId = null;
    confirmingFixedId = null;
  }
  $("a-fab").addEventListener("click", () => { resetForm(); render(); openSheet("expense"); });
  $("a-backdrop").addEventListener("click", closeSheet);
  $("sheet-close").addEventListener("click", () => { resetForm(); render(); closeSheet(); });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeSheet(); });

  // ===== 달력 탭: 고정지출과 지출이 많은 날 =====
  let calSelected = null; // 달력에서 고른 날짜 "YYYY-MM-DD"
  let editingFixedId = null;
  let editingPlannedId = null;
  let confirmingFixedId = null;
  let confirmingMonth = null;
  let calCtx = null; // 가장 최근 화면 그리기에 쓴 값

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const pad2 = (n) => String(n).padStart(2, "0");

  function renderCalendar(today, fixedItems, plannedItems) {
    calCtx = { today, fixedItems, plannedItems };
    const [y, m] = today.split("-").map(Number);
    const ym = today.slice(0, 7);
    const total = daysInMonth(y, m);
    $("cal-title").textContent = `${y}년 ${m}월`;
    if (!calSelected || !calSelected.startsWith(ym)) calSelected = today;

    // 달력 격자
    const grid = $("cal-grid");
    grid.innerHTML = "";
    for (const n of ["일", "월", "화", "수", "목", "금", "토"]) grid.appendChild(el("div", "cal-dow", n));
    for (let i = 0; i < new Date(y, m - 1, 1).getDay(); i++) grid.appendChild(el("div", "cal-cell empty"));
    const fixedDates = new Set(fixedItems.map((f) => f.date));
    const plannedDates = new Set(plannedItems.map((p) => p.date));
    const spentDates = new Set(state.expenses.filter((e) => e.date.startsWith(ym)).map((e) => e.date));
    for (let day = 1; day <= total; day++) {
      const date = `${ym}-${pad2(day)}`;
      const cell = el("button", "cal-cell" + (date < today ? " past" : "") + (date === today ? " today" : "") + (date === calSelected ? " sel" : ""));
      cell.type = "button";
      cell.appendChild(el("span", "cal-num", String(day)));
      const marks = el("span", "cal-marks");
      if (fixedDates.has(date)) marks.appendChild(el("i", "dot fix"));
      if (plannedDates.has(date)) marks.appendChild(el("i", "dot big"));
      if (spentDates.has(date)) marks.appendChild(el("i", "dot spent"));
      cell.appendChild(marks);
      cell.addEventListener("click", () => { calSelected = date; renderCalendar(today, fixedItems, plannedItems); });
      grid.appendChild(cell);
    }

    // 고른 날짜의 설명
    const detail = $("cal-detail");
    detail.innerHTML = "";
    const [, sm, sd] = calSelected.split("-").map(Number);
    detail.appendChild(el("strong", "", `${sm}월 ${sd}일${calSelected === today ? " (오늘)" : ""}`));
    const lines = [];
    for (const f of fixedItems.filter((x) => x.date === calSelected)) lines.push(["fix", `${f.name} ${won(f.amount)}${f.confirmed ? " (확인함)" : " (예정)"}`]);
    for (const p of plannedItems.filter((x) => x.date === calSelected)) lines.push(["big", `${p.memo || "지출 많은 날"} · 예상 ${won(p.amount)}`]);
    const spent = state.expenses.filter((e) => e.date === calSelected).reduce((s, e) => s + e.amount, 0);
    if (spent > 0) lines.push(["spent", `이 날 쓴 돈 ${won(spent)}`]);
    if (lines.length === 0) detail.appendChild(el("p", "cal-line", "등록된 일정이 없어요."));
    for (const [kind, text] of lines) {
      const p = el("p", "cal-line");
      p.append(el("i", "dot " + kind), " " + text);
      detail.appendChild(p);
    }
    if (calSelected >= today) {
      const add = el("button", "link", "이 날을 지출 많은 날로 등록");
      add.type = "button";
      add.addEventListener("click", () => openPlannedForm(null, calSelected));
      detail.appendChild(add);
    }

    renderSchedule(today, ym);

    // 결제일이 지났는데 실제 금액을 아직 확인 안 한 고정지출이 있으면 탭에 알림 점
    const pending = fixedItems.filter((f) => f.date <= today && !f.confirmed).length;
    document.querySelector('.tab[data-tab="calendar"]').classList.toggle("alert", pending > 0);
  }

  // 이번 달 일정 목록 (고정지출 + 지출 많은 날)
  function renderSchedule(today, ym) {
    const list = $("sched-list");
    list.innerHTML = "";
    const all = buildFixedItems(state.fixed, ym, state.fixedActual, null);
    const rows = [];
    for (const f of all) rows.push({ kind: "fixed", date: f.date, f });
    for (const p of state.planned.filter((x) => x.date.startsWith(ym))) rows.push({ kind: "planned", date: p.date, p });
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    $("sched-empty").hidden = rows.length > 0;

    for (const row of rows) {
      const li = el("li");
      li.appendChild(el("span", "when", `${Number(row.date.slice(8, 10))}일`));
      const what = el("span", "what");
      const right = el("span", "right");
      const actions = el("span", "actions");

      if (row.kind === "fixed") {
        const f = row.f;
        const orig = state.fixed.find((x) => x.id === f.id);
        const skipped = state.budgetStart && f.date < state.budgetStart;
        what.append(el("i", "dot fix"), ` ${f.name}`);
        const meta = [`매달 ${orig.day}일`];
        if (Number(f.date.slice(8, 10)) !== orig.day) meta.push(`${Number(f.date.slice(8, 10))}일로 이동`);
        if (skipped) meta.push("예산 입력 전이라 계산에서 제외");
        what.appendChild(el("small", "", meta.join(" · ")));
        right.appendChild(el("strong", "", won(f.amount)));
        if (f.confirmed) right.appendChild(el("small", "ok", "✓ 실제 금액 확인함"));
        else if (f.date <= today && !skipped) {
          const b = el("button", "mini", "실제 금액 확인");
          b.type = "button";
          b.addEventListener("click", () => openConfirmForm(f.id));
          right.appendChild(b);
        } else right.appendChild(el("small", "", "예정"));
        const edit = el("button", "", "수정"); edit.type = "button";
        edit.addEventListener("click", () => openFixedForm(f.id));
        const del = el("button", "danger", "삭제"); del.type = "button";
        del.addEventListener("click", () => deleteFixed(f.id));
        actions.append(edit, del);
      } else {
        const p = row.p;
        what.append(el("i", "dot big"), ` ${p.memo || "지출 많은 날"}`);
        what.appendChild(el("small", "", "지출 많은 날 · 예상 금액"));
        right.appendChild(el("strong", "", won(p.amount)));
        const edit = el("button", "", "수정"); edit.type = "button";
        edit.addEventListener("click", () => openPlannedForm(p.id));
        const del = el("button", "danger", "삭제"); del.type = "button";
        del.addEventListener("click", () => deletePlanned(p.id));
        actions.append(edit, del);
      }
      right.appendChild(actions);
      li.append(what, right);
      list.appendChild(li);
    }
  }

  // --- 고정지출 폼 ---
  function openFixedForm(id) {
    const f = id ? state.fixed.find((x) => x.id === id) : null;
    editingFixedId = f ? f.id : null;
    $("fixed-title").textContent = f ? "고정지출 수정하기" : "고정지출 추가하기";
    $("fixed-name").value = f ? f.name : "";
    $("fixed-amount").value = f ? f.amount : "";
    $("fixed-day").value = f ? f.day : "15";
    showError($("fixed-error"), "");
    openSheet("fixed");
  }
  $("add-fixed").addEventListener("click", () => openFixedForm(null));
  $("fixed-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const name = $("fixed-name").value.trim();
    const amount = parseAmount($("fixed-amount").value);
    const day = Number($("fixed-day").value);
    if (!name) return showError($("fixed-error"), "이름을 입력해 주세요. (예: 통신비)");
    if (!Number.isFinite(amount) || amount <= 0) return showError($("fixed-error"), "1원 이상의 금액을 입력해 주세요.");
    if (!Number.isInteger(day) || day < 1 || day > 31) return showError($("fixed-error"), "결제일은 1~31 사이의 숫자로 입력해 주세요.");
    if (editingFixedId !== null) {
      const target = state.fixed.find((x) => x.id === editingFixedId);
      if (target) Object.assign(target, { name, amount, day });
    } else {
      state.fixed.push({ id: Date.now(), name, amount, day });
    }
    save();
    closeSheet();
    render();
  });
  function deleteFixed(id) {
    if (!confirm("이 고정지출을 삭제할까요?")) return;
    state.fixed = state.fixed.filter((x) => x.id !== id);
    for (const month of Object.keys(state.fixedActual)) delete state.fixedActual[month][id];
    save();
    render();
  }

  // --- 지출 많은 날 폼 ---
  function openPlannedForm(id, presetDate) {
    const p = id ? state.planned.find((x) => x.id === id) : null;
    editingPlannedId = p ? p.id : null;
    const today = toDateString(new Date());
    const [y, m] = today.split("-").map(Number);
    $("planned-title").textContent = p ? "지출 많은 날 수정하기" : "지출 많은 날 추가하기";
    $("planned-memo").value = p ? p.memo : "";
    $("planned-amount").value = p ? p.amount : "";
    $("planned-date").value = p ? p.date : (presetDate && presetDate >= today ? presetDate : today);
    $("planned-date").min = today;
    $("planned-date").max = `${today.slice(0, 7)}-${pad2(daysInMonth(y, m))}`;
    showError($("planned-error"), "");
    openSheet("planned");
  }
  $("add-planned").addEventListener("click", () => openPlannedForm(null, calSelected));
  $("planned-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const today = toDateString(new Date());
    const date = $("planned-date").value;
    const amount = parseAmount($("planned-amount").value);
    const memo = $("planned-memo").value.trim();
    if (!date) return showError($("planned-error"), "날짜를 선택해 주세요.");
    if (!date.startsWith(today.slice(0, 7))) return showError($("planned-error"), "이번 달 안의 날짜를 골라 주세요.");
    if (date < today) return showError($("planned-error"), "오늘이나 앞으로의 날짜를 골라 주세요.");
    if (!Number.isFinite(amount) || amount <= 0) return showError($("planned-error"), "1원 이상의 예상 금액을 입력해 주세요.");
    if (editingPlannedId !== null) {
      const target = state.planned.find((x) => x.id === editingPlannedId);
      if (target) Object.assign(target, { date, amount, memo });
    } else {
      state.planned.push({ id: Date.now(), date, amount, memo });
    }
    save();
    closeSheet();
    render();
  });
  function deletePlanned(id) {
    if (!confirm("이 일정을 삭제할까요?")) return;
    state.planned = state.planned.filter((x) => x.id !== id);
    save();
    render();
  }

  // --- 결제일에 실제 금액 확인 ---
  function openConfirmForm(id) {
    const item = calCtx && calCtx.fixedItems.find((x) => x.id === id);
    if (!item) return;
    confirmingFixedId = id;
    confirmingMonth = item.date.slice(0, 7);
    $("confirm-title").textContent = `${item.name} 실제 금액`;
    $("confirm-hint").textContent = `${Number(item.date.slice(5, 7))}월에는 얼마가 나갔나요? 예정액은 ${won(item.amount)}이에요.`;
    $("confirm-amount").value = item.amount;
    showError($("confirm-error"), "");
    openSheet("confirm");
  }
  function saveActual(id, amount) {
    const ym = confirmingMonth || toDateString(new Date()).slice(0, 7);
    if (!state.fixedActual[ym]) state.fixedActual[ym] = {};
    state.fixedActual[ym][id] = amount;
    save();
    closeSheet();
    render();
  }
  $("confirm-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const amount = parseAmount($("confirm-amount").value);
    if (!Number.isFinite(amount) || amount < 0) return showError($("confirm-error"), "금액을 숫자로 입력해 주세요.");
    saveActual(confirmingFixedId, amount);
  });
  $("confirm-keep").addEventListener("click", () => {
    const f = state.fixed.find((x) => x.id === confirmingFixedId);
    if (f) saveActual(f.id, f.amount);
  });
  for (const id of ["fixed-close", "planned-close", "confirm-close"]) $(id).addEventListener("click", closeSheet);

  // 게임식 디자인용 표시 (코인 칸, 말풍선, 코스 진행). 기본 디자인에서는 숨겨져 있어 영향이 없다.
  let lastUsedCoins = null;
  let firstGameRender = true;
  function renderGame(r, p, today) {
    // 코인 10칸: 오늘 한도를 10등분해서 쓴 만큼 비운다
    const used = r.todayLimit === 0 ? 10 : Math.min(10, Math.floor((r.spentToday / r.todayLimit) * 10));
    const coins = $("g-coins");
    coins.innerHTML = "";
    for (let i = 0; i < 10; i++) {
      const c = document.createElement("i");
      if (i < used) c.className = "gone" + (lastUsedCoins !== null && i >= lastUsedCoins ? " pop" : "");
      coins.appendChild(c);
    }
    lastUsedCoins = used;

    // 말풍선
    const left = won(Math.max(r.todayLeft, 0));
    let msg;
    if (p.level === "ok") msg = `오늘은 <b>${left}</b>까지 쓸 수 있어요! 아직 코인이 넉넉해요.`;
    else if (r.todayLeft < 0) msg = `${p.message} <b>${won(r.todayLeft)}</b> 초과예요.`;
    else msg = `${p.message} <b>${left}</b> 남았어요.`;
    $("g-bubble").innerHTML = msg;

    // 월말까지 코스: 오늘이 이번 달 며칠째인지
    const [y, m, d] = today.split("-").map(Number);
    const total = daysInMonth(y, m);
    $("g-course-text").textContent = `월말까지 ${d}일 / ${total}일`;
    const pct = (d / total) * 100 + "%";
    const walker = $("g-walker");
    const apply = () => { $("g-done").style.width = pct; walker.style.left = pct; };
    if (firstGameRender) {
      // 처음 열 때만 시작점에서 오늘 위치까지 걸어간다
      firstGameRender = false;
      $("g-done").style.width = "0%";
      walker.style.left = "0%";
      walker.classList.add("walk");
      setTimeout(() => { apply(); }, 80);
      setTimeout(() => walker.classList.remove("walk"), 1100);
    } else {
      apply();
    }
  }

  function renderStats(today) {
    const s = monthStats(state.expenses, today);
    const hasData = s.total > 0;
    $("stats-empty").hidden = hasData;
    $("stats-body").hidden = !hasData;
    if (!hasData) return;

    $("stat-total").textContent = won(s.total);
    $("stat-average").textContent = won(s.average);
    $("stat-maxday").textContent = `${s.maxDay.day}일 · ${won(s.maxDay.amount)}`;

    // 카테고리별: 비율 막대
    const catList = $("cat-stats");
    catList.innerHTML = "";
    for (const c of s.byCategory) {
      const li = document.createElement("li");
      const row = document.createElement("div");
      row.className = "cat-row";
      const name = document.createElement("span");
      name.textContent = c.name;
      const value = document.createElement("span");
      value.textContent = won(c.amount);
      const pct = document.createElement("span");
      pct.className = "pct";
      pct.textContent = c.percent + "%";
      value.appendChild(pct);
      row.append(name, value);
      const track = document.createElement("div");
      track.className = "cat-track";
      const fill = document.createElement("div");
      fill.className = "cat-fill";
      fill.style.width = c.percent + "%";
      track.appendChild(fill);
      li.append(row, track);
      catList.appendChild(li);
    }

    // 일별 지출: 세로 막대 (가장 많이 쓴 날이 100%)
    const chart = $("day-chart");
    chart.innerHTML = "";
    const max = s.maxDay.amount;
    const month = today.slice(5, 7);
    for (const d of s.byDay) {
      const bar = document.createElement("div");
      bar.className = "day-bar" + (d.amount === 0 ? " zero" : "") + (d.day === s.today ? " today" : "");
      bar.style.height = d.amount === 0 ? "3px" : Math.max(3, Math.round((d.amount / max) * 100)) + "%";
      bar.title = `${month}/${String(d.day).padStart(2, "0")} ${won(d.amount)}`;
      chart.appendChild(bar);
    }
    $("axis-mid").textContent = "15일";
    $("axis-last").textContent = s.days + "일";
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

  // 탭 전환 (오늘 / 내역 / 통계)
  function showTab(name) {
    for (const el of document.querySelectorAll(".tab-panel")) {
      el.hidden = el.id !== "tab-" + name;
    }
    for (const btn of document.querySelectorAll(".tab")) {
      btn.classList.toggle("on", btn.dataset.tab === name);
    }
    window.scrollTo(0, 0);
  }
  for (const btn of document.querySelectorAll(".tab")) {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
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
    showTab("today"); // 입력 폼이 "오늘" 탭에 있으므로 이동
    openSheet("expense");
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
    // 용돈 받는 날: 비워 두면 월말까지로 계산
    const paydayText = $("payday-input").value.trim();
    const payday = paydayText === "" ? null : Number(paydayText);
    if (payday !== null && (!Number.isInteger(payday) || payday < 1 || payday > 31)) {
      showError($("budget-error"), "용돈 받는 날은 1~31 사이의 숫자로 입력하거나 비워 두세요.");
      return;
    }
    showError($("budget-error"), "");
    state.budget = value;
    state.month = toDateString(new Date()).slice(0, 7);
    state.budgetStart = toDateString(new Date()); // 이 날 이전에 나간 고정지출은 입력한 예산에 이미 반영된 것으로 본다
    state.payday = payday;
    state.periodEnd = payday !== null ? nextPayday(state.budgetStart, payday) : null;
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
    const isNew = editingId === null;
    if (!isNew) {
      const target = state.expenses.find((x) => x.id === editingId);
      if (target) Object.assign(target, { amount: value, date, category, memo });
    } else {
      state.expenses.push({ id: Date.now(), amount: value, date, category, memo });
    }
    save();
    resetForm();
    closeSheet();
    render();
    if (isNew) spendFx(value);
  });

  $("edit-cancel").addEventListener("click", () => {
    resetForm();
    closeSheet();
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
