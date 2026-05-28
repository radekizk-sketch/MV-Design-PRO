# Claude Design Review Decision Log — network_designer_end_to_end_flow

Review: `docs/audits/CLAUDE_DESIGN_REVIEW_network_designer_end_to_end_flow_20260526_222041.md`
Prompt: `docs/audits/CLAUDE_DESIGN_REVIEW_network_designer_end_to_end_flow_20260526_222041.prompt.md`
Meta: `docs/audits/CLAUDE_DESIGN_REVIEW_network_designer_end_to_end_flow_20260526_222041.meta.json`

## Accepted

- Explicit action labels are mandatory in engineering flow. The station configurator must not expose a combined `Dodaj PV/BESS/FW` action that actually starts only PV; split the action into explicit PV, BESS and FW commands.
- Wizard automation must be visible and reversible. A DER voltage mismatch must not silently change the chosen connection variant; show a blocking engineering message with an explicit `Przełącz na TR dedykowany` action and a way to choose another device.
- Catalog-like selection in DER configuration should be table/list oriented, with technical columns and compatibility status, not only a long native select label. This is accepted only for presentation; physics and eligibility still come from existing catalog/domain helpers.
- The review process itself is accepted as a permanent quality gate: prompt, answer, metadata, exit code and decision log must be stored before UI/UX, SLD, LOD, CAD, navigation or workflow changes.

## Rejected

- No recommendation is accepted if it would move electrical physics, protection logic or solver behavior into UI code. This rejects any interpretation of the review that would calculate load-flow, short-circuit, selectivity or energization state in presentation components.
- Do not replace Polish engineering terminology with simplified generic labels. Review wording may be used to clarify flow, but domain terms such as GPZ, SN, pole, odcinek, rozłącznik, odłącznik and stacja remain canonical.

## Deferred

- Full separation of `Wstaw stację na końcu odcinka` and `Podziel odcinek` is deferred to a dedicated SLD/domain-operation pass because it touches command routing, domain operations, audit and undo semantics.
- Provisional section length and draft route persistence are deferred because they may require schema/domain changes and must not be implemented as UI-only state that bypasses ENM.
- Global undo/redo byte-equality property tests for mixed canvas and form edits are deferred to a broader CAD/SLD test suite.
- LOD/color-channel redesign and path-highlighting are deferred to an SLD visual quality pass with golden screenshots and grayscale tests.

## Implementation Notes

- This pass implements accepted UI/application-layer improvements only.
- The UI can explain catalog/domain validation status, but it must not invent or compute electrical results.
- Browser validation must cover the visible flow: station configurator actions and DER wizard state change after the explicit transformer-dedicated action.
