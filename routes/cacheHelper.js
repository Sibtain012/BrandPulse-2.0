/**
 * Smart Cache Helper for BrandPulse
 * Calculates date range coverage to determine if cached data can be served
 */

/**
 * Calculate number of days between two dates (inclusive)
 */
function calculateDaysBetween(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end
    return diffDays;
}

/**
 * Calculate overlap between requested date range and a cached date range
 * Returns number of days covered
 */
function calculateOverlap(requestedStart, requestedEnd, cachedStart, cachedEnd) {
    const reqStart = new Date(requestedStart);
    const reqEnd = new Date(requestedEnd);
    const cacheStart = new Date(cachedStart);
    const cacheEnd = new Date(cachedEnd);

    // Find overlap boundaries
    const overlapStart = reqStart > cacheStart ? reqStart : cacheStart;
    const overlapEnd = reqEnd < cacheEnd ? reqEnd : cacheEnd;

    // No overlap if ranges don't intersect
    if (overlapStart > overlapEnd) {
        return 0;
    }

    // Calculate days in overlap
    const diffTime = Math.abs(overlapEnd - overlapStart);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
}

/**
 * Calculate cache coverage for a keyword based on date ranges
 * Returns the best matching cached analysis (highest coverage, most recent if tied)
 */
export async function calculateCacheCoverage(pool, keyword, userId, requestedStartDate, requestedEndDate, platformId = 1) {
    try {
        // Find all completed past analyses for this keyword that have actual data in gold layer
        const pastRequests = await pool.query(`
            SELECT DISTINCT gk.global_keyword_id, gk.start_date, gk.end_date, gk.last_run_at, gk.status 
            FROM global_keywords gk
            WHERE gk.keyword = $1 
            AND gk.user_id = $2 
            AND gk.platform_id = $3 
            AND gk.status = 'COMPLETED'
            AND EXISTS (
                SELECT 1 FROM fact_sentiment_events
                WHERE request_id = gk.global_keyword_id
                AND platform_id = $3
                LIMIT 1
            )
            ORDER BY gk.last_run_at DESC
        `, [keyword, userId, platformId]);

        if (pastRequests.rows.length === 0) {
            return {
                coverage: 0,
                bestMatch: null,
                reason: 'No previous analyses found'
            };
        }

        const requestedDays = calculateDaysBetween(requestedStartDate, requestedEndDate);

        // Evaluate each cached analysis for coverage
        let bestMatch = null;
        let bestCoverage = 0;

        for (const cached of pastRequests.rows) {
            const overlapDays = calculateOverlap(
                requestedStartDate,
                requestedEndDate,
                cached.start_date,
                cached.end_date
            );

            const coverage = (overlapDays / requestedDays) * 100;

            // Pick this as best if it has better coverage
            // If tied, the ORDER BY last_run_at DESC ensures we pick most recent
            if (coverage > bestCoverage) {
                bestCoverage = coverage;
                bestMatch = {
                    requestId: cached.global_keyword_id,
                    startDate: cached.start_date,
                    endDate: cached.end_date,
                    lastRunAt: cached.last_run_at,
                    overlapDays: overlapDays,
                    requestedDays: requestedDays
                };
            }
        }

        return {
            coverage: bestCoverage,
            bestMatch: bestMatch,
            reason: bestCoverage >= 75
                ? `Cache hit: ${bestCoverage.toFixed(1)}% coverage from request #${bestMatch.requestId}`
                : `Cache miss: Only ${bestCoverage.toFixed(1)}% coverage (need ≥75%)`
        };

    } catch (error) {
        console.error('[Cache Helper] Error calculating coverage:', error);
        return {
            coverage: 0,
            bestMatch: null,
            reason: 'Error calculating cache coverage'
        };
    }
}
