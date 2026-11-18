// backend/utils/searchLimit.js
const UserUsage = require('../models/UserUsage');

const DEFAULT_DAILY_LIMIT = 3;

function getToday() {
  return new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
}

/**
 * Atomically check & increment user's daily search count.
 *
 * Returns:
 *   { allowed: true, remaining: number, limit: number }
 *   { allowed: false, error: string, limit: number }
 *
 * Ye atomic hai — do simultaneous requests bhi limit cross nahi kar sakti.
 */
async function checkAndUpdateSearchLimit(userId) {
  const today = getToday();

  try {
    // ═══ CASE 1: SAME DAY — increment if under limit ═══
    const updated = await UserUsage.findOneAndUpdate(
      {
        userId,
        lastSearchDate: today,
        $expr: { $lt: ['$searchesToday', '$searchLimit'] }, // dynamic limit respect
      },
      {
        $inc: { searchesToday: 1, totalSearches: 1 },
      },
      { new: true }
    );

    if (updated) {
      return {
        allowed: true,
        remaining: updated.searchLimit - updated.searchesToday,
        limit: updated.searchLimit,
      };
    }

    // ═══ CASE 2: NEW DAY — reset counter & increment ═══
    const reset = await UserUsage.findOneAndUpdate(
      { userId, lastSearchDate: { $ne: today } },
      {
        $set: { searchesToday: 1, lastSearchDate: today },
        $inc: { totalSearches: 1 },
      },
      { new: true }
    );

    if (reset) {
      return {
        allowed: true,
        remaining: reset.searchLimit - 1,
        limit: reset.searchLimit,
      };
    }

    // ═══ CASE 3: FIRST-EVER SEARCH — create record ═══
    try {
      const created = await UserUsage.create({
        userId,
        searchesToday: 1,
        lastSearchDate: today,
        totalSearches: 1,
        searchLimit: DEFAULT_DAILY_LIMIT,
      });

      return {
        allowed: true,
        remaining: created.searchLimit - 1,
        limit: created.searchLimit,
      };
    } catch (err) {
      // Race condition: another request created it first
      if (err.code === 11000) {
        const retry = await UserUsage.findOneAndUpdate(
          {
            userId,
            lastSearchDate: today,
            $expr: { $lt: ['$searchesToday', '$searchLimit'] },
          },
          { $inc: { searchesToday: 1, totalSearches: 1 } },
          { new: true }
        );

        if (retry) {
          return {
            allowed: true,
            remaining: retry.searchLimit - retry.searchesToday,
            limit: retry.searchLimit,
          };
        }
      } else {
        throw err;
      }
    }

    // ═══ CASE 4: LIMIT REACHED ═══
    const current = await UserUsage.findOne({ userId });
    return {
      allowed: false,
      error: `Daily search limit reached (${current?.searchLimit || DEFAULT_DAILY_LIMIT}/day). Please upgrade or try tomorrow.`,
      limit: current?.searchLimit || DEFAULT_DAILY_LIMIT,
    };
  } catch (err) {
    console.error('[searchLimit] Error:', err);
    // Fail-safe: agar DB mein kuch galat ho jaye to search block na karein
    return {
      allowed: true,
      remaining: 0,
      limit: DEFAULT_DAILY_LIMIT,
      warning: 'Usage tracking failed, but search allowed',
    };
  }
}

/**
 * Get current usage without incrementing (for UI display).
 */
async function getSearchUsage(userId) {
  const today = getToday();
  const usage = await UserUsage.findOne({ userId });

  if (!usage) {
    return { used: 0, limit: DEFAULT_DAILY_LIMIT, remaining: DEFAULT_DAILY_LIMIT };
  }

  // Agar purana din hai to 0 consider karein
  if (usage.lastSearchDate !== today) {
    return { used: 0, limit: usage.searchLimit, remaining: usage.searchLimit };
  }

  return {
    used: usage.searchesToday,
    limit: usage.searchLimit,
    remaining: Math.max(0, usage.searchLimit - usage.searchesToday),
  };
}

module.exports = {
  checkAndUpdateSearchLimit,
  getSearchUsage,
  DEFAULT_DAILY_LIMIT,
};
