You are reviewing MV-DESIGN-PRO as a senior UX/product designer for engineering software, a SCADA/CAD workflow reviewer, a power-network calculation workflow reviewer, and a QA lead.

Scope:
- Review only UI/UX, interaction, calculation-result visibility, analysis table design, SLD-to-results workflow, and report/proof navigation.
- Do not invent electrical domain rules.
- Do not change solver physics or protection logic.
- Do not rewrite the product vision.
- Optimize for engineering clarity, no false zeroes, no dead ends, and immediate visibility of completed backend calculations.

Context:
- The app is MV-DESIGN-PRO for MV network designers.
- Backend IEC 60909 short-circuit calculations return valid rows with Ik'', ip, Ith and Sk''.
- Current main Analysis surface still shows generic ENM rows with "nie wyznaczono" after a completed short-circuit run, making the user believe nothing can be calculated.
- Frontend must display backend frozen result/proof data, not compute physics in UI.

Tasks:
1. Identify UX and workflow risks caused by hiding completed calculation results.
2. Propose implementation-aware fixes for the default Analysis surface.
3. Define acceptance criteria for short-circuit result display, no false zero, loading/error states, and report/proof handoff.
4. Distinguish must-fix from optional polish.
5. State what must not change to preserve domain correctness.

Return exactly these sections:
# Summary of top UX risks
# Must-fix issues
# Suggested flow improvements
# Screen/component-level recommendations
# Testable acceptance criteria
# Risks and trade-offs
# What not to change
# Accepted / Rejected / Deferred decision template
