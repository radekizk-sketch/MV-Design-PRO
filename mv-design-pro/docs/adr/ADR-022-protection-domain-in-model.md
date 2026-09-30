# ADR-022: Domena zabezpieczeń w modelu — IED, funkcje, grupy nastaw, trip matrix; jedna fizyka; TCC jako projekcja

**Status:** PROPOSED (program Digital Twin 2026-09; do decyzji właściciela — uchyla blokadę V11 `relay.legacy_write_disabled`)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_PROTECTION_ARCHITECTURE.md`

## Kontekst
Nastawy poza modelem w ścieżce użytkownika (kreator bez nastaw, zapis do ENM zablokowany, nastawy w przypadku i w body żądania), fantomowe nastawy w szufladzie SLD, 5 implementacji fizyki IDMT (3 poza solverem), brak IED/trip matrix/logiki, 67 bez modelu kierunku, katalog przekaźników z fikcyjnymi kartami, trace = jeden aparat po porządku identyfikatorów (A4-01…08, A4-13).

## Decyzja
`ProtectionDevice` (IED z katalogu), `ProtectionFunction` (kod ANSI, wejścia z rdzeni CT/uzwojeń VT, kierunek i polaryzacja), `SettingGroup` (1–4, rewizjonowane), `TripMatrix` (stopień → aparaty, CBF), `Interlock`, `SpzScheme`, `CtCore` — w warstwie ASSET modelu; przypadek/scenariusz **wybiera grupę lub nakłada override** (delta). Jedna fizyka krzywych w `network_model/solvers/protection_*` (rozszerzona o kierunkowość, kryteria admitancyjne, 87T, funkcje progowe); TCC i koordynacja to projekcje modelu i aktywnych biegów; `trace_protection` per element (SN+nN, FUSE/MCB/gG jako aparaty wyłączające) wyznaczany z kierunku przepływu.

## Konsekwencje
- Rewizja Core Rule #4 (Case = parametry): nastawy bazowe są danymi assetu; przypadek nadal nie mutuje modelu (delta).
- Kasacja duplikatów fizyki, łańcucha PR-26…31, `validate_selectivity`, fantomu w szufladzie; katalog IED bez „ACME/REX".
- Klasa atrybutów PROTECTION_SETTINGS w grafie zależności (zmiana nastawy nie unieważnia rozpływu).

## Alternatywy odrzucone
- Nastawy wyłącznie w przypadku (dzisiejsze rozwiązanie): raport, SLD i koordynacja czytają różne prawdy.
