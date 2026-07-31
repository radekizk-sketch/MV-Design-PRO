# INWENTARZ PARYTETU MOSTÓW LEGACY — trasa po trasie (karta K8, 2026-07-31)

**Status:** WIĄŻĄCY. Aktualizacja 2026-07-31 (karta KD-1, fala 1 kolejki długu):
domknięte luki L-2…L-5 (zarządzanie projektami w ui2), L-12 i L-14 (porównanie
A/B) oraz WYKONANE kasacje L-6 i L-17 (werdykty MARTWY → USUNIĘTO).

Dokument rejestruje, które trasy mostu legacy (stare
powierzchnie `frontend/src/ui/**` hostowane w powłoce ui2) mają PEŁNY parytet
funkcji w ui2 — te są wygaszane — a które zostają, z **imiennie nazwaną luką**.

Podporządkowany `PROGRAM_UIUX_2026-07.md`; uzupełnia (nie zastępuje)
`PLAN_WYGASZANIA_MOSTU_WYNIKI.md`, który patrzy na POWIERZCHNIE zakładki
„Pozostałe analizy”. Tutaj jednostką jest **TRASA (hash)** — czyli to, co widzi
użytkownik wchodzący starym adresem albo klikający pozycję wyszukiwarki poleceń.

Metoda (bez zgadywania): dla każdej trasy zmierzono w kodzie (a) co realnie
renderuje most, (b) jakie ma wejścia produkcyjne, (c) jaki komponent ui2 pokrywa
tę zdolność, (d) różnicę zdolności (akcje · dane · przejścia), a nie nazw.

---

## 1. Powierzchnia mostu tras — stan zastany

Trasy przełącza `ui2/legacy/LegacyWarsztat.tsx` (trasy dedykowane) oraz
`ui2/legacy/useLegacyOrchestrator.ts` (trasy otwierające powierzchnie przez
`openRouteSurface` → `ui/workspace/WorkspaceSurfaceRouter.tsx`).
Rejestr tras: `ui/navigation/routes.ts` (`ROUTES` + `ANALYSIS_ROUTE_ALIASES`).

Zmierzono **17 tras**: 12 wpisów `ROUTES`, 5 aliasów analitycznych (`#results`,
`#proof`, `#protection-results`, `#power-flow-results`, `#compare`) oraz jedną
trasę spoza rejestru (`#kreator-stacji-v2`, obsługiwaną wprost w `LegacyWarsztat`).

## 2. Tabela werdyktów

| # | Trasa | Co renderuje most | Wejście produkcyjne | Odpowiednik ui2 | Werdykt |
|---|-------|-------------------|---------------------|-----------------|---------|
| 1 | `#` / `#sld` | `SldCanvasV3Workspace` (kanwa budowy) | przestrzeń Model/Schemat, `navigateToNetworkBuild`, menu | brak (kanwa JEST kanoniczna; ui2 dokłada `NastepnyKrokSchematu`) | **ZOSTAWIĆ** (wątek SLD) |
| 2 | `#sld-view` | `SldCanvasV3Workspace readOnly` | Ctrl+K „Podgląd schematu” | brak trybu tylko-do-odczytu w ui2 | **ZOSTAWIĆ** (luka L-1) |
| 3 | `#dashboard` | `ProjectDashboardSurface` (lista, otwórz, nowy z modalem, **usuń**, odśwież) | po KD-1 wyłącznie zimny deep-link starym adresem — „Otwórz projekt” i chip nazwy projektu prowadzą do ui2 | `spaces/projekt/otworz/OtworzProjektKontener` — PEŁNY parytet po KD-1: lista, otwórz, nowy z celu, **nowy z własną nazwą i opisem**, **odśwież listę**, **usuń z potwierdzeniem**, **zmiana projektu przy otwartym projekcie** | **ZOSTAWIĆ** (parytet osiągnięty; L-2…L-5 zamknięte) |
| 4 | ~~`#kreator-stacji-v2`~~ | — (trasa i podzespół USUNIĘTE w KD-1) | **znalezisko KD-1:** wejście JEDNAK istniało — odnośnik „Otwórz konfigurację stacji (17 kroków)” w PUSTYM stanie kanwy SLD (`<a href>`, którego inwentarz K8 nie zmierzył, bo szukał wywołań `navigateTo*`); usunięty razem z trasą (w pustym modelu nie ma na czym osadzić stacji) | `ui2/kreatory/stacja/KreatorStacjiSnNn` — realny kreator, wpięty przez `operationFormRegistry` (`insert_station_on_segment_sn`, `append_station_on_endpoint`) | **USUNIĘTO** ✅ (L-6 zamknięta) |
| 5 | `#fault-scenarios` | `FaultScenariosPanel` + `FaultScenarioModal` | **brak** (`navigateToFaultScenarios` bez wołającego) | brak | **ZOSTAWIĆ** (defekt naprawiony w K8 — patrz §4; luka L-7) |
| 6 | `#enm-inspector` | `EnmInspectorPage` za flagą `ENM_INSPECTOR_VISIBLE` (domyślnie OFF) | brak | brak (narzędzie deweloperskie) | **ZOSTAWIĆ** (luka L-8) |
| 7 | `#analysis` / `#results` | hub „Analizy techniczne” — od F-E5c dostawcą jest **ui2** (`MostAnalizTechnicznych` → `EkranAnalizTechnicznych`); most renderuje tylko powierzchnie-dzieci | menu, `navigateToResults` po DONE, deep-link | `wyniki/analizy/EkranAnalizTechnicznych` + zakładki warsztatu | **ZOSTAWIĆ** (widok domyślny już ui2; zakładka „Pozostałe analizy” = reszta mostu, luka L-9) |
| 8 | `#proof` (alias, `tab=trace`) | `ElementCalculationProofPanel` + `ProofLatexPanel` (źródło LaTeX: kopiuj/pobierz `.tex`) | `InspectorPanel` („Otwórz wywód”), Ctrl+K „Dowód obliczeniowy” (→ zakładka ui2, nie trasa) | zakładka „Dowód obliczeń” (`DowodPrzebiegu` → `PrzegladDowodu`): kroki WHITE BOX + odcisk wejścia | **ZOSTAWIĆ** (luki L-10, L-11) |
| 9 | `#compare` (alias) | `ResultsComparisonPage` (`POST /api/comparison/runs`): szyny U[kV]+U[pu]+Δ%, gałęzie P/Q+Δ%, zwarcia jako 2 skalary, filtr „tylko różnice”, status IMPROVED/REGRESSED (heurystyka w UI) | Ctrl+K „Porównanie przebiegów” (→ zakładka ui2, nie trasa) | zakładka „Porównanie A/B” (`EkranPorownania` + `TrybZwarciowy`): tryb rozpływowy (`/api/power-flow-comparisons`) i zwarciowy (tabela punktów Ik″/ip/Ith/Sk), ranking problemów, dowód kolumny A i B | **ZOSTAWIĆ** (po KD-1 pozostaje wyłącznie luka L-13 — brak pola `percent` w backendzie; L-12 i L-14 zamknięte) |
| 10 | `#power-flow-results` (alias) | powierzchnia E-35 z `tabId='power-flow'` — **zakładka bez własnej gałęzi renderu**, więc GENERYCZNA `AnalysisDataTable` (te same wiersze dla każdej zakładki, limit 200) | brak wołającego produkcyjnego; zimny deep-link | zakładka „Rozpływ mocy” (`EkranRozplywu`: `TabelaSzyn`, `TabelaGalezi`, profil napięć, wejście w dowód) | **WYGASIĆ** ✅ (nadzbiór) |
| 11 | `#protection-results` (alias) | powierzchnia E-35 z `tabId='protection'` — jak wyżej: GENERYCZNA tabela, zero treści zabezpieczeniowej | Ctrl+K „Wyniki zabezpieczeń” (`useLegacyMenuActions`, akcja `protection`) | **NOWA** zakładka „Koordynacja zabezpieczeń” (`EkranKoordynacji` — dostawca ui2 ekranu E-28: krzywe TCC, marginesy CTI, nastawy z backendu) | **WYGASIĆ** ✅ (nadzbiór) |
| 12 | `#report` | `ReportSurface` (E-37) — generator raportu, eksporty OSD/audytowe | Ctrl+K „Generator raportu”, `WorkspaceOperationalBar`, karty huba Dokumentacji | brak w ui2 (`HubDokumentacji` tylko prowadzi do powierzchni mostu) | **ZOSTAWIĆ** (luka L-15) |
| 13 | `#variants` | `VariantsSurface` (E-08, klasa B → prawy panel): karta read-only (projekt, wariant, stan obliczeń, liczba przebiegów, ostatni przebieg, następny krok) + 4 przyciski nawigacyjne | Ctrl+K „Warianty i przebiegi”, `WorkspaceOperationalBar` | przestrzeń „Obliczenia” (`MenedzerPrzypadkow` + `PrzebiegiPanel` — historia z parametrami i odciskiem odtwarzalności) + przestrzenie docelowe przycisków (Wyniki / Dokumentacja / Gotowość) | **WYGASIĆ** ✅ (nadzbiór) |
| 14 | `#case-config` | powierzchnia E-07 — **`renderSurfaceBody` NIE MA gałęzi dla `E-07`**, więc prawy panel pokazywał sam nagłówek „Zakresy obliczeń” bez treści i zasłaniał inspektor ui2 | Ctrl+K „Konfiguracja zakresu obliczeń”, **oraz każde jawne wejście w przestrzeń „Obliczenia”** (`przejsciaPrzestrzeni.mostTrasyPrzestrzeni`) | przestrzeń „Obliczenia” (`MenedzerPrzypadkow`: lista, nowy, aktywacja, porównanie konfiguracji) | **WYGASIĆ** ✅ (most nie miał czego pokazać) |
| 15 | `#catalog` | `CatalogHelperSurface` (E-38) → `CatalogBrowser`, 8 przestrzeni nazw: `LINIA_SN`, `KABEL_SN`, `TRAFO_SN_NN`, `APARAT_SN`, `APARAT_NN`, `KABEL_NN`, `CT`, `VT` | Ctrl+K „Katalogi techniczne”, pasek narzędzi, `NcRfgTestsTab` | zakładka „Katalog” przestrzeni Model (`KatalogPanel`), 5 kategorii: `LINIA`, `KABEL`, `TRANSFORMATOR`, `APARAT`, `FALOWNIK` (+ „Gdzie użyty”) | **ZOSTAWIĆ** (luka L-16) |
| 16 | ~~`#switchgear`~~ | — (trasa, powierzchnia pomocnicza `switchgear_wizard` i pozycja Ctrl+K „Kreator rozdzielnicy” USUNIĘTE w KD-1; nieznany hash → zachowanie domyślne aplikacji) | — | konfiguracja pól żyje w kartach E-10/E-11 otwieranych z kanwy (jedyny uczciwy dostawca) | **USUNIĘTO** ✅ (L-17 zamknięta) |
| 17 | `#kreator-stacji-v2` — patrz #4 | | | | |

Legenda: ✅ = wygaszone w karcie K8 (trasa prowadzi do okna ui2, kontekst zachowany).

## 3. Wygaszone trasy — jak działa lądowisko

Wzorzec lądowiska K3-A1 (`V12K-273`): **hash zostaje jedyną prawdą deep-linku**,
zmienia się wyłącznie dostawca widoku. Mapa lądowisk żyje w JEDNYM miejscu —
`ui2/legacy/useLegacyOrchestrator.ts` → `LADOWISKA_WYGASZONYCH_TRAS`:

| Trasa | Przestrzeń | Zakładka warsztatu | Kontekst |
|-------|-----------|--------------------|----------|
| `#power-flow-results` | `wyniki` | `rozplyw` | `?run=` / `?case=` odtwarzane jak dotąd (`restoreAnalysisRunSnapshot`) |
| `#protection-results` | `wyniki` | `koordynacja` | jw. |
| `#case-config` | `obliczenia` | — | projekt/przypadek z hydratacji K2 |
| `#variants` | `obliczenia` | — | jw. |

Powierzchnia trasowa mostu NIE jest otwierana (`clearRouteManagedSurface`) —
inaczej klasa C przykryłaby okno ui2, a klasa B zajęła prawy panel.

Usunięty kod (martwy po wygaszeniu): `CaseContextSurface` (61 wierszy) wraz z
gałęzią `case 'case_context'`, gałąź `case 'E-08'` w `renderSurfaceBody` oraz
gałęzie tras `#variants`/`#case-config` w orkiestratorze.
`VariantsSurface` **ZOSTAJE** — jest współdzielona z akcją naprawczą „historia”
(`fixActionSurface('history')` → `variants_runs`), więc nie jest martwa
(adnotacja w kodzie routera).

## 4. Defekty zastane wykryte przy inwentaryzacji (naprawione w K8)

- **D-1 `#fault-scenarios` był trwale martwy.** `LegacyWarsztat` podawał
  `<FaultScenariosPanel studyCaseId={null} />` NA SZTYWNO, a panel ma wczesny
  powrót `if (!studyCaseId) return …`, więc trasa ZAWSZE pokazywała
  „Wybierz wariant pracy…” — scenariuszy nie dało się obejrzeć ani dodać przy
  żadnym aktywnym przypadku. Naprawa u źródła: panel dostaje `activeCaseId`
  z powłoki (brak przypadku nadal daje uczciwy stan zerowy panelu).
- **D-2 `#case-config` pokazywał pusty panel.** Trasa otwierała E-07, dla którego
  router nie ma gałęzi renderu — użytkownik dostawał nagłówek bez treści, a
  inspektor ui2 był zasłonięty. Trasa wygaszona (§3), gałąź usunięta.

## 5. Luki imienne — rejestr roboczy przyszłych kart

Format: **zdolność · miejsce w ui2 · czego brakuje**.

| Kod | Zdolność | Miejsce w ui2 | Czego brakuje |
|-----|----------|---------------|---------------|
| L-1 | Podgląd schematu tylko do odczytu | przestrzeń „Schemat” | tryb read-only kanwy (blokada edycji) osiągalny z powłoki ui2 |
| L-2 | Usunięcie projektu | `spaces/projekt/otworz` | ZAMKNIĘTA (KD-1): akcja „Usuń projekt” + dialog potwierdzenia w `ListaProjektow`/`OtworzProjekt`, `DELETE /api/projects/{id}` w kontenerze; usunięcie AKTYWNEGO projektu czyści kontekst aplikacji |
| L-3 | Nowy projekt z dowolną nazwą i opisem | `OtworzProjektKontener` | ZAMKNIĘTA (KD-1): dialog „Nowy projekt” (`NowyProjektDialog`) z polami nazwa + opis mapowanymi 1:1 na `POST /api/projects`; ścieżka od celu pozostaje pierwszoplanowa |
| L-4 | Odświeżenie listy projektów | `ListaProjektow` | ZAMKNIĘTA (KD-1): akcja „Odśwież listę” (ponowne `GET /api/projects`) |
| L-5 | Zmiana projektu przy aktywnym projekcie | przestrzeń „Projekt” | ZAMKNIĘTA (KD-1): ekran „Nowy / otwórz projekt” renderuje się TAKŻE przy otwartym projekcie (chip nazwy projektu w pasku przypadku), zmiana projektu przez dialog potwierdzenia, powrót na pulpit bez zmiany kontekstu |
| L-6 | Kreator stacji jako powierzchnia trasowa | `ui2/kreatory/stacja` | ZAMKNIĘTA (KD-1): podzespół `station-wizard-v2` (7 komponentów + 7 testów + spec e2e + trasa) USUNIĘTY; kontrakty inżynierskie (`*Contract.ts`, `vendorSwitchgearCatalog`, `vendorBayRoleBridge`) ZOSTAJĄ — mają własne testy i pilnuje ich `scadaComplianceContract` |
| L-7 | Scenariusze zwarciowe (lista, dodanie, uruchomienie) | brak | okno ui2 dla scenariuszy + wejście w powłoce (dziś tylko trasa mostu bez nawigatora) |
| L-8 | Inspektor modelu ENM | brak | narzędzie diagnostyczne pozostaje za flagą OFF — świadomie poza UI inżyniera |
| L-9 | Powierzchnie zakładki „Pozostałe analizy” | `wyniki/analizy` | reszta wg `PLAN_WYGASZANIA_MOSTU_WYNIKI.md` (V12.6 akademicki, testy NC RfG, kreator porównania) |
| L-10 | Źródło LaTeX wywodu (kopiuj / pobierz `.tex`) | zakładka „Dowód obliczeń” | `ProofLatexPanel` (`GET` wywodu LaTeX) nie ma odpowiednika w `PrzegladDowodu` |
| L-11 | Dowód zawężony do WSKAZANEGO elementu | zakładka „Dowód obliczeń” | `PrzegladDowodu` nie przyjmuje kroku startowego wg elementu (`selection_index` z ExtendedTrace) — TODO nazwane już w `DowodPrzebiegu` |
| L-12 | Różnice mocy biernej w porównaniu A/B | `EkranPorownania` | ZAMKNIĘTA (KD-1): kolumny Q [Mvar] (A · B · Δ) w tabelach szyn i gałęzi — pola `q_injected_mvar_*`/`delta_q_mvar` i `q_from_mvar_*`/`delta_q_from_mvar` z payloadu backendu |
| L-13 | Różnice w procentach (Δ%) | `EkranPorownania` | backend `/api/power-flow-comparisons` nie zwraca `percent`; wyliczenie w UI byłoby fizyką/arytmetyką w prezentacji → potrzebne pole z backendu |
| L-14 | Filtr „pokaż tylko różnice” | `EkranPorownania` | ZAMKNIĘTA (KD-1): przełącznik „Pokaż tylko różnice” filtrujący wiersze po deltach BACKENDU (zero arytmetyki w prezentacji) |
| L-15 | Generator raportu i eksporty OSD | przestrzeń „Dokumentacja” | `HubDokumentacji` tylko prowadzi do powierzchni mostu E-37; brak okna ui2 |
| L-16 | Katalogi CT, VT, kable nN, aparaty nN | `spaces/model/katalog` | 4 kategorie obecne w moście (`CatalogBrowser`) i w API katalogu, nieobecne w `KATEGORIE` adaptera ui2 |
| L-17 | „Rozdzielnica: pola i aparaty” jako trasa | brak | ZAMKNIĘTA (KD-1): trasa `#switchgear`, `navigateToSwitchgear`, powierzchnia `switchgear_wizard` (typ, rejestr, gałąź routera, klucz trasy) i pozycja Ctrl+K USUNIĘTE |

## 6. Bramki karty K8

- Spec `frontend/e2e/mosty-parytet.spec.ts` — dla KAŻDEJ wygaszonej trasy zimne
  wejście starym adresem ląduje w oknie ui2 z zachowanym kontekstem; dla trasy
  zostawionej (`#catalog`) most nadal działa.
- Testy jednostkowe kanonu przepisane z zachowaniem intencji:
  `ui2/legacy/__tests__/useLegacyOrchestrator.test.tsx`,
  `ui2/legacy/__tests__/useLegacyMenuActions.test.tsx`.

## 7. Zamknięcia z karty KD-1 (2026-07-31)

- **L-2…L-5 (parytet zarządzania projektami)** — `ui2/spaces/projekt/otworz/**`
  (`ListaProjektow`, `OtworzProjekt`, `NowyProjektDialog`, `DialogPotwierdzenia`,
  `OtworzProjektKontener`) + klikalny chip nazwy projektu w `shell/CaseBar`.
  Bramka: `frontend/e2e/projekty-parytet.spec.ts` (asercje przez API — usunięty
  projekt znika z backendu) + testy kontenera.
- **L-12 i L-14 (porównanie A/B rozpływu)** — `ui2/wyniki/porownanie/**`.
  Zostaje L-13 (procent różnicy): backend nie zwraca pola `percent`, a liczenie
  go w UI byłoby arytmetyką w prezentacji — karta backendowa.
- **L-6 i L-17 (kasacje)** — patrz wiersze 4 i 16 tabeli werdyktów.
- **Znalezisko uboczne (naprawione u źródła):** `useTopologyStore.loadSummary`
  NIE MIAŁ żadnego wołającego produkcyjnego (jedyny konsument `ui/topology/TopologyPanel`
  nie jest montowany), więc drzewo topologii przestrzeni „Model” było ZAWSZE puste —
  liczniki blokad nie miały nawet gdzie się pojawić. Dostawca danych wpięty w powłokę
  (`ui2/nav/useZasilanieDrzewaTopologii`, ładowanie na zmianę przypadku i rewizji migawki).
- **Znalezisko uboczne (naprawione u źródła):** `topologyTreeAdapter` liczył jeden
  problem DWA razy, gdy `element_ref` powtarzał się w `element_refs` — po przepięciu
  na jedną prawdę gotowości dawało to podwojone liczniki blokad.
