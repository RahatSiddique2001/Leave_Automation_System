// js/leave-config.js
export const DEFAULT_LEAVE_BALANCES = {
    casual: 10,      // 10 days
    medical: 14,     // 14 days
    earned: 30,      // 30 days
    study: 730,      // 2 years (730 days)
    station: 15,     // 15 days
    maternity: 180,  // 6 months (180 days)
    other: 7         // 7 days
};

export const ACADEMIC_YEAR_START_MONTH = 6; // July (0-indexed: 0=Jan, 6=July)

export function getCurrentAcademicYear() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // If current month is before July, academic year is previousYear-currentYear
    // If current month is July or after, academic year is currentYear-nextYear
    if (month < ACADEMIC_YEAR_START_MONTH) {
        return `${year - 1}-${year}`;
    } else {
        return `${year}-${year + 1}`;
    }
}

export function calculateLeaveDays(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Calculate difference in days (inclusive of both start and end dates)
    const timeDiff = end.getTime() - start.getTime();
    const dayDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;

    return dayDiff > 0 ? dayDiff : 0;
}