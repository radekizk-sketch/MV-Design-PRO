# ADR-026: Selektywna inwalidacja przez graf klas atrybutów

**Status:** PROPOSED (program Digital Twin 2026-09; do decyzji właściciela)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §22; `docs/v12xx/MACIERZ_INVALIDACJI.md` jako specyfikacja

## Kontekst
Każda operacja mutująca unieważnia wszystkie wyniki (zmiana nazwy unieważnia zwarcia; zmiana nastawy unieważnia rozpływ); macierz inwalidacji istnieje tylko jako dokument; brak cache i selektywnego przeliczenia; N-1 w minutach (A2-05/09/11).

## Decyzja
Każdy atrybut modelu należy do `AttributeClass` (np. LABEL, GEOMETRY, IMPEDANCE, RATING, SWITCH_STATE, LOAD_POWER, SOURCE_STRENGTH, CATALOG_BINDING, PROTECTION_SETTINGS, EARTHING, PHASE_CONNECTION…); deklaratywny graf `AttributeClass → {analizy, projekcje, dokumenty}` jest **jedynym** źródłem inwalidacji: komenda domenowa emituje zbiór zmienionych klas, `Freshness` oznacza dokładnie zależne artefakty jako STALE. „Przelicz nieaktualne" = zbiór STALE; orkiestrator korzysta z cache dla reszty.

## Konsekwencje
- Test klasy: dla każdej pary (klasa atrybutu × analiza/dokument) wynik zgodny z macierzą; nic więcej, nic mniej.
- Warunek dla polityki automatycznych przeliczeń (FAZA C C-01) i budżetu „plan po edycji ≤ 30 % pełnego".

## Alternatywy odrzucone
- Inwalidacja po nazwie operacji (nie atrybutu): kolejna operacja = kolejna luka.
