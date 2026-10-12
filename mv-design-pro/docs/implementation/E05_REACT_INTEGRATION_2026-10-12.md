# E05 — stanowisko inżynierskie pola SN (prototyp integracyjny React)
**Data:** 2026-10-12 · **Status:** PRÓBA INTEGRACYJNA, NIE ODBIÓR INŻYNIERSKI.

## Co zmienia ta gałąź
1. Istniejąca powierzchnia `BayConfiguratorSurface` otwiera E05 zamiast starszego formularza. Dotychczasowy `BayConfigurator` pozostaje osiągalny, z jawną informacją o niepełnym kontekście.
2. E05 odczytuje **wyłącznie** `useSnapshotStore.snapshot`, `caseId`, `rewizjaBiezacegoModelu` i `readiness`; nie posiada drugiego grafu ENM.
3. Katalog OEM pobierany z istniejących `GET /api/catalog/switchgear-families`, `GET /api/catalog/complete-bay-templates`, `GET /api/catalog/switchgear-families/{ref}/factory-configurations`. Bez lokalnego katalogu, bez domyślnej rodziny i bez wnioskowania o dopuszczeniu z samej nazwy.
4. SLD jest **oryginalnym** `SldCanvasV3(snapshot)`, bez nowych symboli i sztucznego toru. Klik aparatu wiąże `deviceRef` z `Bay.primary_devices`; klik obiektu spoza pola nie zmienia wyboru.
5. Widać rzeczywiste `Bay.ports`, `Bay.primary_devices`, `Bay.protection_ref`, `Bay.protection_codes` i `Bay.bay_template_ref`. Brak danych jest wyświetlany, a nie uzupełniany heurystyką.
6. Wyświetlenie przestarzałej migawki względem `rewizjaBiezacegoModelu` jest jawnie sygnalizowane. Brak wyników PF/SC/EAZ nie jest zastępowany obliczeniem frontendowym.

## Granice i P0 do kolejnego przyrostu
- **Edycja i zapis**: brak produkcyjnego powiązania komend `FieldInstance → BOM → ENM`. Nie dodano pozornych przycisków zapisu. Przyrost ma status READ-ONLY.
- **Katalog OEM**: status `verified`/`repo_verified` + źródła jest **wstępnym filtrem prezentacji**, nie pełną walidacją doboru Un/Um/Ir/Ik ani zgodności RMU. Decyzja o zapisie musi przejść `family_validation` po stronie backendu.
- **SLD**: renderuje rzeczywisty schemat **całej** migawki ENM; wydzielony widok pola/centrowanie na polu wymaga jawnej kotwicy istniejącego renderer'a, nie nowego mini-SLD.
- **Porty**: `occupied_by` oznacza przypisanie; samo w sobie nie dowodzi kompletności głowic ani toru prądowego.
- **EAZ/CT/VT**: lista funkcji i aparatów z ENM nie jest obliczeniem nastaw ani dowodem poprawnego odwzorowania.
- **Przebiegi analiz**: potrzebny istniejący indeks biegów `StudyRun` z rewizją i proweniencją; do tego czasu E05 nie wyświetla Ik″/ip/Ith/ΔU/I²t.
- **Legacy**: `BayValidationContext` nie zawiera pełnej topologii sekcji sprzęgła; otwarcie starszego edytora jawnie sygnalizuje ograniczenie, zamiast tworzyć fikcyjne `SEC-1/SEC-2`.
- **Dostępność**: weryfikacja klawiatury, wysokości doków, kontrastu i responsywności na realnym uruchomieniu.
- **Weryfikacja**: testy dodane do repozytorium, ale do czasu uruchomienia CI nie wolno raportować PASS.

## Następny etap E05-G2
1. Ustalić komendy domenowe i pełną transakcję `FieldInstance → BOM → ENM → unieważnienie StudyRun`, bez korzystania z `/api/switchgear/{station_id}/config` jako równoległego magazynu pamięci.
2. Dodać mutacje z `expected_revision`, walidacją `family_validation`, ochroną konfliktu i testami atomowości.
3. Podłączyć rzeczywiste terminale obu końców kabli, przekładniki, obwody wtórne, EAZ, blokady i dowody.
4. Wpiąć wyniki PF/SC/nN/EAZ/White Box z istniejącego systemu biegów, zawsze ze statusem CURRENT/STALE/BLOCKED.
5. Odbiór: `tsc`, ESLint, Vitest, Playwright z backendem, strażnicy repo i scenariusze T01–T20 z `docs/spec/KSR_GLOBAL_KONFIGURATOR_STACJI_2026-10-11.md` (PR #480, niezależny i niescalony).
