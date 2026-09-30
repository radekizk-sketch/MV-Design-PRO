# ADR-022: Domena zabezpieczeń w modelu — IED, funkcje, grupy nastaw, trip matrix; jedna fizyka; TCC jako projekcja

**Status:** ACCEPTED (2026-09-30, decyzja doradcy z delegacją właściciela O-59 — rejestr O-63 w `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §2.3; wariant D-34 werdyktu właściciela: domena zabezpieczeń jako warstwa ASSET modelu ENM addytywnie, przypadek wybiera grupę nastaw albo nakłada override jako deltę scenariusza rozwiązywaną w `EffectiveNetworkSnapshot` — Core Rule #4 doprecyzowana, nie złamana; klasa blokad V11 `relay.*`/`field.*` zdjęta jedną kartą (V12K-342); `ProtectionCapabilityRegistry` pierwszym artefaktem (W4-0 po PROT-LTI albo na literale „LTI”, O-69); rozszerzenia solverów (67/67N, 87T, admitancyjne) PLANNED, poza v1)
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
