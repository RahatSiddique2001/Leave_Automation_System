// Later we can enhance calculateLeaveDays function:
export function calculateLeaveDays(startDate, endDate, excludeWeekends = false) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (!excludeWeekends) {
        // Current simple approach
        const timeDiff = end.getTime() - start.getTime();
        return Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
    } else {
        // Enhanced version excluding weekends
        let count = 0;
        let current = new Date(start);
        
        while (current <= end) {
            const day = current.getDay();
            if (day !== 5 && day !== 6) { // Not Friday (0) or Saturday (6)
                count++;
            }
            current.setDate(current.getDate() + 1);
        }
        return count;
    }
}

// Later add holiday database
export async function calculateLeaveDaysWithHolidays(startDate, endDate, excludeWeekends = false) {
    const holidays = await getHolidays(); // Fetch from Firestore
    // Enhanced logic that excludes holidays
}