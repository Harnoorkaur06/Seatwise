/* ==========================================================================
   conflicts.js
   Thin helper layer over the current seating plan's conflict list, used by
   conflicts.html. Actual detection lives in seatingAlgorithm.js; actual
   resolution (apply suggestion) lives in seating.js.
   ========================================================================== */

const Conflicts = {
  current() {
    const plan = STORAGE.getSeatingPlan();
    return plan ? plan.conflicts : [];
  },

  stats() {
    const plan = STORAGE.getSeatingPlan();
    if (!plan) {
      return { totalConflicts: 0, unassignedCount: 0, conflictRate: 0, validityPercentage: 100 };
    }
    return plan.stats;
  },

  /** Resolve a conflict by moving studentB to a suggested empty seat */
  resolve(conflict) {
    const plan = STORAGE.getSeatingPlan();
    const suggestions = SeatingAlgorithm.suggestSeats(plan, conflict.subject, conflict.studentB.rollNo, 1);
    if (suggestions.length === 0) {
      return { ok: false, message: "No alternative seat currently available for this student." };
    }
    return Seating.applySuggestion(conflict.studentB.rollNo, suggestions[0]);
  }
};
