// 실행: node test.js
const assert = require("assert");
const { calculate, progressInfo, monthStats, adjustPayDate, buildFixedItems, adjustPayday, nextPayday, daysBetween } = require("./app.js");

const eq = (actual, expected, name) => {
  assert.deepStrictEqual(actual, expected, name);
  console.log("OK  ", name);
};

// 11월은 30일. 예산 300,000원
// 1) 11/1, 지출 없음: 300000 ÷ 30 = 10000
eq(calculate(300000, [], "2026-11-01"),
  { daysLeft: 30, todayLimit: 10000, spentToday: 0, todayLeft: 10000, monthLeft: 300000 },
  "월 첫날, 지출 0원");

// 2) 11/20 (남은 11일), 이전 지출 120,000: (300000-120000)/11 = 16363.6 -> 16363
eq(calculate(300000, [{ amount: 120000, date: "2026-11-10" }], "2026-11-20"),
  { daysLeft: 11, todayLimit: 16363, spentToday: 0, todayLeft: 16363, monthLeft: 180000 },
  "중간 날짜, 나눠떨어지지 않는 경우(내림)");

// 3) 오늘 지출 반영
eq(calculate(300000, [{ amount: 120000, date: "2026-11-10" }, { amount: 5000, date: "2026-11-20" }], "2026-11-20"),
  { daysLeft: 11, todayLimit: 16363, spentToday: 5000, todayLeft: 11363, monthLeft: 175000 },
  "오늘 지출은 오늘 한도에서만 차감");

// 4) 월 마지막 날: 남은 예산 전체가 한도
eq(calculate(300000, [{ amount: 250000, date: "2026-11-15" }], "2026-11-30"),
  { daysLeft: 1, todayLimit: 50000, spentToday: 0, todayLeft: 50000, monthLeft: 50000 },
  "월 마지막 날");

// 5) 오늘 한도 초과
eq(calculate(300000, [], "2026-11-01").todayLeft, 10000, "초과 전");
eq(calculate(300000, [{ amount: 13000, date: "2026-11-01" }], "2026-11-01").todayLeft, -3000,
  "오늘 한도 초과(음수)");

// 6) 예산을 이미 넘긴 상태: 한도 0, 월 남은 예산 음수
eq(calculate(100000, [{ amount: 130000, date: "2026-11-05" }], "2026-11-10"),
  { daysLeft: 21, todayLimit: 0, spentToday: 0, todayLeft: 0, monthLeft: -30000 },
  "예산 초과 상태");

// 7) 다른 달 지출은 무시
eq(calculate(300000, [{ amount: 99999, date: "2026-10-31" }], "2026-11-01").monthLeft, 300000,
  "다른 달 지출 제외");

// 8) 2월(윤년 아님) 28일
eq(calculate(280000, [], "2027-02-01").todayLimit, 10000, "2월 28일");

// ===== 진행 막대 단계 =====
// 한도 10,000원 기준 (월 첫날, 예산 300,000원)
const stage = (spent) =>
  progressInfo(calculate(300000, spent ? [{ amount: spent, date: "2026-11-01" }] : [], "2026-11-01"));

eq(stage(0).level + ":" + stage(0).percent, "ok:0", "지출 0원 = 초록 0%");
eq(stage(7999).level, "ok", "79.99% = 초록");
eq(stage(8000).level + ":" + stage(8000).percent, "warn:80", "80% = 주황 경계");
eq(stage(9500).level, "warn", "95% = 주황");
eq(stage(10000).level + ":" + stage(10000).percent, "warn:100", "정확히 한도 = 주황 100%");
eq(stage(10001).level + ":" + stage(10001).percent, "bad:100", "1원 초과 = 빨강(막대는 100%에서 멈춤)");
eq(stage(15000).label, "오늘 한도의 150% 사용", "초과 비율 문구");

// 예산을 다 쓴 상태: 한도 0원
const broke = progressInfo(calculate(100000, [{ amount: 130000, date: "2026-11-05" }], "2026-11-10"));
eq(broke.level + ":" + broke.percent, "bad:100", "예산 소진 = 빨강 100%");

// ===== 이번 달 통계 =====
const sample = [
  { amount: 6000, date: "2026-11-03", category: "식비" },
  { amount: 4000, date: "2026-11-03", category: "카페·간식" },
  { amount: 10000, date: "2026-11-10", category: "식비" },
  { amount: 5000, date: "2026-11-20" },          // 카테고리 없음 → 기타
  { amount: 99999, date: "2026-10-31", category: "쇼핑" }, // 다른 달 → 제외
];
const st = monthStats(sample, "2026-11-20");
eq(st.total, 25000, "통계: 이번 달 총 지출(다른 달 제외)");
eq(st.byCategory.map((c) => `${c.name}:${c.amount}:${c.percent}`),
  ["식비:16000:64", "기타:5000:20", "카페·간식:4000:16"], "통계: 카테고리별 합계와 비율(많은 순)");
eq(st.byDay.length, 30, "통계: 11월은 30일");
eq(st.byDay[2].amount, 10000, "통계: 같은 날 지출 합산");
eq(st.maxDay, { day: 3, amount: 10000 }, "통계: 가장 많이 쓴 날");
eq(st.average, 1250, "통계: 하루 평균(25000 ÷ 오늘 20일)");
const empty = monthStats([], "2026-11-20");
eq([empty.total, empty.byCategory.length, empty.maxDay.amount, empty.average], [0, 0, 0, 0], "통계: 지출 없음");

// ===== 고정지출 결제일: 주말이면 돌아오는 월요일로 =====
eq(adjustPayDate(2026, 12, 15), "2026-12-15", "결제일: 평일(화)이면 그대로");
eq(adjustPayDate(2026, 11, 15), "2026-11-16", "결제일: 일요일 → 월요일");
eq(adjustPayDate(2026, 11, 14), "2026-11-16", "결제일: 토요일 → 월요일");
eq(adjustPayDate(2026, 11, 1), "2026-11-02", "결제일: 1일이 일요일 → 2일 월요일");
eq(adjustPayDate(2026, 5, 30), "2026-05-29", "결제일: 월말 토요일 → 월요일이 다음 달이라 앞 금요일로");
eq(adjustPayDate(2026, 5, 31), "2026-05-29", "결제일: 월말 일요일 → 앞 금요일로");
eq(adjustPayDate(2027, 2, 31), "2027-02-26", "결제일: 31일 지정, 2월은 28일(일요일) → 앞 금요일");
eq(adjustPayDate(2026, 11, 31), "2026-11-30", "결제일: 31일 지정, 11월은 30일(월요일)");

// ===== 이번 달 고정지출 목록 =====
const fixedList = [
  { id: 1, name: "통신비", amount: 55000, day: 15 },
  { id: 2, name: "교통비", amount: 60000, day: 15 },
];
eq(buildFixedItems(fixedList, "2026-11", { "2026-11": { 1: 52800 } }, "2026-11-01"),
  [
    { id: 1, name: "통신비", date: "2026-11-16", amount: 52800, confirmed: true },
    { id: 2, name: "교통비", date: "2026-11-16", amount: 60000, confirmed: false },
  ],
  "고정지출: 확인한 금액은 실제 금액, 아니면 예정액");
eq(buildFixedItems(fixedList, "2026-11", {}, "2026-11-17"), [],
  "고정지출: 예산 입력일 전에 이미 나간 것은 제외");
eq(buildFixedItems(fixedList, "2026-12", { "2026-11": { 1: 1 } }, "2026-12-01").map((x) => x.amount),
  [55000, 60000], "고정지출: 다른 달에 확인한 금액은 이번 달에 영향 없음");
eq(buildFixedItems([], "2026-11", {}, "2026-11-01"), [], "고정지출: 등록한 것이 없으면 빈 목록");

// ===== 오늘 한도에 고정지출·예정 지출 반영 =====
const noPlan = calculate(300000, [], "2026-11-01");
eq(calculate(300000, [], "2026-11-01", { fixed: [], planned: [] }), noPlan, "계획이 비어 있으면 기존 계산과 같음");

eq(calculate(300000, [], "2026-11-01", { fixed: [{ date: "2026-11-16", amount: 50000 }] }),
  { daysLeft: 30, todayLimit: 8333, spentToday: 0, todayLeft: 8333, monthLeft: 250000 },
  "고정지출 50,000원을 미리 빼고 계산 (250000÷30)");

eq(calculate(300000, [{ amount: 120000, date: "2026-11-10" }], "2026-11-20",
  { planned: [{ date: "2026-11-28", amount: 30000 }] }).todayLimit, 13636,
  "예정 지출(28일 30,000원)을 미리 빼 두면 오늘 한도가 줄어듦 (150000÷11)");

eq(calculate(300000, [{ amount: 200000, date: "2026-11-10" }], "2026-11-28",
  { planned: [{ date: "2026-11-28", amount: 30000 }] }).todayLimit, 53333,
  "예정한 날이 되면 그날 몫(30,000원)이 한도에 더해짐 (70000÷3 + 30000)");

eq(calculate(300000, [{ amount: 120000, date: "2026-11-10" }], "2026-11-20",
  { planned: [{ date: "2026-11-10", amount: 30000 }] }).todayLimit, 16363,
  "이미 지난 예정일은 무시");

eq(calculate(300000, [], "2026-11-01", { fixed: [{ date: "2026-10-16", amount: 50000 }, { date: "2026-12-16", amount: 50000 }] }).todayLimit, 10000,
  "다른 달 고정지출은 무시");

eq(calculate(100000, [], "2026-11-01", { fixed: [{ date: "2026-11-16", amount: 120000 }] }),
  { daysLeft: 30, todayLimit: 0, spentToday: 0, todayLeft: 0, monthLeft: -20000 },
  "고정지출이 예산보다 크면 한도 0원");

// 고정지출이 결제일을 지나도 한도가 갑자기 늘지 않는다 (이미 빼 둔 금액이므로)
const plan16 = { fixed: [{ date: "2026-11-16", amount: 50000 }] };
eq(calculate(300000, [], "2026-11-16", plan16).monthLeft, 250000, "결제일 당일에도 이번 달 남은 예산은 그대로");
eq(calculate(300000, [], "2026-11-17", plan16).monthLeft, 250000, "결제일 이후에도 이번 달 남은 예산은 그대로");

// ===== 용돈일(월급일) 기준 =====
eq(adjustPayday(2026, 11, 25), "2026-11-25", "용돈일: 평일(수)이면 그대로");
eq(adjustPayday(2026, 10, 25), "2026-10-23", "용돈일: 일요일이면 앞의 금요일");
eq(adjustPayday(2026, 11, 28), "2026-11-27", "용돈일: 토요일이면 앞의 금요일");
eq(adjustPayday(2026, 11, 31), "2026-11-30", "용돈일: 31일 지정, 11월은 30일(월)");
eq(nextPayday("2026-11-20", 25), "2026-11-25", "다음 용돈일: 이번 달 용돈일이 아직 안 지남");
eq(nextPayday("2026-11-25", 25), "2026-12-25", "다음 용돈일: 오늘이 용돈일이면 다음 달");
eq(nextPayday("2026-11-26", 25), "2026-12-25", "다음 용돈일: 이미 지났으면 다음 달");
eq(nextPayday("2026-12-26", 25), "2027-01-25", "다음 용돈일: 12월 → 이듬해 1월");
eq(nextPayday("2026-10-23", 25), "2026-11-25", "다음 용돈일: 주말이라 금요일(23일)로 당겨진 날 당일이면 다음 달");
eq(daysBetween("2026-11-20", "2026-11-25"), 5, "일수 차이");
eq(daysBetween("2026-12-31", "2027-01-05"), 5, "일수 차이: 해를 넘김");

const p1 = { start: "2026-11-01", end: "2026-11-25" };
eq(calculate(300000, [{ amount: 100000, date: "2026-11-10" }], "2026-11-20", p1).todayLimit, 40000,
  "용돈일 기준: 25일까지 5일 (200000÷5)");
eq(calculate(300000, [], "2026-11-24", p1).daysLeft, 1, "용돈일 전날은 남은 일수 1일");

const p2 = { start: "2026-11-25", end: "2026-12-25" };
eq(calculate(300000, [{ amount: 60000, date: "2026-11-28" }], "2026-12-02", p2).todayLimit, 10434,
  "용돈일 기준: 달을 넘겨도 지난 달 지출 포함 (240000÷23)");
eq(calculate(300000, [{ amount: 99999, date: "2026-11-24" }], "2026-12-02", p2).todayLimit, 13043,
  "용돈일 기준: 기간 시작 전 지출은 제외 (300000÷23)");
eq(calculate(300000, [{ amount: 60000, date: "2026-11-28" }], "2026-12-02",
  { ...p2, planned: [{ date: "2026-12-10", amount: 30000 }] }).todayLimit, 9130,
  "용돈일 기준: 다음 달에 있는 예정 지출도 미리 뺌 (210000÷23)");
eq(calculate(300000, [{ amount: 60000, date: "2026-11-28" }], "2026-12-02",
  { ...p2, planned: [{ date: "2026-12-25", amount: 30000 }] }).todayLimit, 10434,
  "용돈일 기준: 용돈일 당일 이후의 예정은 무시");
eq(calculate(300000, [{ amount: 60000, date: "2026-11-28" }], "2026-12-02",
  { ...p2, fixed: [{ date: "2026-12-15", amount: 50000 }] }).todayLimit, 8260,
  "용돈일 기준: 기간 안의 고정지출 반영 (190000÷23)");

console.log("\n모든 테스트 통과");
