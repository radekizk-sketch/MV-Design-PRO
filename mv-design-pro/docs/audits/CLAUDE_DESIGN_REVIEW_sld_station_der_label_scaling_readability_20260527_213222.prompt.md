You are reviewing MV-DESIGN-PRO SLD V2 as a senior UX/product designer for engineering software, a SCADA/CAD interaction designer, and a power-network workflow reviewer.

Scope:
- Review only this proposed UI/SLD readability fix: station + DER labels become oversized and overlap when a station with PV/BESS/FW and block transformer is selected or zoomed.
- Do not invent electrical domain rules.
- Do not change solver physics, protection logic, ENM semantics, or catalog values.
- Optimize for engineering readability, clickability, and SCADA/CAD clarity.

Context:
- Active UI is Polish technical UI.
- SLD is a view of ENM/topology.
- Station compact view must remain mini-RMU/RM6 with WE/WY/TR fields.
- DER must remain visible as PV/BESS/FW with PCC/block-transformer indication, but SLD must not draw long unbounded labels over the station.
- Details can live in tooltip/technical card; the canvas should keep short labels.

Proposed implementation direction:
- Cap SVG text world font sizes by viewport scale so labels do not exceed readable screen pixel size at high zoom.
- Truncate long DER/station labels on the canvas and keep full values in <title>/technical card.
- Keep DER block-transformer indication as symbol + compact kVA label; avoid full voltage/vector label on top of station unless selected and still capped.
- Add tests for compact DER/station labels at high viewportScale and no unbounded long label in station compact context.

Return exactly:
# Summary of top UX risks
# Must-fix issues
# Accepted / Rejected / Deferred recommendations
# Testable acceptance criteria
# What not to change
