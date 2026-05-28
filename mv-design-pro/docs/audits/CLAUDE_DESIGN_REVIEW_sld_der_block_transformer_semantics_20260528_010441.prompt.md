You are reviewing one targeted MV-DESIGN-PRO SLD issue as a senior UX/product designer for engineering software, SCADA/CAD interaction designer, and medium-voltage network workflow reviewer.

Scope: review UI/UX, SLD readability, CAD behavior, clickability, and engineering workflow only. Do not invent electrical physics, protection rules, or catalog data. Do not rewrite product vision.

Problem evidence: the active SLD shows a DER/PV source with a label like "PVR blokowy 15/0,4 kV 630 kVA" overlapping the station SN/nN transformer and nN bus. The block transformer is visually confused with the station transformer. The DER and transformer apparatus are not clearly separate clickable/configurable objects. The user expects manufacturer-catalog MV switchgear templates and a clear MV-side connection path.

Domain constraints:
- Station SN/nN transformer is a station transformer supplying LV busbar.
- DER block transformer is a dedicated source transformer in the DER connection path, not the station transformer.
- For MV-side dedicated DER, SLD should show: station MV busbar -> DER/PCC MV bay -> block transformer -> inverter/PV/BESS/FW.
- For LV-side DER behind station transformer, SLD should not show a block transformer.
- SLD elements must be based on ENM topology and be clickable/configurable.

Return exactly:
# Summary of top UX/domain-readability risks
# Must-fix recommendations
# Accepted implementation criteria
# What not to change
# Testable acceptance criteria
