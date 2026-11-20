// 실행: node test.js
const assert = require("assert");
const { calculate, progressInfo, monthStats } = require("./app.js");

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

console.log("\n모든 테스트 통과");
