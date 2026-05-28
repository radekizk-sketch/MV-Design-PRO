# SLD Goal Runbook

## Checkpoint - drawer unification 2026-05-28

Zakres: przebudowa drawerów SLD tak, aby kliknięcie elementu zawsze otwierało jedną kartę obiektu, a konfiguracja / pełny widok / usuwanie były jawnymi akcjami.

### Review UX

- Prompt: `docs/audits/CLAUDE_DESIGN_REVIEW_sld_drawer_unification_20260528_012622.prompt.md`
- Review: `docs/audits/CLAUDE_DESIGN_REVIEW_sld_drawer_unification_20260528_012622.md`
- Meta: `docs/audits/CLAUDE_DESIGN_REVIEW_sld_drawer_unification_20260528_012622.meta.json`
- Decyzje: `docs/audits/CLAUDE_DESIGN_REVIEW_sld_drawer_unification_20260528_012622.decision.md`

### Defekty

| ID | Priorytet | Defekt | Status |
|---|---|---|---|
| DRAWER-001 | critical | Klik w odcinek SN zamieniał prawy panel na E-12 zamiast pokazać kartę zaznaczonego odcinka. | naprawione |
| DRAWER-002 | critical | ZK SN i słup rozgałęźny nie miały własnego draweru obiektu. | naprawione |
| DRAWER-003 | major | Transformator kliknięty w SLD nie miał pełnej karty inżynierskiej z brakami danych. | naprawione |
| DRAWER-004 | major | Akcje kontekstowe były dostępne tylko z menu, a nie z karty obiektu. | naprawione |

### Walidacja lokalna

| Komenda | Status |
|---|---|
| `npm run type-check` | PASS |
| `npm test -- --run src/ui/sld/v2/canvas/__tests__/SldDetailDrawer.test.tsx src/ui/sld/v2/canvas/__tests__/SldWorkspaceContainer.test.tsx` | PASS |

## Cel

Doprowadzic aktywny SLD V2 MV-DESIGN-PRO do poziomu przemyslowego SCADA/CAD przez petle:

`audit -> plan -> implementacja -> test -> browser retest -> aktualizacja audytu`.

Zakres tej iteracji: semantyka SLD, porty, glowice kablowe, tor zasilania, czytelnosc etykiet, guardy i dowody przegladarkowe. Renderer pozostaje warstwa prezentacji/aplikacji: bez fizyki i bez zgadywania topologii.

## Kontrakty przeczytane

| Dokument / plik | Wniosek dla tej iteracji |
|---|---|
| `AGENTS.md` | SLD i UI nie licza fizyki; UI i dokumentacja po polsku technicznym. |
| `mv-design-pro/AGENTS.md` | Stacja i GPZ musza byc ukladem elektroenergetycznym, nie kaflem. |
| `docs/sld/STACJE_ELEKTROENERGETYCZNE_PROJECT_STANDARD.md` | Wymagane: tor zasilania, pola, porty, blokady, brak falszywych wartosci. |
| `docs/sld/SLD_CONTRACT_FLOW_V1.md` | Renderer czyta porty i topologie z ENM/adaptera, nie rekonstruuje modelu. |
| `docs/sld/SLD_INDUSTRIAL_SPEC_v1.md` | Wymagane: port-based routing, LOD, port magnets, label collision guard, CAD-grade interaction. |
| `docs/v12xx/KANON_V12_XX.md` | ENM jest zrodlem prawdy; wyniki, proof i raport nie moga czytac draftu UI. |

## Checkpoint 0 - stan przed edycja

| Kryterium | Wynik |
|---|---:|
| Browser URL | `http://127.0.0.1:5173/#sld` |
| Screenshot | `tmp/browser-use-full-e2e/11_browser_sld_goal_before.png` |
| Diagnostyka | `tmp/browser-use-full-e2e/11_browser_sld_goal_before_diagnostics.json` |
| Bledy konsoli | 0 |
| Zakazane frazy / falszywe `0.00` | 0 |
| `svg` obecny | tak |
| Port magnets w aktywnym LOD | 0 |
| Kanoniczne glowice kabla | 0 |
| Tor zasilania widoczny | tak wizualnie, slabo semantycznie |

## Defekty i decyzje

| Priorytet | Defekt | Ryzyko | Decyzja |
|---|---|---|---|
| critical | LOD overview stacji nie wystawial `data-port-magnet` ani hit-area na portach WE/TR. | CAD nie ma jednoznacznego punktu zaczepu portu. | Dodano port magnets, role, busbar section i hit area do overview bay markers. |
| critical | Glowica kabla byla rysowana, ale nieoznaczona jako kanoniczny symbol. | Guard mogl nie wykryc odcinka startujacego poza glowica. | Dodano `data-symbol-canon="cable_head_triangle"` i `data-port-binding="trunk-start-head"`. |
| major | DER bez PCC nie mial markeru blokady na korzeniu. | Audyt gotowosci mogl pominac brak PCC. | Dodano `data-missing-pcc` do korzenia DER. |
| major | Dwa miejsca UI mogly pokazac zero zamiast braku danych. | Operator dostaje pozorny wynik. | Usunieto domyslne zero i dodano format `brak MW/Mvar`. |
| major | `verify:v12.6` nie uruchamial wymaganych guardow SLD. | Bramka koncowa nie chronila kontraktu SLD. | Podlaczono guardy SLD do `scripts/verify_v12_6.py`. |
| major | Etykiety `Sekcja 0 / 15 kV`, `Sekcja I / 15 kV` oraz `System / 110 kV` nakladaly sie w realnym DOM. | SLD nieczytelny w przegladarce mimo przejscia testow komponentow. | Przebudowano stos etykiet w `SectionRenderer` i `GpzCanonicalRenderer`. |
| major | Tor zasilania byl widoczny, ale czesc diagnostyki nie rozpoznawala go semantycznie. | Audyt browser-use i guardy CAD nie widza supply path. | Dodano `data-flow-role="supply-path"` i `data-supply-path="true"` na root/underlay ciagu. |

## Implementacja

1. `MiniBlockRmuRenderer`:
   - overview wystawia `data-port-magnet`, `data-hit-area`, `data-port-role`, `data-busbar-section="SN"`;
   - root ma `data-port-anchor-count`.
2. `CableRunRenderer`:
   - start magistrali ma kanoniczna glowice kabla;
   - root i underlay maja semantyke toru zasilania;
   - NMO jest oznaczane jako open-point.
3. `DerRenderer`:
   - root DER ma `data-missing-pcc`, gdy brakuje PCC.
4. `SectionRenderer` i `GpzCanonicalRenderer`:
   - etykiety sekcji i zrodla 110 kV maja oddzielone baseline'y i `data-readable-label-stack`.
5. UI false-zero:
   - `GridSourceEditor` nie zamienia pustego `tk` na 0;
   - `StationConfigNnSwitchgearCard` pokazuje `brak MW/Mvar`, gdy wartosc nie jest znana.
6. Guardy:
   - dodano `der_pcc_guard.py`, `label_overlap_guard.py`, `lod_hysteresis_guard.py`, `layout_readability_guard.py`, `enm_adapter_consistency_guard.py`, `cable_leaves_from_head_guard.py`;
   - wlaczono guardy SLD do `verify:v12.6`.

## Checkpoint 1 - browser retest po pierwszej edycji

| Kryterium | Wynik |
|---|---:|
| Screenshot | `tmp/browser-use-full-e2e/12_browser_sld_goal_after.png` |
| Diagnostyka | `tmp/browser-use-full-e2e/12_browser_sld_goal_after_diagnostics.json` |
| Bledy konsoli | 0 |
| Zakazane frazy / falszywe `0.00` | 0 |
| Port magnets | 5 |
| Kanoniczne glowice kabla | 2 |
| Kolizje etykiet | 0 w pierwszym przebiegu, potem wykryto regresje w GPZ przy pelnym widoku |

## Checkpoint 2 - browser retest po label/supply fix

| Kryterium | Wynik |
|---|---:|
| Screenshot pelny | `tmp/browser-use-full-e2e/15_browser_sld_goal_final_no_overlap.png` |
| Screenshot viewport | `tmp/browser-use-full-e2e/15_browser_sld_goal_final_no_overlap_viewport.png` |
| Diagnostyka | `tmp/browser-use-full-e2e/15_browser_sld_goal_final_no_overlap_diagnostics.json` |
| Konsola | `tmp/browser-use-full-e2e/15_browser_sld_goal_final_no_overlap_console.json` |
| Bledy konsoli | 0 |
| Zakazane frazy | 0 |
| Falszywe `0.00` | 0 |
| `svg` obecny | tak |
| Port magnets | 5 |
| Kanoniczne glowice kabla | 2 |
| Supply path semantyczny | 4 |
| DER bez PCC na korzeniu | 0 |
| Kolizje etykiet DOM bbox | 0 |
| Stacyjne port anchors | WE, TR |

## Komendy i wyniki

| Komenda | Status |
|---|---:|
| `npm test -- --run src/ui/sld/v2/renderer/__tests__/miniBlockRmu.test.tsx src/ui/sld/v2/renderer/__tests__/cableRunCableHeads.test.tsx src/ui/sld/v2/__tests__/renderers.test.tsx src/ui/network-build/station-configurator/__tests__/StationConfigurator.test.tsx` | PASS, 185 testow |
| `npm test -- --run src/ui/sld/v2/renderer/__tests__/GpzCanonicalRenderer.test.tsx src/ui/sld/v2/__tests__/renderers.test.tsx src/ui/sld/v2/renderer/__tests__/cableRunCableHeads.test.tsx` | PASS, 151 testow |
| `py scripts/false_zero_guard.py --strict` | PASS, 0 naruszen |
| `py scripts/der_pcc_guard.py` | PASS |
| `py scripts/cable_leaves_from_head_guard.py` | PASS |
| `py scripts/station_not_rectangle_guard.py` | PASS |
| `py scripts/gpz_switchgear_guard.py` | PASS |
| `py scripts/no_direct_110kv_tr_tie_without_switchgear.py` | PASS |
| `py scripts/port_binding_guard.py` | PASS |
| `py scripts/label_overlap_guard.py` | PASS |
| `py scripts/lod_hysteresis_guard.py` | PASS |
| `py scripts/layout_readability_guard.py` | PASS |
| `py scripts/enm_adapter_consistency_guard.py` | PASS |

## Status bramek

| Krok | Status |
|---|---:|
| Audit przed edycja | PASS |
| Implementacja | PASS |
| Testy jednostkowe ukierunkowane | PASS |
| Browser retest | PASS |
| Guardy SLD ukierunkowane | PASS |
| Pelny type-check | PASS |
| Build | PASS |
| Lint | PASS |
| Pelne unit/integration | PASS |
| Pelne E2E | PASS |
| Browser final pass z backendem | PASS |
| `verify:v12.6` | PASS |

## Ryzyka resztkowe

Brak krytycznych luk w zakresie poprawionej powierzchni SLD.

## Claude design review

| Artefakt | Status |
|---|---:|
| Prompt | `docs/audits/CLAUDE_DESIGN_REVIEW_sld_v2_operator_grade_flow_20260527_063335.prompt.md` |
| Review | `docs/audits/CLAUDE_DESIGN_REVIEW_sld_v2_operator_grade_flow_20260527_063335.md` |
| Metadane | `docs/audits/CLAUDE_DESIGN_REVIEW_sld_v2_operator_grade_flow_20260527_063335.meta.json` |
| Decyzje Accepted / Rejected / Deferred | `docs/audits/CLAUDE_DESIGN_REVIEW_sld_v2_operator_grade_flow_20260527_063335.decisions.md` |

Accepted: poprawa toru zasilania, portow, czytelnosci mini-RMU, prawokliku domenowego, bramek false-zero i guardow SLD.

Rejected: rekomendacje, ktore wprowadzalyby fizyke do UI albo omijaly ENM jako zrodlo prawdy.

Deferred: 0 krytycznych kryteriow SLD. Brak elementu oznaczonego jako konieczny do operator-grade SLD pozostawionego poza ta iteracja.

## Checkpoint 3 - finalny browser pass z backendem

| Kryterium | Wynik |
|---|---:|
| Backend `127.0.0.1:8000/openapi.json` | HTTP 200 |
| Frontend `127.0.0.1:5173` | HTTP 200 |
| URL aktywnego SLD | `http://127.0.0.1:5173/#sld?project=de296d9b-94fe-4ff5-9cde-d06088113fc8&case=2c58ed79-fdd1-4213-bf98-cd32c8de51e8` |
| Screenshot aktywnego SLD | `docs/audits/SLD_ACTIVE_FINAL_BROWSER_PASS.png` |
| Screenshot prawokliku stacji | `docs/audits/SLD_ACTIVE_FINAL_STATION_CONTEXT_MENU.png` |
| `svg` / `SldCanvasV2` obecny | tak |
| Pusty shell | nie |
| Stacja na aktywnym widoku | 1 |
| Mini transformatory stacji | 2 |
| Samodzielne falszywe transformatory | 0 |
| Port magnets | 8 |
| Kanoniczne glowice kabla | 4 |
| Semantyczny tor zasilania | 6 elementow |
| Falszywe `0.00` | 0 |
| Prawy klik stacji | menu domenowe widoczne |
| Akcje z menu stacji | `Kontynuuj ciag glowny`, `Rozpocznij odgalezienie` |
| Bledy konsoli w pass SLD | 0 |

Uwaga audytowa: proste wyszukiwanie zakazanego slowa `run` daje falszywy traf na polskim slowie `kierunki`. Guard repozytorium przechodzi, bo sprawdza kontrakt UI, a nie dowolny podciag w polskich etykietach.

## Finalne komendy walidacyjne

| Komenda | Status |
|---|---:|
| `npm test` | PASS |
| `npm run test:e2e` | PASS, 155 passed, 15 skipped |
| `npm run type-check` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run verify:v12.6` | PASS |
| Browser/Playwright final pass aktywnego SLD | PASS |

## Finalny werdykt audytu specjalistycznego

| Rola | Werdykt |
|---|---|
| Profesor elektroenergetyki | GPZ, tor zasilania, porty i stacja nie udaja zwarcia ani dekoracyjnego klocka; widok pozostaje modelem SLD, nie obliczeniem. |
| Projektant sieci SN | Stacja jest endpointem odcinka i punktem kontynuacji; prawy klik prowadzi do akcji projektowych bez zgadywania. |
| Projektant GPZ/stacji | Mini-RMU/RM6 pokazuje pola WE/TR i transformatory jako osobne, klikalne elementy. |
| Automatyk zabezpieczeniowy | Aparaty, porty i glowice sa jednoznacznie adresowalne przez hit-area i refs, co utrzymuje droge do kart i raportu. |
| DER/NC RfG | DER pozostaja powiazane z kontekstem stacji/PCC albo blokowane przez readiness; brak falszywych wynikow. |
| UX/CAD | Brak martwego prawokliku w pustym stanie, menu domenowe na stacji dziala, etykiety nie nachodza w finalnym pass. |
| QA | Guardy SLD, unit/integration, E2E, build, lint, type-check i browser pass sa zielone. |

## Krytyczne luki

0.

## Checkpoint 4 - przebudowa drawerów SLD

| Kryterium | Wynik |
|---|---:|
| Zakres | Scalenie drawerów dla stacji, odcinków, transformatorów, aparatów, DER i węzłów terenowych |
| Claude design review | PASS |
| Prompt review | `docs/audits/CLAUDE_DESIGN_REVIEW_sld_drawer_unification_20260528_012622.prompt.md` |
| Odpowiedź review | `docs/audits/CLAUDE_DESIGN_REVIEW_sld_drawer_unification_20260528_012622.md` |
| Metadane review | `docs/audits/CLAUDE_DESIGN_REVIEW_sld_drawer_unification_20260528_012622.meta.json` |
| Decyzje Accepted / Rejected / Deferred | `docs/audits/CLAUDE_DESIGN_REVIEW_sld_drawer_unification_20260528_012622.decision.md` |
| Screenshot po zmianie | `docs/audits/SLD_DRAWER_ZKSN_AFTER.png` |
| Screenshot retest po kompilacji | `docs/audits/SLD_DRAWER_ZKSN_AFTER_RETEST.png` |
| Browser check | Klik w ZK SN otwiera `Detal: ZKSN SN` z kartą techniczną, operacjami i akcjami domenowymi |

### Defekty zamknięte

| ID | Defekt | Status |
|---|---|---:|
| DRAWER-001 | Klik w odcinek/ZK SN automatycznie zastępował prawy panel pełnym ekranem konfiguracji, przez co użytkownik tracił kontekst schematu. | PASS |
| DRAWER-002 | Transformator w drawerze stacji pokazywał puste kreski zamiast braków danych i drogi do konfiguracji. | PASS |
| DRAWER-003 | Węzły terenowe ZK SN / słup rozgałęźny nie miały spójnego draweru technicznego. | PASS |
| DRAWER-004 | Akcje z drawerów były rozproszone i nie pokazywały powodów blokady. | PASS |

### Komendy walidacyjne drawerów

| Komenda | Status |
|---|---:|
| `npm run type-check` | PASS |
| `npm run lint` | PASS |
| `npm test -- --run src/ui/sld/v2/canvas/__tests__/SldDetailDrawer.test.tsx src/ui/sld/v2/canvas/__tests__/SldWorkspaceContainer.test.tsx` | PASS, 94 testy |
| `npm run build` | PASS |
| Browser/Playwright aktywnego SLD: klik ZK SN -> drawer | PASS |

### Decyzje wdrożeniowe

- Accepted: klik w obiekt SLD otwiera lekki drawer techniczny, a pełna konfiguracja i pełny widok są jawnymi akcjami użytkownika.
- Accepted: drawer pobiera akcje z kanonicznego serwisu menu SLD i pokazuje disabled reason, aby nie było martwych kliknięć.
- Accepted: transformator i węzeł terenowy mają własne typy drawerów, bo w praktyce projektowej nie są ani stacją, ani zwykłym aparatem.
- Rejected: nie przenosimy obliczeń ani fizyki do drawerów.
- Deferred: 0 krytycznych elementów drawerów. Rozbudowa solverów i katalogów pozostaje poza tym requestem, bo nie jest warunkiem działania drawerów.
