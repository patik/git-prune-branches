/**
 * Creates a "time ago" string from a timestamp
 */
export function formatTimeAgo(timestamp: number): string {
    const nowDate = new Date()
    const pastDate = new Date(timestamp * 1000)

    const diffMs = nowDate.getTime() - pastDate.getTime()
    const diffSeconds = Math.floor(diffMs / 1000)

    const minute = 60
    const hour = minute * 60
    const day = hour * 24
    const week = day * 7

    if (diffSeconds < minute) {
        return 'just now'
    }
    if (diffSeconds < hour) {
        const mins = Math.floor(diffSeconds / minute)
        return `${mins}m ago`
    }
    if (diffSeconds < day) {
        const hours = Math.floor(diffSeconds / hour)
        return `${hours}h ago`
    }
    if (diffSeconds < week) {
        const days = Math.floor(diffSeconds / day)
        return `${days}d ago`
    }

    // For weeks, we can safely use fixed 7-day intervals
    const weeks = Math.floor(diffSeconds / week)

    // Compute calendar-based years difference
    const nowYear = nowDate.getFullYear()
    const pastYear = pastDate.getFullYear()
    const nowMonth = nowDate.getMonth()
    const pastMonth = pastDate.getMonth()
    const nowDay = nowDate.getDate()
    const pastDay = pastDate.getDate()

    let years = nowYear - pastYear
    if (nowMonth < pastMonth || (nowMonth === pastMonth && nowDay < pastDay)) {
        years -= 1
    }

    if (years >= 1) {
        return `${years}y ago`
    }

    // Compute calendar-based months difference (less than a year)
    let months = (nowYear - pastYear) * 12 + (nowMonth - pastMonth)
    if (nowDay < pastDay) {
        months -= 1
    }

    if (months >= 1) {
        return `${months}mo ago`
    }

    // If less than one full calendar month has elapsed, fall back to weeks
    return `${weeks}w ago`
}
