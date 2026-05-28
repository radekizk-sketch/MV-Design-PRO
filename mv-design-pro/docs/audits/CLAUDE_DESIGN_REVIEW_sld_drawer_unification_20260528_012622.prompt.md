You are reviewing MV-DESIGN-PRO as a senior UX/product designer for engineering software, a SCADA/CAD interaction designer, and a power-network workflow reviewer.

Scope:
- Review only UI/UX, detail drawers, right-side technical cards, SLD selection, click/double-click/right-click behavior, configuration workflow, remove/delete, merge/split actions, and engineering discoverability.
- Do not rewrite the product vision.
- Do not invent electrical domain rules.
- Do not change solver physics, protection logic, ENM semantics, or catalog truth.
- Optimize for MV network designer workflow, one predictable panel per selected object, Polish engineering labels, no dead clicks, no hidden state, and no false zeros.

Context:
- MV-DESIGN-PRO uses an SLD V2 canvas and right-side engineering surfaces.
- Current problem: some selected SLD objects open an overlay drawer, some replace the right panel, and some leave the user without an actionable configuration path.
- The desired design is a unified object drawer/card model: every selectable SLD element has a clear technical card, configuration CTA, valid domain actions, disabled reasons, and navigation to full screens only when needed.
- Actions include: configure, open full view, remove/delete where allowed, merge/scal where domain-safe, split only as explicit command with preview/cancel/commit/audit.
- Active UI labels must be Polish and engineering-oriented.

Tasks:
1. Identify UX friction points in the current mixed drawer/right-panel architecture.
2. Define must-fix acceptance criteria for a unified drawer system.
3. Recommend which drawers should be removed, merged, or kept as full-screen surfaces.
4. Recommend a testable interaction model for left click, double click, right click, and disabled actions.
5. Recommend how remove/delete and merge/split should be exposed safely without changing domain rules.
6. Identify risks and what must not change because it protects ENM/domain correctness.

Return exactly these sections:
# Summary of top UX risks
# Must-fix issues
# Suggested unified drawer flow
# Screen/component-level recommendations
# Testable acceptance criteria
# Risks and trade-offs
# What not to change
# Recommended follow-up tests

Keep the review concise, actionable, and testable. Mark any domain-dependent recommendation as requiring existing ENM/domain operation support, not a new physics rule.
