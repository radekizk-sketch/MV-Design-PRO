# ADR-027: Punkt przyłączenia jako obiekt umowny na terminalu (rozstrzygnięcie zakazu terminu w modelu fizyki)

**Status:** PROPOSED (program Digital Twin 2026-09; rozstrzyga konflikt mandatu §44 z Core Rule 5 / `pcc_zero_guard`)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §17

## Kontekst
Kanon repo zakazuje pojęć punktu przyłączenia i węzła granicznego w `NetworkModel` (Core Rule 5, `pcc_zero_guard`), a mandat (§44–§45) wymaga punktu przyłączenia jako obiektu pierwszej klasy dla DER, warunków OSD, RfG i wniosku. W kodzie punkt przyłączenia żyje w 12 rozproszonych rolach (slack w interpretacji, granica sieci, tekst wniosku) — A5-06, A1-08, A12 §8 pkt 1.

## Decyzja
`GridConnectionPoint{terminal_ref, connection_conditions_ref, owner: OSD|CLIENT, metering_ref, agreed_power, agreed_cos_phi, sk_max/min, compliance_profile}` jako obiekt **warstwy kontraktowej** (CONTRACT/DESIGN), który **wskazuje** terminal w modelu fizyki i **nie jest** węzłem, elementem ani parametrem solvera. Solvery, projekcje, RfG, hosting capacity, wniosek OSD i werdykt czytają ten sam obiekt. `pcc_zero_guard` zostaje jako guard strukturalny: brak węzła/elementu tego rodzaju w migawce solvera; dopuszcza obiekt w warstwie kontraktu.

## Konsekwencje
- Znika 12 rozproszonych ról; wniosek OSD nie prosi o punkt przyłączenia jako tekst.
- Zgodność z kanonem: fizyka nie wie o umowie; umowa zna terminal.

## Alternatywy odrzucone
- Węzeł graniczny w modelu fizyki (mandat czytany literalnie): fikcyjny byt w solverze, sprzeczny z kanonem.
- Pozostawienie interpretacji rozproszonej: dzisiejszy stan.
