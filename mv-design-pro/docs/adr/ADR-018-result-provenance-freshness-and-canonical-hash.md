# ADR-018: Provenance i świeżość wyników; hash kanoniczny niezależny od platformy

**Status:** PROPOSED (program Digital Twin 2026-09; do decyzji właściciela)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §14; `../twin/MV_DESIGN_PRO_DATA_VERSIONING_PROVENANCE.md` §5, §8

## Kontekst
`ResultSetV1` jest FROZEN i nie niesie rewizji scenariusza/katalogu; provenance częściowo stała lub fabrykowana; 7/18 scenariuszy nN ma inny hash w CI niż lokalnie (A2-10, A10-02); dokumenty nigdy nie stają się nieaktualne (A9-20).

## Decyzja
`ResultSetV2` (addytywnie obok FROZEN v1) z obowiązkowym `Provenance{model_revision, scenario_hash, effective_state_hash, catalog_revision_set, solver_id, solver_version, settings_hash, assumptions_hash, actor, timestamp}` i `Freshness` liczoną z tych hashy dla wyników **i dokumentów**. Hash kanoniczny: serializacja z `sort_keys`, liczby zaokrąglane do precyzji zadeklarowanej w kontrakcie, bez `repr` float, bez pól zależnych od środowiska; „golden hash" liczony w CI i utrwalany w repo; fixtury generowane w CI.

## Konsekwencje
- Rdzeń solverów pozostaje FROZEN; nowy kontrakt jest warstwą nad nim (bez major bump).
- Test klasy: hash identyczny w dwóch środowiskach dla całego rejestru sieci; „wynik nieświeży nigdy nie jest fresh" jako iloczyn cech (rodzaj zmiany × analiza × dokument).

## Alternatywy odrzucone
- Modyfikacja `ResultSetV1`: łamie Frozen Result API.
