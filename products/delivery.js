// delivery.js
function calculateDeliveryDate(daysToAdd) {
    // 2026년 공휴일 목록 (매년 초 업데이트 필요)
    const holidays = [
        "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18",
        "2026-03-01", "2026-05-05", "2026-05-24", "2026-06-06",
        "2026-08-15", "2026-09-24", "2026-09-25", "2026-09-26",
        "2026-10-03", "2026-10-09", "2026-12-25"
    ];
    let date = new Date();
    let added = 0;
    while (added < daysToAdd) {
        date.setDate(date.getDate() + 1);
        const isWeekend = (date.getDay() === 0 || date.getDay() === 6);
        const dateStr = date.toISOString().split('T')[0];
        const isHoliday = holidays.includes(dateStr);
        if (!isWeekend && !isHoliday) {
            added++;
        }
    }
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate() + 1}일`;
}
