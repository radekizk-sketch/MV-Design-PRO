# INWENTARZ PARYTETU MOSTÓW LEGACY — trasa po trasie (karta K8, 2026-07-31)

**Status:** WIĄŻĄCY. Dokument rejestruje, które trasy mostu legacy (stare
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
| 3 | `#dashboard` | `ProjectDashboardSurface` (lista, otwórz, nowy z modalem, **usuń**, odśwież) | „Otwórz projekt” w powłoce i na pulpicie (`AppRoot.otworzPulpitProjektow`) | `spaces/projekt/otworz/OtworzProjektKontener` (lista, otwórz, nowy z celu) | **ZOSTAWIĆ** (luki L-2…L-5) |
| 4 | `#kreator-stacji-v2` | `StationWizardSurface` → `StationWizardWorkspace` | **brak** (żaden kod produkcyjny nie ustawia tego hasha) | `ui2/kreatory/stacja/KreatorStacjiSnNn` — realny kreator, wpięty przez `operationFormRegistry` (`insert_station_on_segment_sn`, `append_station_on_endpoint`) | **MARTWY jako trasa** (luka L-6) |
| 5 | `#fault-scenarios` | `FaultScenariosPanel` + `FaultScenarioModal` | **brak** (`navigateToFaultScenarios` bez wołającego) | brak | **ZOSTAWIĆ** (defekt naprawiony w K8 — patrz §4; luka L-7) |
| 6 | `#enm-inspector` | `EnmInspectorPage` za flagą `ENM_INSPECTOR_VISIBLE` (domyślnie OFF) | brak | brak (narzędzie deweloperskie) | **ZOSTAWIĆ** (luka L-8) |
| 7 | `#analysis` / `#results` | hub „Analizy techniczne” — od F-E5c dostawcą jest **ui2** (`MostAnalizTechnicznych` → `EkranAnalizTechnicznych`); most renderuje tylko powierzchnie-dzieci | menu, `navigateToResults` po DONE, deep-link | `wyniki/analizy/EkranAnalizTechnicznych` + zakładki warsztatu | **ZOSTAWIĆ** (widok domyślny już ui2; zakładka „Pozostałe analizy” = reszta mostu, luka L-9) |
| 8 | `#proof` (alias, `tab=trace`) | `ElementCalculationProofPanel` + `ProofLatexPanel` (źródło LaTeX: kopiuj/pobierz `.tex`) | `InspectorPanel` („Otwórz wywód”), Ctrl+K „Dowód obliczeniowy” (→ zakładka ui2, nie trasa) | zakładka „Dowód obliczeń” (`DowodPrzebiegu` → `PrzegladDowodu`): kroki WHITE BOX + odcisk wejścia | **ZOSTAWIĆ** (luki L-10, L-11) |
| 9 | `#compare` (alias) | `ResultsComparisonPage` (`POST /api/comparison/runs`): szyny U[kV]+U[pu]+Δ%, gałęzie P/Q+Δ%, zwarcia jako 2 skalary, filtr „tylko różnice”, status IMPROVED/REGRESSED (heurystyka w UI) | Ctrl+K „Porównanie przebiegów” (→ zakładka ui2, nie trasa) | zakładka „Porównanie A/B” (`EkranPorownania` + `TrybZwarciowy`): tryb rozpływowy (`/api/power-flow-comparisons`) i zwarciowy (tabela punktów Ik″/ip/Ith/Sk), ranking problemów, dowód kolumny A i B | **ZOSTAWIĆ** (luki L-12…L-14) |
| 10 | `#power-flow-results` (alias) | powierzchnia E-35 z `tabId='power-flow'` — **zakładka bez własnej gałęzi renderu**, więc GENERYCZNA `AnalysisDataTable` (te same wiersze dla każdej zakładki, limit 200) | brak wołającego produkcyjnego; zimny deep-link | zakładka „Rozpływ mocy” (`EkranRozplywu`: `TabelaSzyn`, `TabelaGalezi`, profil napięć, wejście w dowód) | **WYGASIĆ** ✅ (nadzbiór) |
| 11 | `#protection-results` (alias) | powierzchnia E-35 z `tabId='protection'` — jak wyżej: GENERYCZNA tabela, zero treści zabezpieczeniowej | Ctrl+K „Wyniki zabezpieczeń” (`useLegacyMenuActions`, akcja `protection`) | **NOWA** zakładka „Koordynacja zabezpieczeń” (`EkranKoordynacji` — dostawca ui2 ekranu E-28: krzywe TCC, marginesy CTI, nastawy z backendu) | **WYGASIĆ** ✅ (nadzbiór) |
| 12 | `#report` | `ReportSurface` (E-37) — generator raportu, eksporty OSD/audytowe | Ctrl+K „Generator raportu”, `WorkspaceOperationalBar`, karty huba Dokumentacji | brak w ui2 (`HubDokumentacji` tylko prowadzi do powierzchni mostu) | **ZOSTAWIĆ** (luka L-15) |
| 13 | `#variants` | `VariantsSurface` (E-08, klasa B → prawy panel): karta read-only (projekt, wariant, stan obliczeń, liczba przebiegów, ostatni przebieg, następny krok) + 4 przyciski nawigacyjne | Ctrl+K „Warianty i przebiegi”, `WorkspaceOperationalBar` | przestrzeń „Obliczenia” (`MenedzerPrzypadkow` + `PrzebiegiPanel` — historia z parametrami i odciskiem odtwarzalności) + przestrzenie docelowe przycisków (Wyniki / Dokumentacja / Gotowość) | **WYGASIĆ** ✅ (nadzbiór) |
| 14 | `#case-config` | powierzchnia E-07 — **`renderSurfaceBody` NIE MA gałęzi dla `E-07`**, więc prawy panel pokazywał sam nagłówek „Zakresy obliczeń” bez treści i zasłaniał inspektor ui2 | Ctrl+K „Konfiguracja zakresu obliczeń”, **oraz każde jawne wejście w przestrzeń „Obliczenia”** (`przejsciaPrzestrzeni.mostTrasyPrzestrzeni`) | przestrzeń „Obliczenia” (`MenedzerPrzypadkow`: lista, nowy, aktywacja, porównanie konfiguracji) | **WYGASIĆ** ✅ (most nie miał czego pokazać) |
| 15 | `#catalog` | `CatalogHelperSurface` (E-38) → `CatalogBrowser`, 8 przestrzeni nazw: `LINIA_SN`, `KABEL_SN`, `TRAFO_SN_NN`, `APARAT_SN`, `APARAT_NN`, `KABEL_NN`, `CT`, `VT` | Ctrl+K „Katalogi techniczne”, pasek narzędzi, `NcRfgTestsTab` | zakładka „Katalog” przestrzeni Model (`KatalogPanel`), 5 kategorii: `LINIA`, `KABEL`, `TRANSFORMATOR`, `APARAT`, `FALOWNIK` (+ „Gdzie użyty”) | **ZOSTAWIĆ** (luka L-16) |
| 16 | `#switchgear` | powierzchnia pomocnicza `switchgear_wizard` — router kieruje ją do **`AnalysisSurface`** (ta sama gałąź co E-35): tytuł „Rozdzielnica: pola i aparaty”, treść = nawigacja analityczna i tabela wyników | Ctrl+K „Kreator rozdzielnicy” | brak trasowego odpowiednika (konfiguracja pól żyje w kartach E-10/E-11 otwieranych z kanwy) | **MARTWY (phantom)** (luka L-17) |
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
| L-2 | Usunięcie projektu | `spaces/projekt/otworz` | akcja „Usuń projekt” + dialog potwierdzenia (`DELETE /api/projects/{id}` istnieje, klient `deleteProject` istnieje) |
| L-3 | Nowy projekt z dowolną nazwą i opisem | `OtworzProjektKontener` | ui2 wyprowadza nazwę/opis z celu pracy (4 predefiniowane) — brak pól swobodnych |
| L-4 | Odświeżenie listy projektów | `ListaProjektow` | akcja „Odśwież listę” (ui2 ładuje listę raz przy montażu) |
| L-5 | Zmiana projektu przy aktywnym projekcie | przestrzeń „Projekt” | `OtworzProjektKontener` renderuje się tylko przy `activeProjectId == null`; „Otwórz projekt” nadal prowadzi na trasę mostu `#dashboard` |
| L-6 | Kreator stacji jako powierzchnia trasowa | `ui2/kreatory/stacja` | decyzja + krok kasacyjny dla `station-wizard-v2` (`StationWizardSurface`/`Workspace` + 4 komponenty + testy) — kreator ui2 jest wpięty tylko jako formularz operacji domenowej |
| L-7 | Scenariusze zwarciowe (lista, dodanie, uruchomienie) | brak | okno ui2 dla scenariuszy + wejście w powłoce (dziś tylko trasa mostu bez nawigatora) |
| L-8 | Inspektor modelu ENM | brak | narzędzie diagnostyczne pozostaje za flagą OFF — świadomie poza UI inżyniera |
| L-9 | Powierzchnie zakładki „Pozostałe analizy” | `wyniki/analizy` | reszta wg `PLAN_WYGASZANIA_MOSTU_WYNIKI.md` (V12.6 akademicki, testy NC RfG, kreator porównania) |
| L-10 | Źródło LaTeX wywodu (kopiuj / pobierz `.tex`) | zakładka „Dowód obliczeń” | `ProofLatexPanel` (`GET` wywodu LaTeX) nie ma odpowiednika w `PrzegladDowodu` |
| L-11 | Dowód zawężony do WSKAZANEGO elementu | zakładka „Dowód obliczeń” | `PrzegladDowodu` nie przyjmuje kroku startowego wg elementu (`selection_index` z ExtendedTrace) — TODO nazwane już w `DowodPrzebiegu` |
| L-12 | Różnice mocy biernej w porównaniu A/B | `EkranPorownania` | kolumny Q [Mvar] (A · B · Δ) — payload backendu JE MA (`delta_q_mvar`, `delta_q_from_mvar`), ekran ich nie pokazuje |
| L-13 | Różnice w procentach (Δ%) | `EkranPorownania` | backend `/api/power-flow-comparisons` nie zwraca `percent`; wyliczenie w UI byłoby fizyką/arytmetyką w prezentacji → potrzebne pole z backendu |
| L-14 | Filtr „pokaż tylko różnice” | `EkranPorownania` | brak przełącznika ograniczającego tabele do wierszy ze zmianą |
| L-15 | Generator raportu i eksporty OSD | przestrzeń „Dokumentacja” | `HubDokumentacji` tylko prowadzi do powierzchni mostu E-37; brak okna ui2 |
| L-16 | Katalogi CT, VT, kable nN, aparaty nN | `spaces/model/katalog` | 4 kategorie obecne w moście (`CatalogBrowser`) i w API katalogu, nieobecne w `KATEGORIE` adaptera ui2 |
| L-17 | „Rozdzielnica: pola i aparaty” jako trasa | brak | trasa `#switchgear` jest phantomem (renderuje `AnalysisSurface`); wymaga rozstrzygnięcia produktowego: kasacja trasy + pozycji Ctrl+K albo realny dostawca (E-10/E-11 z jawnym wyborem stacji) |

## 6. Bramki karty K8

- Spec `frontend/e2e/mosty-parytet.spec.ts` — dla KAŻDEJ wygaszonej trasy zimne
  wejście starym adresem ląduje w oknie ui2 z zachowanym kontekstem; dla trasy
  zostawionej (`#catalog`) most nadal działa.
- Testy jednostkowe kanonu przepisane z zachowaniem intencji:
  `ui2/legacy/__tests__/useLegacyOrchestrator.test.tsx`,
  `ui2/legacy/__tests__/useLegacyMenuActions.test.tsx`.
