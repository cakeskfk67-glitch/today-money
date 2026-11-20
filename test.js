// 실행: node test.js
const assert = require("assert");
const { calculate } = require("./app.js");

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

console.log("\n모든 테스트 통과");
