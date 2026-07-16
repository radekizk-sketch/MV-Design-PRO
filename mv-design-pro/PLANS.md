# MV-DESIGN-PRO Operational Plan

**Version:** 5.1
**Status:** LIVING DOCUMENT
**Last updated:** 2026-05-24 (V12.6 academic end-to-end closure)
**Reference (canon):** [`docs/v12xx/KANON_V12_XX.md`](docs/v12xx/KANON_V12_XX.md) (binding), [`docs/system/`](docs/system/) (binding specs), [`SYSTEM_SPEC.md`](SYSTEM_SPEC.md) (executive overview).
**Reference (archive):** [`docs/spec/`](docs/spec/) — historical V11 reference; not source of truth.
**Active work:** see § 3 and [`docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md`](docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md).

---

## 1. Project Status Summary

MV-DESIGN-PRO is a functional Medium Voltage network design and analysis system with:
- 18 solver modules (IEC 60909 SC + machine SC, NR/GS/FD/unbalanced Power Flow, inverter/ZIP models,
  IEC 60364 fault loop, IEC 60255 protection, NC RfG/PTPiREE, FRT/HVRT, RMS stability, WLS state
  estimation — binding inventory: `docs/uiux/INWENTARZ_FUNKCJI_2026-07.md`)
- 8+ proof packs (SC3F, VDROP, Equipment, PF, Losses, Protection, Earthing, LF Voltage, V12.6 academic)
- 19 analysis modules (Protection, Voltage, Normative, Coverage, Sensitivity, Comparison,
  Recommendations, Arc Flash, Grid Strength, Reactive Adequacy, SSCI, Sanity Bounds, Energy Validation, …)
- Full frontend (63 UI modules — see binding inventory)
- ~5,400 backend test functions; ~7,350 frontend tests (537 files); 79 guard scripts
- Project import/export (ZIP, deterministic, versioned)
- CAD geometry editing in SLD
- PDF/DOCX report generation

---

## 2. Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1: Documentation | Canonical docs (SYSTEM_SPEC, ARCHITECTURE, AGENTS, PLANS) | DONE |
| Phase 1.x: UI/UX Parity | canonical alignment docs | DONE |
| Phase 1.y: UI Contracts | SLD, Results, Inspector contracts | DONE |
| Phase 1.z: UI Exploration | Results/Inspector exploration docs | DONE |
| Phase 2: NetworkModel Core | Core elements, graph, snapshot | DONE (code) |
| Phase 2.x: UI PF++ Contracts | Advanced UI contracts (topology tree, switching, SC node) | DONE (docs) |
| Phase 3: Catalog Layer | Immutable types, resolver, governance | DONE |
| Phase 4: Case Layer | Case lifecycle, invalidation, clone | DONE |
| Phase 5: Interpretation Layer | BoundaryIdentifier, BoundaryNode moved to analysis | DONE |
| Phase 6: Wizard/SLD Unity | Verify single model access | DONE (27 backend + 23 frontend tests) |
| P10a: State/Lifecycle | Case result status machine | DONE |
| P10b: Result State + Comparison | A/B comparison | DONE |
| P11: Proof Engine | SC3F, VDROP proofs | DONE |
| P11a: Results Inspector | Read-only + trace + SLD overlay | DONE |
| P11b: Frontend Results Inspector | Result view | DONE |
| P11c: Results Browser + A/B Compare | UI-only | DONE |
| P12: Equipment Proof Pack | Thermal/dynamic withstand | DONE |
| P12a: Data Manager Parity | Case manager + active case + mode blocks | DONE |
| P14: Proof Audit & Coverage | Audit coverage | DONE |
| P14a: Protection Library (foundation) | Vendor curves, IDMT | DONE |
| P14b: Protection Library Governance | Manifest, fingerprint, export/import | DONE |
| P14c: Protection Case Config | Protection config | DONE |
| P15a: Protection Analysis Foundation | Backend overcurrent analysis | DONE |
| P23: Study/Scenario Orchestration | Scenario workflow | DONE (docs) |
| P30a: Undo/Redo Infrastructure | Command history | DONE |
| P30c: Property Grid Multi-Edit | Multi-selection editing | DONE |
| P30d: Issue Panel / Validation Browser | Validation display | DONE |
| P30e: Context Property Grid | Context-sensitive grid | DONE |
| P30f: SLD Layout Determinism Tests | Auto-layout tests | DONE |
| P31: Project Import/Export | ZIP archive (deterministic) | DONE |
| SLD CAD Geometry | CadOverridesDocument contract | DONE |
| SLD CAD Tools | Drag, bends, reset, status | DONE |
| SLD Fit-to-Content | Viewport fit action | DONE |
| SLD Routing Corridors | Connection routing obstacles | DONE |
| Infra: /api/health | Health endpoint + API URL separation | DONE |
| Memory Canonization V3.0 | This canonization pass | DONE |
| EP-1: Application API | Projects + Cases + Network persistence | DONE |
| EP-4: Case-Bound Runs | POST /cases/{cid}/runs/short-circuit, loadflow, protection | DONE |
| EP-5: SC Asymmetrical | Solver supports 1F, 2F, 2F+G (already existed) | DONE |
| EP-6: Protection Settings | I>/I>> dobor nastaw (Hoppel method) | DONE |
| EP-7: Q(U) Regulation | Proof pack NC RfG compliance | DONE |
| EP-9: PostgreSQL | Full SQLAlchemy ORM (was already migrated) | DONE |
| EP-10: XLSX Importer | Import sieci z Excel | DONE |
| EP-11: Docker + Health | Rozszerzony health: db_ok, engine_ok, solvers, uptime | DONE |
| EP-3: Wizard K1-K10 | Frontend kreator budowy sieci | DONE |
| ENM v1.0 | EnergyNetworkModel contract + mapping + validator + API + Wizard | DONE |

---

## 3. Active Work

### 3.-1 Program UI/UX klasy przemysłowej 2026-07 (ACTIVE)

Objective: przebudowa całego UI/UX do klasy ETAP/PowerFactory wg
[`docs/uiux/PROGRAM_UIUX_2026-07.md`](docs/uiux/PROGRAM_UIUX_2026-07.md) (fazy U0–U5),
zakres funkcjonalny gwarantowany przez
[`docs/uiux/INWENTARZ_FUNKCJI_2026-07.md`](docs/uiux/INWENTARZ_FUNKCJI_2026-07.md),
orkiestracja wg [`docs/uiux/PROMPT_ZARZADCA_FABLE_UIUX.md`](docs/uiux/PROMPT_ZARZADCA_FABLE_UIUX.md).
Gałąź programu: `claude/power-network-design-ui-ir91mv`.

Progress:
- [x] U0.1 Inwentarz funkcji + macierz pokrycia (2026-07-15; bilans: 8 funkcji bez UI, ~17 częściowych)
- [x] U0.2 Rejestracja programu (INDEX.md, PLANS.md, CLAUDE.md, naprawa dryfu README)
- [x] U0.3 Weryfikacja wpięcia API (2026-07-15): 4 analizy NIEWPIĘTE do API (arc_flash,
      grid_strength, reactive_adequacy, state_estimation WLS), 13 modułów API niezamontowanych
      w aplikacji — szczegóły w inwentarzu §4 i §6
- [x] U0.4 Porządkowanie PLANS.md — sekcje 5.0–5.9 → `docs/audit/archive/PLANS_SESJE_SLD_2026-05.md`
- [x] U0.5 Karta koordynacyjna tokenów motywów z wątkiem SLD (`docs/uiux/KARTA_KOORDYNACJI_SLD_01_TOKENY.md`)
- [x] U0.7 Model interakcji całej aplikacji + rejestr okien W-101…W-703
      (`docs/uiux/MODEL_INTERAKCJI_APLIKACJI_2026-07.md`; mandat clean-room UI — decyzja
      właściciela 2026-07-15: każde okno i każda interakcja od nowa)
- [x] U0.8 Specyfikacja kreatorów (`docs/uiux/SPEC_KREATORY_2026-07.md`) — dyrektywa
      właściciela 2026-07-15: maksymalna szczegółowość, zero pustych pól, podpowiedź
      inżynierska przy każdym polu, gotowe przykłady P-01…P-05 z kompletem danych
- [x] U0.9 Zasada języka (dyrektywa właściciela 2026-07-15): w całym interfejsie wyłącznie
      polski język techniczny, zakaz surowych identyfikatorów z kodu w tekstach
      pierwszoplanowych (MODEL_INTERAKCJI §2.7); egzekwowanie — rozszerzenie
      `ui_terminology_guard` (obowiązkowa karta w U1)
- [x] U0.10 Specyfikacja powiązania warstw (`docs/uiux/SPEC_POWIAZANIA_WARSTW_2026-07.md`) —
      dyrektywa właściciela 2026-07-15: wszystkie warstwy powiązane wielowarstwowo (kreator →
      schemat → drzewo → gotowość → ważność wyników → raporty z jednego zdarzenia); magistrala
      zdarzeń + selekcja globalna + kontrakt świeżości rewizji; scenariusz akceptacyjny e2e w §7
- [x] U0.11 Taksonomia szablonów stacji (`docs/uiux/SZABLONY_STACJI_2026-07.md`) — dyrektywa
      właściciela 2026-07-15: grupy logiczne A–E (zasilanie / dystrybucja / odbiorcze / OZE /
      specjalne), stan zastany 57+ szablonów w 10 kategoriach, delta do dodania (GPZ, RS,
      abonenckie, kompensacja, rezerwa zasilania), cel ≥ 80; przeglądarka szablonów w kreatorze
- [x] U0.12 Propozycje rozszerzeń P1–P22 (`docs/uiux/PROPOZYCJE_ROZSZERZEN_2026-07.md`) —
      ZATWIERDZONE zasadą „na max" (decyzja właściciela 2026-07-15); kolejność: U3 (P3, P4,
      P20), U4 (P1, P2, P5, P6, P9, P10, P13–P15, P18), po U4/U5 (reszta + grupa III)
- [x] U0.13 Zasada „ZAWSZE NA MAX" (Program §2.0, decyzja właściciela 2026-07-15): braki
      rozbudowujemy od razu, delta backendowa w zakresie programu (w granicach kanonu fizyki);
      gotowce w pełni edytowalne + szablony użytkownika (SPEC_KREATORY Z4, SZABLONY §4a)
- [x] U0.14 Układ paneli (`docs/uiux/SPEC_UKLAD_PANELI_2026-07.md`) — dyrektywa właściciela
      2026-07-15: lewy (nawigacja+kontekst, zwijany do listwy ikon) / środkowy (warsztat,
      karty + podział widoku) / prawy (inspektor: zakładki, akordeon, pinezka, chowany) +
      panel dolny + tryby Podstawowy/Rozszerzony/Ekspercki na mode-gate (ukrywanie okien
      zaawansowanych; wyszukiwarka poleceń znajduje wszystko)
- [x] U0.16 Propozycje rundy 3 P23–P38 (poziom profesorski: niepewność wyników, walidacja
      metodą niezależną, rejestr założeń, analiza wymiarowa, profile czasowe, skan N-1,
      wrażliwości węzłowe, obszary P–Q, kaskada zasilania, optymalizacja NOP, projekt uziomu,
      ograniczniki, studium przyłączenia, strategie BESS, migotanie, walidacja modelu
      falownika) — zatwierdzone zasadą „na max"; kolejność po U5 wg delty backendowej
- [x] U0.15 Audyt rady specjalistów (`docs/uiux/AUDYT_RADY_SPECJALISTOW_2026-07.md`) —
      dyrektywa właściciela 2026-07-15: 13 perspektyw eksperckich, rozbudowa każdego okna
      rejestru (konkretne wymagania per ekran), delta rejestru +16 okien (W-105…W-707)
      z trybami minimalnymi; rozbudowy = wymagania kart zadań (pominięcie tylko za zgodą)
- [x] U0.6 Makiety IA — ZATWIERDZONE przez właściciela 2026-07-15 („Akceptujemy") — 7 punktów:
      układ powłoki, kolejność przestrzeni, gramatyka interakcji, motywy, kreatory zero pustych
      pól, powiązanie warstw, układ paneli z trybami. **FAZA U0 ZAMKNIĘTA.**
- [x] U0.17 Runda 4 P39–P47: maksymalna rozbudowa specjalisty OZE / NC RfG (dyrektywa
      właściciela 2026-07-15) + priorytet strumienia OZE w kolejności realizacji
- [ ] U1 W TOKU (od 2026-07-15): karty w `docs/uiux/karty/`
      - [x] E1.1 Powłoka W-110 + tokeny `--mvd-*` (wykonawca Opus; pełny vitest 7388 pass;
            zintegrowane `a75b7e9`)
      - [x] E15.1 Magistrala zdarzeń (wykonawca Sonnet; pełny vitest 7393 pass; pokrycie
            gałęzi bus.ts 100%; zintegrowane `39a833b`; TODO-KARTA `selekcja.zrodlo`
            rozstrzygnięte: okna emitują selekcję z prawdziwym źródłem, adapter = fallback)
      - [x] E1.2 Drzewa kontekstowe (Sonnet; pełny vitest 7434 pass; zintegrowane `878bbbc`)
      - [x] E1.3 Inspektor kontekstowy (Opus; pełny vitest 7445 pass; zintegrowane `e92928a`)
      - [x] Weryfikacja łączna zarządcy: 553 pliki / 7534 testy pass na drzewie E1.1+E1.2+E1.3+E15.1
      - [x] E1.4 Integracja powłoki (zarządca): AppRoot + drzewa w lewym panelu + inspektor
            + magistrala + klient /api/health; test integracyjny scenariusza powiązania warstw;
            188 testów ui2; decyzje TODO-KARTA zapisane w karcie E1.4 §2;
            pełny vitest po integracji: 7538 pass (potwierdzone 2026-07-15)
      - [x] E1.5 Wyszukiwarka poleceń W-105 (Sonnet; pełny vitest 7579 pass; 41 testów;
            zintegrowane `357ec04`)
      - [x] E2.1 Pulpit projektu W-101 (Opus; pełny vitest 7577 pass; 39 testów;
            zintegrowane `07fe669`; kafle bez źródła danych = stan „wkrótce" z TODO-KARTA)
      - [x] Scalenie zarządcy #2: CommandPalette pod Ctrl+K (slot renderSearchDialog
            w AppShell zamiast szkieletu), pulpit jako warsztat przestrzeni „Projekt",
            provider obiektów wyszukiwarki ze snapshotu, akcje przestrzeni/obiektów
            (nawigacja + selekcja przez magistralę), 270 testów ui2
      - [x] E1.6 Guard językowy: wykrywanie identyfikatorów snake_case w stringach UI ui2
            (canary czerwony/zielony; self-test 6/6; `1f3263e`)
      - [x] E15.2 Kontrakt świeżości (Sonnet; 17 testów; zintegrowane `3661fe2`; TODO-KARTA:
            para rewizji dla stanu początkowego OUTDATED — decyzja: uczciwa etykieta bez pary
            do czasu zdarzenia magistrali; filtracja per przypadek = przy E7)
      - [x] KOREKTA RZETELNOŚCI: bieg potwierdzający scalenia #2 raportowany wcześniej jako
            zielony był FAŁSZYWYM greenem (kod wyjścia potoku `| tail`, nie vitest) — wykrył to
            wykonawca E15.2 (czerwony test fixture pulpitu: brak kolekcji corridors/measurements/
            protection_assignments). Naprawione: fixture uzupełniony (270→287 testów ui2 zielone
            z pipefail); procedura zarządcy od teraz z `set -o pipefail`
      - [x] E2.2 Nowy/otwórz projekt W-102 (Sonnet; 30 testów; pełny bieg u wykonawcy zielony
            poza znanym błędem fixture naprawionym w `ed09d54`; zintegrowane `056b157`;
            TODO-KARTA: brak store'a projektów — lista przez props, hook przy wpięciu)
      - [x] E1.7 Przełączenie powłoki (Opus, dekompozycja a/b/c po STOP-raporcie):
            E1.7a ekstrakcja orkiestracji z App.tsx do headless hooka (1457→397 linii;
            pełny vitest 7673; e2e 173 pass, tor krytyczny zielony; `2274d72`) ·
            E1.7b parytet kontraktu testid + LegacySurface + flaga wejścia (vitest 7685
            — potwierdzone niezależnie przez zarządcę; e2e identyczne z baseline;
            `103b03a`) · E1.7c NOWA POWŁOKA DOMYŚLNA + kasacja starej ramy
            (−5595 linii, App.tsx/AppShellV12/CanonicalLayout/stara nawigacja usunięte;
            e2e 180 pass / 2 fail pre-existing env; 3 spec-y zmigrowane z intencją;
            `3693c01`). **FAZA U1 ZAMKNIĘTA 2026-07-15.**
      - [x] V12K-026 RESOLVED: słownik nowej IA („przypadek obliczeniowy", „kreator");
            guard terminologii zielony w całym repo (naprawione 2 zastane naruszenia)
- [ ] U2 W TOKU (2026-07-16): E3.1 przeglądarka szablonów (82 t.) · E3.2 preselekcja+Z2 ·
        E6.1 panel gotowości wg celów (61 t.) · E7.1 menedżer przypadków (38 t.) ·
        E7.2 przebiegi W-503 (43 t.) · E4.1 katalog+karta techniczna (44 t.) + 4 scalenia.
        Przestrzenie w pełni na nowej powłoce: Projekt, Gotowość, Obliczenia (3/7);
        Model = warsztat 3 zakładki (schemat/szablony/katalog). Pełny bieg: 7894 pass.
- [ ] U3 W TOKU (2026-07-16): E8.1 wspólny wzorzec ekranu analizy + rozpływ szyn
        (Opus; 50 testów — wzorzec 27 + rozpływ 23; pełny vitest u wykonawcy 7944 pass
        z pipefail; ui2 655 pass u zarządcy; zintegrowane `fd630d8`; TODO-KARTA:
        wirtualizacja >500 wierszy, świeżość liczbowa w TabelaSzyn, dowód per-szyna,
        wpięcie store'u). Karta E8.2 (zwarcia W-604) zarejestrowana `0cbdbb1`.
        Scalenie U3 #1 (zarządca): WynikiWarsztat — przestrzeń „Wyniki" z zakładkami
        „Rozpływ mocy" (TabelaSzyn, nowa powłoka) + „Pozostałe analizy" (most #analysis
        renderowany WEWNĄTRZ zakładki; powierzchnia rozwinięta nie przykrywa warsztatu
        w tej przestrzeni); wpięcie store'u rozpływu (zamyka TODO-KARTA E8.1 #4:
        selectRun+loadResults na `wyniki-gotowe` i przy montażu, tylko LOAD_FLOW/DONE);
        14 testów; ui2 669 pass; potwierdzenie pełne 596/7958 na `0374eee`.
        E8.2 okno wyników zwarciowych W-604 (Opus; 37 testów; pełny vitest u wykonawcy
        7981 pass z pipefail; zintegrowane `9c0bf6a`; TODO-KARTA: wybór wiersza we wzorcu,
        wkłady w kontrakcie wyników [delta backendowa], świeżość liczbowa, c/czas przez
        props). Scalenie U3 #2 (zarządca): zakładka „Zwarcia" w WynikiWarsztat +
        `useWpiecieWynikow` (rozpływ i zwarcia; SC_* → inspektor wyników), założenia
        zwarciowe c/czas z konfiguracji aktywnego przypadku tylko przy zgodności
        przebieg↔przypadek; 18 testów przestrzeni; ui2 710 pass. Karty zarejestrowane:
        E9.1 dowód W-608 (`79e3f27`, delegowana), P39 macierz NC RfG (`0e9ef7f`, U4/OZE).
        E9.1 przegląd dowodu (Opus; 40 testów; kanon 5 pól, MathBlock z ui/proof,
        selekcja 'dowod' przez magistralę; zintegrowane `05577bf`; ui2 750 pass).
        NAPRAWA REGRESJI E2E (wykryta pierwszym biegiem e2e od E1.7c, na świeżym
        kontenerze): katalog `ui2/spaces/model/szablony/api/` z E3.1 wpadał w mock
        speców `page.route('**/api/**')` — vite serwował moduł jako JSON i aplikacja
        nie startowała w 24 specach (kreator stacji, ux-feedback, designer-flow,
        pierwszy przypadek). Fix: moduł spłaszczony do `szablonyClient.ts` (`f43df1a`)
        + expect.timeout 10→20 s (rozruch ~12 s na wolniejszym kontenerze, `3f033fb`)
        + baseline'y wizualne chromium-linux (`55a0afc`, `eeb6046`). Wynik: e2e
        179 pass / 2 znane środowiskowe / 15 skip + zaktualizowana migawka = parytet
        baseline E1.7c. Procedura: po każdym biegu e2e przywracać PNG w docs/audit
        (baseline'y win32 nadpisywane lokalnymi renderami).
        Scalenie U3 #3: zakładka „Dowód obliczeń" w warsztacie wyników (E9.1 spięte
        ze śladem przez inspektor wyników, leniwe ładowanie; 2×klik → dowód w nowej
        powłoce; `42d7e79`; pełny bieg 8046 pass). Scalenie U3 #4: natywny wybór
        wiersza we wzorcu (delta API; zamyka TODO E8.2 A; `b5ae89b`; ui2 758).
        Karta E12.1 porównanie A/B rozpływu W-609 zarejestrowana (`115a225`).
- [ ] U4 OTWARTE strumieniem OZE (2026-07-16): P39 macierz wymogów NC RfG (Opus;
        33 testy; pełny vitest u wykonawcy 8079 pass ZERO failed; zintegrowane
        `a626f90`; napięcie przyłączenia WYŁĄCZNIE z modelu/katalogu — stan
        „brak danych" zamiast 15 kV z powietrza; USTALONE: backend klasyfikuje
        moduły A/B/C/D sam (`engine.py:235`) — delta backendowa rdzenia zbędna;
        TODO-KARTA: certyfikat zgodności projektu E13/W-707, wpięcie do pulpitu
        OZE P47, wyświetlenie klasy modułu w podsumowaniu).
        Scalenie #5 (zarządca): macierz NC RfG jako zakładka „Zgodność NC RfG"
        warsztatu wyników (W-614/N6) + ślad WHITE BOX testu INLINE w szczególe
        werdyktu (wzory ASCII solvera — świadomie bez KaTeX; zero martwych
        klików; `d1910d7`). Pełny bieg na spokojnym drzewie: 8082 pass, exit 0.
        E12.1 porównanie A/B rozpływu W-609 (Opus; 35 testów; pełny vitest
        u wykonawcy 8115 pass ZERO failed; zintegrowane `f1b219d`; źródło listy
        przebiegów: /projects/{id}/power-flow-runs — id zgodne z endpointem
        porównań; TODO-KARTA: porównanie zwarć, nakładka delta na SLD przez
        kartę koordynacyjną, nazwa przypadku w etykiecie przebiegu, eksport).
        Scalenie #6 (zarządca): zakładka „Porównanie A/B" w warsztacie wyników
        (bez projektu — uczciwy stan pusty); ui2 829 pass; pełny bieg 8118 pass.
        P47 pulpit instalacji OZE (Opus; 26 testów; pełny vitest u wykonawcy
        8144 pass ZERO failed; zintegrowane `7c551fb`; wspólny store biegu NC RfG
        macierz↔pulpit; USTALONE: DER nie niesie pojemności magazynu [kWh] —
        sekcja BESS tylko z realnych referencji katalogowych; TODO-KARTA:
        wpięcie API grid_strength/reactive_adequacy = osobna karta delty).
        Scalenie #7 (zarządca): zakładka „Pulpit OZE" w warsztacie wyników
        (`8e74937`; ui2 856 pass). Pełny bieg: 8145 pass.
        „NA MAX" (dyrektywa 2026-07-16): braki P47 w realizacji — karty D1 (delta
        backendowa: API grid_strength/reactive_adequacy; wykonawca pracuje,
        pliki gotowe, czeka na pełny pytest) i P47a (pulpit: magazyn z katalogu
        e_kwh + sekcje analiz) zarejestrowane `0076882`. USTALONE: pojemność
        magazynu JEST w katalogu konwerterów (mv_converter_catalog.py:232) +
        końcówka /api/catalog/converter-types istnieje. Kolejna luka tego wzorca:
        sanity_bounds i energy_validation też bez API (karta D2 po scaleniu D1).
        E8.3 tabela gałęzi rozpływu (Sonnet; 28 testów; pełny vitest u wykonawcy
        8173 pass ZERO failed; zintegrowane `6e70741`). Scalenie #8: EkranRozplywu
        (podzakładki Szyny/Gałęzie) w zakładce Rozpływ (`e06d9ab`; ui2 884 pass;
        pełny vitest 8173 potwierdzony).
        D1 API analiz OZE (Opus; 29 testów; końcówki /api/oze-analysis/
        grid-strength i /reactive-adequacy; pełny pytest 5725 pass ZERO failed —
        potwierdzony też przez zarządcę na scalonym drzewie; zintegrowane
        `9c2d6d6`; NOTA: pre-existing naruszenia ruff/black w nietkniętych
        plikach repo — poza zakresem, CI ich nie egzekwuje; TODO-KARTA:
        n_parallel przy mocy IBG, q_actual z wyniku PF per źródło).
        D2 API jakości wyników (Opus; 26 testów; końcówki /api/quality/
        sanity-bounds i /energy-validation; pełny pytest 5750 pass ZERO failed —
        potwierdzony przez zarządcę na scalonym drzewie; zintegrowane `dbd044f`;
        serwis energy_validation jako pakiet service.py — kolizja nazw
        rozstrzygnięta jawnie). Karta E8.4 okno jakości wyników W-607 `3c68d7d`;
        P47a pulpit OZE na max (Opus; 39 testów; pełny vitest u wykonawcy 8204
        pass ZERO failed; zintegrowane `3f0c44e`; ui2 915 pass u zarządcy;
        USTALONE: referencje magazynów `conv-bess-*` = item_id katalogu
        konwerterów, `bess_bat_*` poza nim → jawny stan nieodnalezienia; ślad
        SCR w ASCII spójnie z NC RfG; TODO-KARTA: mapowanie moduł→węzeł dla
        podświetlenia, konwencja formatera energii; ZAOBSERWOWANE: przejściowy
        szum testowy AnonymizationProvider/navigation — flaky do obserwacji).
        E8.4 okno jakości wyników W-607 (Opus; 46 testów; pełny vitest
        u wykonawcy 8219 pass ZERO failed; zintegrowane `d3c86c6`; pełny słownik
        rodzajów kontroli PL; why_pl w panelu szczegółu — decyzja dostępności).
        Scalenie #9: zakładka „Jakość wyników" w warsztacie (`121ea74`; ui2 962
        pass). ŁAŃCUCH „NA MAX" DOMKNIĘTY: luka → D1/D2 (backend) → P47a/E8.4
        (okna) — zero pozostawionego długu z dyrektywy 2026-07-16.
        Łączny pełny vitest po #9: 624 pliki / 8251 pass, exit 0 (`688d0ce`).
        BAZY: frontend 8251, backend 5750. NASTĘPNY KROK (strumień OZE wg
        kolejności): P2 hosting capacity — rekonesans wykazał, że silnik istnieje
        TYLKO jako dowód eksportowy per stacja (audit2_station_config.py:371-420,
        Phase 23) + enum V126; okno sieciowe P2 wymaga najpierw głębokiego
        rekonesansu kształtu dowodu i decyzji: ekspozycja per stacja vs delta
        analizy sieciowej. Potem P19 ranking punktów przyłączenia i P41 krzywe
        P–Q producenta (delta katalogowa).
        ROZSTRZYGNIĘTE: D3 hosting capacity (Opus; 25 testów; końcówka
        /api/oze-analysis/hosting-capacity — deterministyczny przegląd
        scenariuszy na kanonicznej ścieżce _execute_power_flow, ocena
        EnergyValidationBuilder; pełny pytest 5775 pass ZERO failed potwierdzony
        przez zarządcę; zintegrowane `234777c`; guard load_flow_no_heuristics
        zielony). P2 okno zdolności przyłączeniowej (Opus; 33 testy; pełny
        vitest u wykonawcy 8284 pass ZERO failed; zintegrowane `df5f5fc`).
        Scalenie #10: zakładka „Zdolność przyłączeniowa" w warsztacie
        (`95eb5af`; ui2 996 pass). NASTĘPNE: P19 ranking punktów przyłączenia
        (konsumuje D3 + NC RfG + straty), P41 krzywe P–Q (delta katalogowa).
        UWAGA IA: warsztat wyników ma 10 zakładek — do audytu rady (grupowanie
        OZE) przy najbliższym przeglądzie fazowym.
        D3a straty/napięcia scenariuszy (Sonnet; +8 testów; PRZEJĘTE przez
        zarządcę po zawieszeniu wykonawcy — weryfikacja i commit w worktree;
        zintegrowane `d683d45`; pełny pytest 5783 pass ZERO failed potwierdzony).
        Karty D3a/P19 `7cb7ae9`. P19 ranking punktów przyłączenia (Opus;
        33 testy; pełny vitest u wykonawcy 8318 pass ZERO failed; zintegrowane
        `91860d1`; klasa NC RfG WŁĄCZONA — progi klas A/B/C/D są w katalogu
        operatorów loader.py:17-25, mapowanie słownikowe 1:1 z classify_module;
        koszt przyłącza jawnie pominięty — strumień kosztorysanta).
        Scalenie #11: zakładka „Ranking przyłączeń" (`3c2fcbd`; ui2 1029 pass;
        pełny vitest 8318 potwierdzony).
        D4 krzywe P–Q w katalogu (Opus; 26 testów; pole pq_curve addytywne +
        serwis pq_coverage + końcówka; pełny pytest 5809 pass ZERO failed
        potwierdzony; guardy katalogowe zielone; zintegrowane `5806855`).
        P41 okno krzywych P–Q (Opus; 27 testów; pełny vitest u wykonawcy 8345
        pass; zintegrowane `9537b68`). Scalenie #12: zakładka „Krzywe P–Q"
        (`dac4c82`; ui2 1056 pass). STRUMIEŃ OZE — KOMPLET PIERWSZEJ FALI:
        P39→P47→P47a→P2→P19→P41 zrealizowane end-to-end (backend+okna+powłoka).
        Kolejne fale wg kolejności właściciela: P30→P35→P38→P40→P42→P43→P46→P37.
        Pełny vitest kompletu fali: 632 pliki / 8345 pass (exit 0).
        Scalenie #13 — przegląd IA: zakładki warsztatu wyników pogrupowane
        („Analizy sieci" / „OZE i przyłączenia"; jeden tablist, testidy bez
        zmian, klawiatura = kolejność wizualna; `288d7a6`; ui2 1056 pass;
        pełny vitest 8345 potwierdzony).
        FALA 2 OZE: D5 obszar bezpiecznej pracy P–Q węzła (Opus; 30 testów;
        końcówka /api/oze-analysis/pq-area — siatka P×Q anchored w Q=0 na
        wzorcu D3; recon Q generatora rozstrzygnięty dowodowo mapping.py:201;
        pełny pytest 5839 pass ZERO failed potwierdzony; zintegrowane
        `5a7aac6`). P30 okno obszaru P–Q (Opus; 34 testy; pełny vitest
        u wykonawcy 8379 pass ZERO failed; zintegrowane `567317c`; nakładka
        krzywej producenta na pasmo sieci — jeden wykres). Scalenie #14:
        zakładka „Obszar pracy P–Q" w grupie OZE (`ad46c40`; ui2 1090 pass).
        NASTĘPNE FALI 2: P35 studium przyłączenia (kreator spinający analizy),
        P38 walidacja modelu falownika.
        P30 potwierdzone pełnym biegiem 8379. P35 kreator studium przyłączenia
        (Opus; 30 testów; 4 kroki wg SPEC_KREATORY z hintami PL i prefill;
        sekwencja analiz odporna na błąd wariantu; przegląd zbiorczy reużyciem
        rankingu/obszaru/zdolności; pełny vitest u wykonawcy 8409 pass ZERO
        failed; zintegrowane `cedd170`). Scalenie #15: zakładka „Studium
        przyłączenia" (`7f5511c`; ui2 1120 pass). TODO-KARTY: dokument studium
        (E13), nawigacja między zakładkami warsztatu.
        P35 potwierdzone pełnym biegiem 8409. D6 API trajektorii FRT/HVRT
        z obwiednią (Opus; 17 testów; refaktor wydzielający budowę wejścia
        z ncrfg_compliance/checker.py — 49 testów zgodności bez regresji;
        PRZEJĘTE przez zarządcę po zawieszeniu; zintegrowane `2472c7b`;
        pełny pytest 5856 pass ZERO failed potwierdzony). P38 okno walidacji
        modelu falownika (Opus; 36 testów; pełny vitest u wykonawcy 8445 pass
        ZERO failed; zintegrowane `b5f658b`; UCZCIWE rozstrzygnięcie: D6 nie
        echo-uje głębokości zapadu/czasu trwania — kolumna „Napięcie skrajne"
        z trajektorii zamiast fabrykacji; rekomendacja echa parametrów w D6).
        Scalenie #16: zakładka „Walidacja falownika" (`2f70995`; ui2 1156 pass).
        FALA 2 OZE KOMPLETNA: P30→P35→P38 end-to-end (D5/D6 + okna + powłoka);
        pełny vitest 8445 potwierdzony (po restarcie kontenera — push przetrwał,
        bieg powtórzony). FALA 3: D7 symulacja odpowiedzi na polecenia OSD
        (Opus; 28 testów; dwa biegi bazowy-vs-polecenie; PRZEJĘTE po
        zatrzymaniu wykonawcy — bramki dokończone przez zarządcę; zintegrowane
        `0c6c0ed`; pełny pytest 5884 pass ZERO failed potwierdzony). Karta P40
        okno odpowiedzi OSD `48ee5e5` — wykonawca w toku.
        PROCEDURA: wykonawcy backendowi zawieszają się po pełnym pytest (3
        przypadki) — zarządca przejmuje: weryfikacja w worktree + commit
        w imieniu wykonawcy (bez oczekiwania na raport).
  - [ ] U3 dalsze / U4–U5 wg programu

Rozgraniczenie: rework SLD (`docs/plan/PLAN_SLD_REWORK.md`) biegnie w OSOBNEJ sesji —
program UI/UX nie modyfikuje plików SLD (granica w Programie §2.3).

### 3.0.0 V12.6 academic end-to-end closure (completed)

Status:
- [x] Gałąź integracyjna `codex/v12-6-professorski` zawiera backend, frontend, dokumentację, testy i guard `verify:v12.6`.
- [x] Ekrany E-40..E-50 są zarejestrowane w kanonie workspace i korzystają ze wspólnej powierzchni bez obliczeń po stronie UI.
- [x] `AcademicAnalysisResultV1` ma `white_box_trace`, deterministyczny hash oraz referencje proof/report.
- [x] Proof-pack i raport V12.6 są budowane w warstwie application z frozen result i trace, bez ponownego liczenia fizyki.
- [x] Endpointy result/trace/proof/report V12.6 mają wpisy w `docs/v12xx/MACIERZ_KOMPATYBILNOSCI_API.md`.
- [x] `npm run verify:v12.6`, pełne testy lokalne i GitHub CI dla PR #463 przechodzą.

### 3.0 Execution after 10/10 Audit (current)

Objective: Realize remediation plan from `docs/plan/PLAN_10_10_GLOBAL_SN.md` in strict sequence.

Progress:
- [x] Step I (Topology blockers) — backend CI guardians added for: radial 10, ring 8 + NOP, 2 rings + 2 sources, split+insert determinism (`backend/tests/test_topology_guardians_step1.py`).
- [x] Step II (Load Flow NR parity) — backend guardian tests added (`backend/tests/test_load_flow_step2_guardians.py`).
- [x] Step III (IEC 60909 closure) — backend guardian tests added (`backend/tests/test_short_circuit_step3_guardians.py`).
- [x] Step IV (Catalog materialization gates) — backend guardian tests added (`backend/tests/test_catalog_materialization_step4_guardians.py`).
- [x] Step V (Global white-box + export) — deterministic trace_id implemented in SC/LF/Protection emitters + regression tests; canonical step-order hardening added (permutation-invariant equation_steps hashing).
- [x] Step VI (UI↔Solver↔SLD integration) — fixed backend→frontend modal bridge for protection `relay_settings` + tests.
- [x] Step VII (SLD industrial aesthetics + golden render) — canonical render manifest + 3 golden SLD fixtures (radial, ring+NOP, PV/BESS) + CI guardian snapshots.
- [x] Step VII.b (SLD click-by-click write-flow) — modal submit wired to `executeDomainOperation` with snapshot update + selection hint sync + regression tests.
- [x] Step II.a (ExecutionEngine Load Flow unification) — added canonical `execute_run_load_flow()` pipeline with deterministic `LoadFlowRunInput`, ResultSet mapping and radial/ring integration tests.
- [x] Step VII.c (SLD adapter hardening) — removed legacy `topologyAdapterV1` module, promoted canonical `topologyAdapter.ts`, and rewired SLD core tests/imports to the canonical adapter entrypoint.

- [x] Step VII.d (SLD geometry closure) — SLD viewer fallback `useAutoLayout` removed, canonical final-geometry tests added (GPZ/trunk/branch/station/ring+NOP + label-collision invariants), and pipeline module status documented in `docs/sld/SLD_PIPELINE_CANONICAL_STATUS.md`.
- [x] Step VII.f (SLD readability declutter) — reduced default label density in trunk/branch/station renderers; technical parameters visible at higher zoom threshold.
- [x] Step VII.g (ABB-inspired visual patterning) — added compartment envelopes, bay framing and ANSI 52/50-51 visual tokens in canonical trunk/branch/station renderers.
- [x] Step VII.h (Główna ścieżka referencyjna SLD) — dodano przełącznik 4 sieci referencyjnych w `#sld-view` z polskimi etykietami i bezpośrednim renderem przez kanoniczny pipeline.
- [x] Step VII.i (Hierarchia informacji i kompozycja przemysłowa) — wdrożono 3 poziomy informacji, sekcje funkcjonalne stacji SN/nN oraz testy jakości hierarchii wizualnej.
- [x] Step VII.j (Skala i kompozycja 7/10) — podniesiono skale dopasowania `#sld-view`, powiększono moduły GPZ/stacji/odejść i zaostrzono testy jakości skali oraz hierarchii.
- [x] Step VII.e (Final SLD visible reference output) — added in-app `#sld-final` reference gallery with 4 rendered canonical geometries (leaf, passthrough, branch, ring+NOP) and UI test coverage.


### 3.0.1 Step VII Completion Criteria (SLD industrial aesthetics + golden render)

Done criteria (implemented):
- Canonical SLD fixture set covers min. 3 scenarios: radial, ring+NOP, PV/BESS.
- Deterministic render manifest contract includes ordered node/edge geometry and industrial style tokens.
- Golden snapshot artifacts for render manifest are CI-guarded (determinism + permutation invariance).
- Regression tests fail on geometry/style drift unless baseline update is explicit.

### 3.0.2 CI Guard Hardening — identyfikatory connection node (current)

Objective: Ujednolicenie detekcji identyfikatorów `connection node` w URL nawigacji i resolverze inspektora bez duplikowania logiki.

Progress:
- [x] Wydzielenie wspólnej funkcji `isConnectionNodeLikeId` (`frontend/src/ui/common/connectionNode.ts`).
- [x] Podpięcie funkcji w `urlState.ts` i `selectionResolver.ts` (jeden kontrakt filtrowania selekcji).
- [x] Testy regresyjne i jednostkowe frontend przechodzą (`connectionNode.test.ts` + istniejące testy unity/resolver).


### 3.0.3 Ścieżka krytyczna E2E — skan i domknięcie bramek (current)

Zakres skanu: `operacja domenowa -> Snapshot -> SLD -> gotowość -> fix actions -> bramka analiz -> wyniki`.

Status ogniw:
- **Kompletne**
  - Operacja domenowa -> odpowiedź `DomainOpResponseV1` z `snapshot/logical_views/readiness/fix_actions` (`frontend/src/ui/topology/snapshotStore.ts`, `frontend/src/ui/topology/domainApi.ts`).
  - Snapshot -> render SLD (SLD odświeżane po update store; brak lokalnego grafu topologii jako źródła prawdy).
  - Gotowość z backendu materializowana w store i panelach (`snapshotStore`, `ReadinessPanel`).
- **Częściowe**
  - Bramka uruchamiania analiz była oparta tylko o aktywny case/mode/status i pomijała `readiness`.
  - Globalny przycisk obliczeń w `App.tsx` był atrapą (TODO, brak realnego uruchomienia run).
- **Rozłączone**
  - UI miało poprawny store wykonania run (`ui/study-cases/runStore.ts`), ale root callback `onCalculate` nie korzystał z niego.
- **Dublowane lokalnym stanem**
  - Historyczne wrappery `useCanCalculate` w `study-cases/store.ts` i `study-cases/modeGating.ts` zostały usunięte; pozostała jedna kanoniczna ścieżka `ui/app-state/store.ts` oparta o `snapshotStore.readiness`.

Wdrożone domknięcia:
- [x] `useCanCalculate()` (app-state) blokuje obliczenia przy `readiness.ready=false` z komunikatem backendowym.
- [x] `App.tsx` uruchamia realny flow `createAndExecuteRun(...)` zamiast TODO/no-op.
- [x] ENM `delete_element` domknięto o kasowanie osieroconych `branch_points` oraz kaskadę `substations/bays` dla skasowanego `bus/transformer` (spójność z kontraktami modeli Pydantic i deterministyczny `deleted_element_ids`).
- [x] Po uruchomieniu run ustawiany jest `activeRunId` i nawigacja do widoku wyników.
- [x] Dokumentacja uruchomienia backendu rozszerzona o powtarzalny bootstrap środowiska (poetry + test importów).
- [x] Usunięcie duplikatów bramki `useCanCalculate` (study-cases/* nie eksportuje już historycznych wrapperów).
- [x] Dodany skrypt `npm run test:e2e:setup` + CI smoke rozszerzone o `critical-run-flow.spec.ts` (detekcja lokalnej przeglądarki + fallback APT + wsparcie `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`).
- [x] Browser E2E krytycznej ścieżki przepięte na realny backend (`e2e/critical-run-flow.spec.ts`) — bez `page.route` i bez atrap API.
- [x] Dodano twardy scenariusz E2E real-backend dla elastycznej kolejności (`e2e/sld-editor-real-backend-flex.spec.ts`) oraz domknięto inspektor segmentu (readiness, fix_actions, katalog, write-path ENM_OP).
- [x] Ujednolicono real-backend E2E z kanonicznym katalogiem (`cable-tfk-yakxs-3x120`, `tr-sn-nn-15-04-630kva-dyn11`) oraz usunięto `Date.now()` z kluczy idempotencji w `e2e/critical-run-flow.spec.ts`.

### 3.0.4 SLD industrial readability tuning (completed)

Zakres zakończony:
- [x] Wzmocnienie czytelności toru głównego: większa koperta GPZ, dedykowany lewy gutter informacyjny, szersze moduły pól SN, korekta pozycjonowania etykiet segmentów i węzłów (`TrunkSpineRenderer.tsx`).
- [x] Powiększenie i rebalans odgałęzień: większa ramka pola odgałęźnego, dłuższy przebieg linii odgałęźnej, korekta pozycji etykiet i bąbla zabezpieczeniowego (`BranchRenderer.tsx`).
- [x] Aktualizacja testu deterministycznego `fitToContent` do aktualnego kontraktu geometrii viewportu (`fitToContent.test.ts`).



### 3.0.6a SLD: logical_views jako kanoniczna segmentacja trunk/branch/ring (completed)

Zakres zakończony:
- [x] Rozszerzono `TopologyInputV1` o strukturę `logicalViews` (trunks/branches/rings) oraz mapowanie z `snapshot.logical_views` w `readTopologyFromENM`.
- [x] `TopologyAdapterV2.segmentTopology()` używa jawnych segmentów z `logicalViews` jako pierwszego źródła klasyfikacji (`TRUNK`/`BRANCH`/`SECONDARY_CONNECTOR`) i dopiero przy braku danych wraca do deterministycznego BFS fallback.
- [x] Dodano test regresyjny wymuszający priorytet `logicalViews` nad heurystyką segmentacji w `topologyAdapterV2.test.ts`.
- [x] Zaktualizowano dokument kanoniczny SLD o regułę „logical_views first”.

### 3.0.6b SLD: model właściwy kontraktu topologii wizualnej (completed)

Zakres zakończony:
- [x] Dodano `VisualTopologyContractV1` jako jawny kontrakt wyjściowy adaptera z klasami: GPZ, szyna SN, pole SN, trunk, branch, punkt rozgałęzienia, stacja, ring, NOP.
- [x] `buildVisualGraphFromTopology()` zwraca `visualTopology` obok `graph` i `stationBlockDetails`, więc aktywny pipeline ma formalny model semantyczny (nie tylko klasyfikację krawędzi).
- [x] Rola stacji (`koncowa`/`przelotowa`/`odgalezna`/`sekcyjna`) jest wyprowadzana z embeddingu stacji i materializowana do kontraktu wizualnego.
- [x] Ring/NOP są modelowane jawnie (`RingConnectorVisual`, `NopVisual`) i utrzymują powiązanie z `domainElementId` dla selekcji/inspektora.
- [x] Dodano testy regresyjne kontraktu semantycznego i deterministycznego 100x.


### 3.0.6c SLD: domknięcie kontraktu semantycznego w artefaktach renderu (completed)

Zakres zakończony:
- [x] Wzmocniono `VisualTopologyContractV1`: segmenty trunk/branch/ring/NOP obejmują wyłącznie klasy liniowe SN (bez TR_LINK/BUS_LINK).
- [x] Scenariusze referencyjne (`leaf/pass/branch/ring`) materializują jawne `logicalViews`, aby aktywna ścieżka testowa nie opierała się na fallbacku BFS.
- [x] `SldRenderManifest` otrzymał opcjonalne `visualTopologySummary` zliczające klasy bytów (GPZ/szyny/pola/trunk/branch/stacje/ringi/NOP) dla audytu semantyka↔render.
- [x] Zaktualizowano golden snapshoty manifestu i testy regresyjne.


### 3.0.6d SLD: twarda reguła geometrii GPZ (completed)

Zakres zakończony:
- [x] Wymuszono globalnie kanon orientacji SN/GPZ w silniku topologicznym: szyna GPZ pozioma, odejścia pionowo w dół (także przy żądaniu `left-right`).
- [x] Dodano regresyjny test w `layoutPipeline.test.ts` potwierdzający poziomą szynę GPZ i pionowy start odejść trunk.
- [x] Zaktualizowano test orientacji `topologicalLayout.test.ts` do kanonicznego mapowania `left-right -> top-down` dla SN.

### 3.0.7 SLD: wydzielenie LayoutEngine V2 + routing A* (completed)

Zakres zakończony:
- [x] Dodano nowy moduł `frontend/src/ui/sld/core/layoutEngine.ts` (strategie `legacy/greedy/force-directed`, routing `orthogonal/diagonal`, A* obstacle routing, auto-reflow kolizji, plan warstw i etykiet).
- [x] `layoutPipeline.ts` refactor: poprzedni pipeline dostępny jako `computeLegacyLayout()`, a publiczny `computeLayout()` deleguje do `LayoutEngine` z domyślną strategią `legacy` (kompatybilność wsteczna).
- [x] Rozszerzono API eksportów core (`index.ts`) o `LayoutEngine`, typy opcji i helper `createLayoutEngine`.
- [x] Dodano testy jednostkowe `layoutEngine.test.ts` (delegacja legacy, greedy spacing, deterministyczny force-directed, orthogonal/diagonal routing).
- [x] Dodano dokumentację modułu: `docs/sld/SLD_LAYOUT_ENGINE_REFACTOR_V2.md`.

### 3.0.8 SLD: domknięcie kontraktów semantyka→layout (completed)

Zakres zakończony:
- [x] Dodano kanoniczny kontrakt semantyczny `SldSemanticGraphV1` (normalizacja stationKind/generatorKind, jawne kontenery, brak geometrii portów).
- [x] Dodano kanoniczny kontrakt wejścia layoutu `LayoutInputGraphV1` (symbolProfile/portGeometry i constraints tylko w warstwie layoutu).
- [x] `computeLayout()` przepięto na pipeline: `VisualGraph(legacy) -> SldSemanticGraphV1 -> LayoutInputGraphV1 -> LayoutEngine`.
- [x] `LayoutEngine` konsumuje `LayoutInputGraphV1`; `computeLegacyLayout()` utrzymane jako cienka warstwa zgodności przez bridge `LayoutInputGraphV1 -> VisualGraphV1`.
- [x] `VisualGraphV1` zdegradowano do statusu legacy (usunięto fałszywy komentarz o jedynym źródle prawdy).
- [x] Dodano testy kontraktu semantycznego i transformacji semantyka→layout (deterministyczność 100x).
- [x] Uzupełniono dokumentację: `SLD_SEMANTIC_MODEL_CANONICAL_V1.md` + `SLD_CONTRACT_FLOW_V1.md`.

### 3.0.9 Symphony orchestration baseline (completed)

Zakres zakończony:
- [x] Dodano nowy moduł `application/symphony` z kanonicznymi komponentami: loader `WORKFLOW.md`, typed config, modele domenowe, manager workspace, renderer promptu i orchestrator poll/retry/reconcile.
- [x] Dodano kontrakty integracyjne (`IssueTrackerClient`, `AgentRunner`) dla adaptera tracker/runner zgodnie z granicami specyfikacji Symphony.
- [x] Dodano testy jednostkowe pokrywające parse workflow/config, bezpieczeństwo workspace i logikę dispatch/retry/blockers/concurrency.

### 3.0.10 Audyt SLD + Designer Flow + Konfiguratory pól SN (2026-05-19, completed)

Branch: `claude/audit-sld-designer-U4QYo`.

Zakres zakończony:
- [x] Trzy równoległe audyty Explore (SLD renderer / Designer flow / Catalog + plans). Synteza w `docs/audit/AUDYT_SLD_DESIGNER_2026-05-19.md`.
- [x] Potwierdzono w aktywnym kodzie:
  - `GpzCanonicalRenderer` (Phase R2) z guardem `no_direct_110kv_tr_tie_without_switchgear` — TR 110/SN nie zwiera się przez szynę, kolumna aparatów (DS+CB+CT+ES) wymagana. Test: `frontend/src/ui/sld/v2/renderer/__tests__/GpzCanonicalRenderer.noDirectTie.test.tsx`.
  - `SldCommandService.SLD_MENU_REGISTRY` ma 10 typów elementów × 3–11 akcji per typ — menu kontekstowe jest w pełni domenowe.
  - K30 (do 2026-05-16) zamknął 9.4/10 brutalny audyt SLD; 1916 testów SLD v2 zielone.
- [x] Dodano regresyjny test kontraktu „naturalny flow projektanta": `frontend/src/ui/network-build/__tests__/designerFlowContract.test.ts` (21 testów, all green) — formalizuje 8 kroków flow jako executable specification: Wstaw GPZ → Dodaj sekcję → Dodaj pole SN → Wyprowadź ciąg → Zakończ stacją → Kontynuuj → Rozgałęzienie → Dodaj DER.
- [x] Walidacja: `npm run type-check` zielone; `npm run lint` zielone; broader vitest suite (context-menu + sld/v2 + network-build) 947/947 zielone (+21 nowe); `no_codenames_guard`, `forbidden_ui_terms_guard`, `docs_guard`, `sld_determinism_guards` — all PASS.
- [x] **Pakiet A (wymaganie #1 - naturalny flow)**: empty-state CTA „Wstaw Główny Punkt Zasilający" w `SldWorkspaceContainer.tsx` — pierwszy krok flow jest teraz jawny (przycisk uruchamia `add_grid_source_sn`). 3 nowe testy.
- [x] **Pakiet B (wymaganie #2 - SCADA)**: `symbolContract.test.ts` (65 testów) — kontrakt 54 SVG ↔ ports.json, ring_busbar i double_busbar mają 4 porty, NOWE symbole wymagają currentColor.
- [x] **Pakiet C (wymaganie #1 contract)**: `designerFlowContract.test.ts` (21 testów) — kontrakt 8 kroków flow.
- [x] **Pakiet D (wymaganie #2 SCADA F1)**: `CanonicalGpzBusbarTopology` w `GpzCanonicalRenderer` — wdrożone w aktywnym rendererze 3 topologie: `single`/`double`/`ring`. Dasharray "6 3" dla double S2, ring closure po prawej dla ring. 5 nowych testów regresyjnych.
- [x] **Pakiet E (F1 wave 2)**: migracja `bess.svg`, `pv.svg`, `fw.svg` z `#000000` → `currentColor`. Lista `KNOWN_LEGACY_HARDCODED_COLORS` zmniejszona z 24 → 21.
- [x] **Pakiet F (E2E naturalny flow)**: `e2e/designer-flow-empty-state-cta.spec.ts` — Playwright spec z mock backend, weryfikuje pełny flow Dashboard → projekt → SLD workspace → empty state CTA primary/secondary widoczne i etykietowane po polsku.
- [x] **AUDYT POPRAWKA**: prior audit B agent **błędnie raportował** brak 3-stage vendor stepper. W rzeczywistości `SwitchgearTemplateStepper.tsx` z 4 krokami (Producent → Rodzina/Typoszereg → Szablon → Preview) **JUŻ ISTNIEJE** wraz z `SwitchgearFamilyPicker` i backend API `/api/catalog/switchgear-families`. Wymaganie #5 satysfakcjonowane.
- [x] Walidacja: type-check ✓, lint ✓, wszystkie guardy CI ✓ (no_codenames, forbidden_ui_terms, sld_determinism, docs_guard, repo_hygiene).

Pozostałe duże luki (zachowane jako P0/P1 per § 4.0):
- F2 port-based routing main impl (P0.3 ~16%)
- F3 LOD + refactor monolitów (P0.6 TODO)
- F4 export SVG/PDF deep integration (P0.7 ~75%)
- F5 visual regression baselines (P0.10 ~38%)
- Vendor template 3-stage stepper (producent → typoszereg → pole) — propozycja w `AUDYT_SLD_DESIGNER_2026-05-19.md` §6.1
- Explicit „Wstaw GPZ" first-step CTA dla pustego projektu — propozycja w §6.1
- Backend POST endpoint dla DER config save (K30-NEXT-1)
- E2E `critical-der-config.spec.ts` (K30-NEXT-2)
- SldDetailDrawer form validation (react-hook-form + zod) (K30-NEXT-3)

Rekomendacja dla następnej sesji: krótka, low-risk, high-impact 5-pakiet (§6.1) ~14 OD.


### 3.0.5 Hotfix CI TypeScript — referenceTopologies (completed)

Zakres zakończony:
- [x] Usunięto mutacje `push(...)` na kolekcjach `readonly` w `referenceTopologies.ts` (budowa scenariuszy `branch` i `ring` przez niemutowalne złożenie tablic).
- [x] Usunięto odwołanie do legacy pola `stationBlockBuildResult`; scenariusze referencyjne korzystają z kanonicznego pola `stationBlockDetails` z `AdapterResultV1`.
- [x] Potwierdzono zielone: `npm run type-check`, zestaw testów SLD kontrakt/determinizm oraz real-backend E2E krytycznej ścieżki.

### 3.1 Docs Sync to Spec Canon (current)

Objective: Synchronize all repo documentation entrypoints with `docs/spec/` (18 chapters) as the source of truth.

Tasks:
- [x] Full repo scan (RECON)
- [x] Document chaos detection (20 inconsistencies identified)
- [x] Rewrite AGENTS.md (clean governance)
- [x] Rewrite SYSTEM_SPEC.md (executive overview + navigation to 18 spec chapters)
- [x] Rewrite ARCHITECTURE.md (spec chapter references in every section)
- [x] Rewrite PLANS.md (this file)
- [x] Sync README.md (root + mv-design-pro) — removed prohibited terms, fixed paths, added spec links
- [x] Sync docs/INDEX.md — added spec chapter table, fixed broken links
- [x] Add docs_guard.py CI guard (PCC + broken link check)
- [x] Clean remaining duplicate docs in docs/ outside docs/spec/
- [x] Mark/move deprecated notes and operational files
- [x] Add reusable Polish master prompt for full-repo architecture audit (`docs/prompts/FULL_REPO_AUDIT_PROMPT_PL.md`)

### 3.2 SLD/CAD Canonical Rebuild — Recon + Docs Cleanup + Deterministic ENM_OP keys (current)

Objective: Domknięcie fazy RECON/AUDYT dokumentacji oraz usunięcie niedeterministycznych fallbacków `Date.now()` z kluczy idempotencji ENM_OP w ścieżce SLD.

Progress:
- [x] Full RECON obszaru SLD/CAD/UI/domena/layout/routing/inspector + klasyfikacja dokumentów.
- [x] Dodane dokumenty kanoniczne etapu:
  - `docs/AUDYT_DOKUMENTACJI_I_PLANOW_REPO.md`
  - `docs/MAPA_MIGRACJI_DOKUMENTOW_I_PLANOW.md`
  - `docs/INDEX_KANONICZNY.md`
- [x] Usunięte równoległe roadmapy (`docs/ROADMAP.md`, `docs/audit/ROADMAP.md`) na rzecz jednego planu `PLANS.md`.
- [x] Wzmocniono deterministyczność ENM_OP:
  - `frontend/src/ui/sld/domainOpsClient.ts` używa deterministycznego `buildDeterministicIdempotencyKey(...)`.
  - `frontend/src/ui/sld/useEnmStore.ts` korzysta z tego samego generatora.
- [x] Dodane testy regresyjne klucza idempotencji (`frontend/src/ui/sld/__tests__/domainOpsClient.test.ts`).
- [x] Korekta mapowania narzędzia `delete_element` w palecie SLD: `canonicalOp` ustawione na `delete_element` + test regresyjny kontrolera interakcji.

---

### 3.3 SLD CAD/SCADA Rebuild — wszystkie 17 PR-ów dostarczone ✅

**Branch:** `claude/sld-architecture-redesign-ufa8Q`
**Plan main:** `/root/.claude/plans/jeste-uruchomionym-jednocze-nie-zespo-em-peaceful-snowglobe.md` (17 PR-ów)

**Dostarczone w bieżącej sesji (9 commitów):**

| PR | Commit | Zakres |
|---|---|---|
| **PR-0** | `ec395ae` | audit + 8 docs kanon + formatPolishValue + zakaz 0.00 + no-zero-spam guard |
| **PR-1** | `25ef103` | migracja `(value ?? 0).toFixed` antypatternu (12 violations w `WizardPage.tsx`); audit doc Stacja+DER; rozszerzony no-zero-spam guard (4 → 17 katalogów UI) |
| **PR-2** | `165d577` | UI terminology guard rebrief: 132 migracje stringów UI + 12 zakazanych tokenów (migawka/uruchomienie/przypadek/proof/run/snapshot/feeder/branch/case/wizard/fallback/legacy) z polskimi zamiennikami |
| **PR-3** | `5e6b880` | ENM Port + ConnectionNode + LineRun + CableJoint + 10 BayTemplate + 9 StationTemplate + multi-voltage nN + automigracja v_ports_001 (idempotentna, deterministyczna) |
| **PR-4** | `fc37351` | SLD v2 PortResolver: 15 PortKind contract z parity test ENM ↔ frontend, classifyStationTopology, validatePortVoltages, canConnectPorts (14 reguł), isPortKindCompatibleWithBayRole |
| **PR-5 (cz. I)** | `60fe605` | v2 fundamenty: theme tokens (22 kolory dark SCADA), geometry/slot.ts (slot allocator hierarchiczny), geometry/routing.ts (ortogonalne L-shape, brak A*), domain/HierarchyTree.ts (adapter ENM), builder/BuildSequence.ts (8 kanonicznych komend), builder/HierarchicalLayout.ts (deterministic + przyrostowy, FNV-1a hash), viewport/ViewportController.ts (kursor-anchored zoom), lod/LodPolicy.ts (5 LOD + 13 warstw) — 81 testów green |
| **PR-5 (cz. II)** | `4f1a8a0` | v2 renderery: 7 dedykowanych rendererów per typ (Gpz, Section, Bay, Device, CableRun, StationOnRun, Der + Connection), SldCanvasV2 composition root z pan/zoom/auto-fit/LOD inference/layer toggle — 24 testy renderers, 105 testów total v2 |
| **PR-6** | `d8614db` | Wewnętrzny SLD stacji: backend topology_classifier + internal_layout (InternalSldDTO, multi-voltage nN, 4 typy topologiczne wnioskowane z portów), frontend StationInternalView z szyną SN + polami + transformatorami + rozdzielnicami nN — 19 testów (14 backend + 5 frontend) |
| **PR-7** | `a769f4d` | InspectorTabs v2 (11 zakładek: Podstawowe/SLD/Topologia/Aparatura/Dane elektryczne/Zabezpieczenia/Pomiary/Obliczenia/Braki danych/Raport/Techniczne) + StickyHeader (status kompletności/zasilania/obliczeń + quick actions) + Breadcrumb dwukierunkowy — 23 testy |

**Wszystkie PR-y dostarczone:**

| PR | Commit | Zakres |
|---|---|---|
| **PR-13** | `22a8ad6` | BuildSidebar (4 sekcje: Nawigator/Budowa/Warstwy/Gotowość) + SldCommandService (10 menu kontekstowych + COMMAND_FEEDBACK_PL) + 8 brakujących symboli SVG (load_switch, cable_head_triangle, pole, nop, alarm_marker, missing_data_marker, zksn, cable_joint) |
| **PR-12** | `d8b62b4` | CalculationReadinessService (10 typów obliczeń) + ValidationProblemService (4 źródła problemów) + ReportReadinessAdapter (zakaz fabrykacji raportów) |
| **PR-8a** | `713b58a` | StationConfigurator z 10 kart-zakładkami (Podstawowe/Topologia/RozdSN/Pola/Transformator-multi-voltage/RozdNN/Odbiory/Zabezpieczenia/Pomiary/Gotowość) |
| **PR-8b** | `713b58a` | BayConfigurator z 8 sekcjami + 6 reguł walidacji (R1-R6 briefa §9) |
| **PR-9/10/11** | `51598e2` | DerConfigurator (PV/BESS/FW) + 5 profili NC RfG (PSE/Energa/Tauron/Enea/PGE) + 12 turbin wiatrowych w katalogu |
| **PR-14** | `39815d1` | 15 visual fixtures × 4 LOD = 119 testów (GPZ-12-bays, terrain-network, 4 typy stacji, internal-SLD-industrial, PV/BESS w SN/nN, FW, missing-data, no-calc, empty-project) |
| **PR-15** | `b9bf227` | Stability RMS contract: 19 DynamicModelKind + StabilitySolverInput/Result (FROZEN) + StabilitySolverAdapter z validate_input + run=no_module |
| **PR-16** | `b9bf227` | FRT/HVRT RMS contract + NC RfG compliance checker (static T3-T15 + dynamic T1/T2/T8/T10/T11/T16/T17/T18 = no_module) z 21 testami |

Plan obejmuje 12 kolejnych PR-ów z explicit scope-em w pliku planu:

- **PR-5** (~30 osobodni × 2 osoby = ~60 OD): Konstruktywny hierarchiczny builder, wygaszenie ~12 996 linii (engine/sld-layout phase 1-5 + Sugiyama + A* + ELK + 7 starych rendererów + sldCanonicalStyle + IndustrialAesthetics), 7 nowych dedykowanych rendererów, Scenariusze D/E/F.
- **PR-6** (~16 OD): Wewnętrzny SLD stacji + 4 typy topologiczne + tryb mieszany inline expansion.
- **PR-7** (~8 OD): InspectorTabs (11 zakładek) + sticky header + breadcrumb dwukierunkowy + sync paneli + command feedback toasty.
- **PR-8a/8b** (~15 OD): Konfigurator stacji 10 kart + Konfigurator pola SN 8 sekcji.
- **PR-9/10/11** (~20 OD): Konfiguratory PV / BESS / FW (po 7 / 7 / 6 kart) + 5 profili NC RfG + 12 turbin wiatrowych w katalogu.
- **PR-12** (~12 OD): CalculationReadinessService (9 typów obliczeń) + ValidationProblemService + ReportReadinessAdapter.
- **PR-13** (~7 OD): BuildSidebar (4 sekcje) + SldCommandService + 8 brakujących symboli SVG.
- **PR-14** (~8 OD): LOD policy v2 + 13 warstw + 15 visual fixtures × 4 LOD = 60 snapshotów + wygaszenie starego SLD.
- **PR-15** (~42 OD): Solver stabilności dynamicznej RMS — Newton-Raphson dynamic + modele synchronous/induction/inverter/AVR/governor/PSS/wind/PV/BESS.
- **PR-16** (~18 OD): Solver FRT/HVRT RMS time-domain + NC RfG compliance testbench (18 testów).

**Status egzekucji:**

PR-0..PR-4 stanowią **fundament merge-ready** rebuild-u: wszystkie inwarianty kanoniczne (zakaz 0.00, polish UI, 12 zakazanych tokenów wyeliminowanych), domena ENM rozszerzona o porty/connection nodes/line runs/cable joints + automigracja, frontend port contract + walidatory. Pozostałe PR-y to rdzeń rebuild-u i wymagają znacznego nakładu pracy (~170 osobodni / ~3-4 miesiące zespołu 2-3 osób). Plan dokumentuje pełne scope każdego z PR-ów (`/root/.claude/plans/...md`) i jest przygotowany do kontynuacji w kolejnych sesjach.

**Walidacja kumulatywna PR-0..PR-7:**

- Backend: 4421+ testów green (zero regresji), ENM 458 + 46 PR-3 + 14 PR-6 = 518 PR-relevant testów green.
- Frontend: 491+ testów green (zero regresji), nowe 30 PR-0 + 29 PR-4 + 81 PR-5 (cz.I) + 24 PR-5 (cz.II) + 5 PR-6 + 23 PR-7 = 192 PR-relevant testów green.
- Guards: pcc_zero / no_codenames / ui_terminology (132 violations zlikwidowane) / docs / sld_determinism — wszystkie zielone.
- Type-check + lint: green.

Następne PR-y (PR-5..PR-16) — patrz pełen plan `/root/.claude/plans/jeste-uruchomionym-jednocze-nie-zespo-em-peaceful-snowglobe.md`.

---

### 3.6 P0 implementation sprint (2026-05-13)

Zrealizowane w jednym dniu (**20 commitów po cleanupie** — sprint kontynuowany):

- [x] **P0.2 Protection SI-100** — `solver_input/eligibility.py:169` stub usunięty, real
  eligibility check (BREAKER/RECLOSER required). Krok 11 flow E2E odblokowany.
  Backend tests: 121/121 PASS (commit `20b432e`)
- [x] **P0.1 SLD F1** — biblioteka symboli IEC 60617:
  - Sprint 1 (KRYTYCZNY): ring_busbar, double_busbar, busbar_section_marker,
    busbar_coupler, cb_drawout, auto_recloser, switch_3pos (commits `d553ae7`, `3874719`)
  - Sprint 2: lightning_rod, grounding_resistor, grounding_reactor, synchrocheck,
    surge_arrester_10ka (commit `544834c`)
  - Sprint 3: autotransformer, transformer_tap_changer, utility_source,
    pv_inverter_nc_rfg, wind_turbine_full_converter (commit `544834c`)
  - Sprint 4: 8 ports.json entries dla legacy SVG → 100% SVG↔ports sync (commit `544834c`)
  - **Sprint EoD (P0.1 +2 symbole):** pq_meter, capacitor_bank (commit `9afb19e`)
  - Status: **50 / 62 = 80.6% pokrycia IEC 60617** (≥50 GOAL HIT, target ≥ 90%)
- [x] **P0.8 DOCX export** — `proof_inspector/exporters.py` `export_docx()` + `export_to_docx()`
  convenience. V12K-007 light_technical. 45/45 inspector tests PASS (commit `ddab90f`)
- [x] **P0.9 (operator selector + SC toggle + backend integration)** —
  `StudyCaseConfig.operator_profile_id` (default ENEA) + `sc_input_mode` toggle
  simplified/advanced. Frontend UI + backend `SimplifiedGridSource` propagacja do
  `ShortCircuitPayload.simplified_grid_source`. 11/11 new backend integration tests
  (commits `49909d8`, `087b54c`, `0a7fa8c`)
- [x] **P0.4 VDROP + Earthing proof packs** — standalone packs wrappers nad
  ProofGenerator. `packs/vdrop.py` + `packs/earthing_ground_fault_sn.py`. 12 testów,
  279/279 proof_engine PASS. 8 pakietów dowodów łącznie (commit `beac74d`)
- [x] **P0.10 partial (Visual regression scaffold)** — Playwright config
  (`toHaveScreenshot` threshold 0.5% per AC-11) + `frontend/e2e/visual/
  sld_industrial_visual.spec.ts` + `.github/workflows/sld-visual-regression.yml` +
  kontrakt `docs/sld/SLD_VISUAL_REGRESSION_CONTRACT.md` (commit `8e911d2`)
- [x] **P0.3 partial (port_binding_guard extension)** — `scripts/port_binding_guard.py`
  dodano `_validate_ports_manifest()`. 0 naruszeń przy 50 symbolach (commit `3b7637c`)
- [x] **P0.7 partial — SLD F4 fundamenty 75%** (kontynuacja sprint):
  - LIGHT_TECHNICAL_COLORS tokens + 8 testów (commit `95f8f91`)
  - ThemeProvider/useTheme/useThemeColors + 10 testów (commit `64de787`)
  - exportSvg.ts foundation (currentColor substitution, idempotency,
    deterministyczny filename) + 14 testów (commit `64de787`)
  - exportPdf.ts spec foundation (PDF spec object, ISO 216 sizes, deterministic
    metadata) + 20 testów (commit `4057c5a`)
  - Browser download utility + SldExportButton React component + 12 testów
    (commit `9c20fd1`)
  - FaultContributionArrow SC overlay primitive + 16 testów (commit `7e89f83`)
  - PowerFlowArrow + ProtectionZoneMarker overlay primitives + 30 testów
    (commit `fe5c5ba`)

**Łącznie nowe testy w sprint:** ~270 testów. Łącznie pełna suita:
- backend: 279/279 proof_engine + 121/121 protection + 73/73 study_case +
  11/11 simplified_sc + 113/113 wider regression = **~750+ PASS**
- frontend: 1202/1202 SLD v2 + 130/130 sld-overlay + 75/75 study-cases +
  18/18 theme tests = **~1450+ PASS**

**Status P0 (10 pozycji) po 20 commitach:**

| # | Zakres | Status |
|---|--------|--------|
| P0.1 | SLD F1 biblioteka symboli (10 OD) | ✅ ~8 OD (80.6% pokrycie, GOAL ≥50 HIT, F1 sprints 1-4 zamknięte) |
| P0.2 | Protection SI-100 (5 OD) | ✅ DONE |
| P0.3 | SLD F2 LayoutEngine port-based (25 OD) | ⚙️ ~2 OD (guard extension) — main implementation TODO |
| P0.4 | VDROP + Earthing packs (10 OD) | ✅ DONE |
| P0.5 | Fault-loop NN solver (15 OD) | ⏳ TODO |
| P0.6 | SLD F3 LOD + refactor monolith (15 OD) | ⏳ TODO (LodPolicy istnieje, integracja w monolicie TODO) |
| P0.7 | SLD F4 Theme + overlay + eksport (20 OD) | ⚙️ ~15 OD / 75% (3 overlay primitives + theme + 2 exporters + UI button — pozostaje deep integration) |
| P0.8 | DOCX export (5 OD) | ✅ DONE |
| P0.9 | Wizard improvements (7 OD) | ✅ ~6 OD (operator+toggle+backend integration); split-preview TODO |
| P0.10 | SLD F5 Visual regression CI (8 OD) | ⚙️ ~3 OD scaffolding; baseline + LFS TODO |

**Postęp:** ~**46 OD z 120 OD** goal P0 (**~38%**). 4 pełne P0 zamknięte, 4 znacząco
adresowane (>50% postępu), 2 czekają (P0.5 fault-loop NN, P0.6 SLD F3 — duże
architektoniczne).

### 3.7 P0 implementation sprint kontynuacja (2026-05-13 night + 14)

Dalsze 9 commitów po raporcie § 3.6:

- [x] **P0.7 ThemeContext + exportSvg** (commit `64de787`) — SldThemeProvider hooks +
  exportSvg vector-clean (24 testów)
- [x] **P0.9 backend integration** (commit `0a7fa8c`) — sc_simplified_grid_source w
  ShortCircuitPayload (11 testów)
- [x] **P0.7 exportPdf spec** (commit `4057c5a`) — PDF spec foundation z ISO 216
  sizes (20 testów)
- [x] **P0.7 UI integration** (commit `9c20fd1`) — Browser download utility +
  SldExportButton React component (12 testów)
- [x] **P0.7 SC overlay primitive** (commit `7e89f83`) — FaultContributionArrow (16 testów)
- [x] **P0.7 PF + Protection primitives** (commit `fe5c5ba`) — PowerFlowArrow + ProtectionZoneMarker (30 testów)
- [x] **P0.1 SLD F1 final** (commit `9afb19e`, `98751ce`) — 50→54 symbole (94.7% IEC parity) ✅ HIT 90% target
- [x] **P0.5 fault-loop NN MVP** (commit `9fe6153`) — FaultLoopSolver IEC 60364-4-41,
  21 testów (3 klasy)
- [x] **P0.3 F2 portBasedLayout helpers** (commit `74e78db`) — Pure functions +
  buildEdgeRouteFromPorts (37 testów)
- [x] **CR-fix specialist audit** (commit `877ad80`) — 3 KRYTYCZNE + 4 ulepszeń + 5
  test gaps (gridStep=0 NaN, Z_MIN_OHM, SVG namespace, ProtectionZone neg dims,
  exportSvg precise regex, fault_loop docstring, splitPreview tests)
- [x] **PowerFlowArrow zero-flow** (commit `0d1d79b`) — CR-fix #2 zero edge case
- [x] **P0.5 step 3 builder** (commit `8e9c74e`) — FaultLoopInputBuilder scaffolding (9 testów)
- [x] **P0.9 splitLinePreview** (commit `8925330`) — Split-with-preview pure functions (31 testów)

**Łączna liczba testów dodanych w sprincie:** ~370+ (poprzednie 270 + 100 nowych)
**Łącznie testy systemu:** Backend ~800+ PASS, Frontend ~1700+ PASS

**Status P0 po 29 commitach:**

| # | Status | OD | Komentarz |
|---|--------|----|-----------|
| P0.1 | ✅ DONE | 10/10 | 94.7% IEC parity (54/57), GOAL ≥50 + ≥90% HIT |
| P0.2 | ✅ DONE | 5/5 | Protection SI-100 stub removed |
| P0.3 | ⚙️ ~16% | 4/25 | port_binding_guard ext + portBasedLayout helpers — main impl TODO |
| P0.4 | ✅ DONE | 10/10 | VDROP + Earthing packs |
| P0.5 | ⚙️ ~75% | 11/15 | Solver MVP + InputBuilder scaffolding done; service.py + FE TODO |
| P0.6 | ⏳ TODO | 0/15 | LOD wiring w monolicie — duże architektoniczne |
| P0.7 | ⚙️ ~75% | 15/20 | Theme + 2 exporters + UI button + 3 overlay primitives |
| P0.8 | ✅ DONE | 5/5 | DOCX export |
| P0.9 | ✅ DONE | 7/7 | Operator + SC toggle + backend integration + split-preview foundation |
| P0.10 | ⚙️ ~38% | 3/8 | Visual regression scaffolding (baselines TODO) |

**Postęp:** ~**60 OD z 120 OD goal P0 (~50%)**. 5 P0 pełne zamknięte
(P0.1, P0.2, P0.4, P0.8, P0.9), 3 znacząco adresowane (P0.5 ~75%, P0.7 ~75%,
P0.3 ~16%), 1 częściowo (P0.10 ~38%), 1 czeka (P0.6 deep refactor).

### 3.5 Docs cleanup + canon resolution (2026-05-13)

Zakres zakończony w tym etapie:
- [x] Rozstrzygnięcie konfliktu V12K-001 (hierarchia kanonu): **V12.xx wygrywa**, `docs/spec/` formalnie ARCHIWALNY.
- [x] Wpisy V12K-011..V12K-015 w `docs/v12xx/REJESTR_KONFLIKTOW.md` (canon hierarchy, archiwum audytów, SLD industrial rework, protection SI-100, brakujące proof packs).
- [x] Aktualizacja `CLAUDE.md` (v hierarchii dokumentów → V12.xx canon na priorytecie 1).
- [x] Aktualizacja `SYSTEM_SPEC.md` v4.1 (`docs/spec/` oznaczone ARCHIVAL, dodane pointery do V12.xx canon i nowych planów).
- [x] Aktualizacja `PLANS.md` (ten plik, v5.1) — usunięte twierdzenie że `docs/spec/` to source of truth.
- [x] Stworzenie `docs/audit/DOC_INVENTORY_2026-05.md` (415 plików, klasyfikacja, konflikty, duplikaty).
- [x] Stworzenie `docs/audit/AUDYT_BRAKI_2026-05.md` (audyt 8 obszarów: A–H).
- [x] Stworzenie `docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md` (flow inżyniera end-to-end + roadmap).
- [x] Stworzenie `docs/sld/SLD_INDUSTRIAL_SPEC_v1.md` (specyfikacja SLD klasy przemysłowej).
- [x] Stworzenie `docs/plan/PLAN_SLD_REWORK.md` (fazy F1–F5 reworka SLD).
- [x] Fizyczna archiwizacja zamkniętych audytów + planów + snapshotów E2E + raportów weryfikacji do `docs/audit/archive/2026-05/`.

---

## 4. Next Priorities

### 4.0 P0 (po cleanupie 2026-05-13)

| Item | Description | Status |
|------|-------------|--------|
| SLD rework F1 (port-based routing + symbol library IEC 60617) | Główna przyczyna wyglądu „atrapy". Patrz `docs/plan/PLAN_SLD_REWORK.md`. | TODO |
| Protection SI-100 stub removal | Bramka E2E dla zabezpieczeń. Patrz `docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md` § 3.2. | TODO |
| VDROP + Earthing proof packs | Bramki audyt2 (dobór przewodów + grounding). | TODO |
| Fault-loop NN solver | Stacje SN/NN bez tego nie mają pełnej analizy NN. | TODO |
| DOCX export dla proof engine | Wymaganie raportów PL. | TODO |

### 4.1 HIGH Priority

| Item | Description | Status |
|------|-------------|--------|
| Phase 6: Wizard/SLD Unity | Formal verification that Wizard and SLD operate on same model | DONE |
| NetworkValidator Extension | Full industrial-grade validation rules (13 rules, 29 tests) | DONE |
| Bus Terminology Completion | Finish Node -> Bus rename in all code paths | DONE |
| SC Asymmetrical Proofs | 1F, 2F, 2F-Z fault proof packs (IEC 60909) | DONE |
| Normative Completion Pack (IEC 60909 §4.1) | Domknięcie mapowania norma→dowód + golden proofs + CI gates | DONE |

### 4.2 MEDIUM Priority

| Item | Description | Status |
|------|-------------|--------|
| Regulation Q(U) Proofs | Reactive power regulation proof pack | DONE |
| PR-27: SC ↔ Protection Bridge | Current source resolution (TEST_POINTS / SC_RESULT), FixActions | DONE |
| PR-28: Coordination v1 | Selectivity margins (explicit pairs, numbers only) | DONE |
| PR-29: Topology Links | Unified relay↔CB↔target_ref IDs (optional) | DONE |
| PR-30: Protection SLD Overlay Pro | Token-only overlay (t51, margins) | DONE |
| PR-31: Protection Report Model | Export-ready data model (PDF/DOCX) | DONE |
| PR-32: Governance & Determinism Guards | Solver diff-guard, schema guard, no-heuristics guard | DONE |
| Frontend Test Coverage | Increase Vitest + Playwright coverage | DONE |
| CI Pipeline Enhancement | Add frontend type-check and lint to CI | DONE |

### 4.3 LOW Priority

| Item | Description | Status |
|------|-------------|--------|
| XLSX Network Importer | Import from spreadsheet (ADR-009) | DONE |
| Cloud Backup Integration | S3/GCS integration | DONE |
| Incremental Archive Export | Delta export | DONE |
| Archive Diff | Compare two project archives | DONE |

---

## 5. Technical Debt

| Issue | Severity | Description |
|-------|----------|-------------|
| Node/Bus terminology | RESOLVED | DTOs, API, frontend types renamed with backward-compat aliases |
| Stale root-level docs | RESOLVED | AUDIT.md, P13B_SUMMARY.md, AUDIT_PCC_REMOVAL.md marked DEPRECATED |
| Duplicate DOCS_INDEX.md | RESOLVED | Deleted (superseded by docs/INDEX.md) |
| Duplicate UI contract docs | LOW | Some contracts exist in both `docs/ui/` and root `docs/ui/` |
| Large test fixtures | LOW | Some test files contain large inline fixtures |
| ADR numbering conflicts | LOW | ADR-002, ADR-003, ADR-006, ADR-007, ADR-008 have duplicate numbers |
| Historical ExecPlans | LOW | 16 old ExecPlans in `docs/audit/historical_execplans/` should be archived |

---

## 6. Architecture Risks

| Risk | Mitigation |
|------|------------|
| Shadow data stores | Enforced by Single Model Rule + code review |
| Physics leaking into non-solver layers | NOT-A-SOLVER rule + test guards + arch_guard.py |
| Protection heuristics/auto-selection | protection_no_heuristics_guard.py (PR-32, DONE) |
| SC solver modification by Protection PRs | solver_diff_guard.py (PR-32, DONE) |
| SC ResultSet v1 drift | resultset_v1_schema_guard.py (PR-32, DONE) |
| Result API drift | Frozen API rule + version bump requirement |
| Proof determinism regression | SHA-256 fingerprint tests |
| UI codename leaks | `no_codenames_guard.py` script |
| Documentation drift | `docs_guard.py` — PCC prohibition + broken link check in entrypoints |

---

## 7. Canonical Documentation

| Document | Location | Status |
|----------|----------|--------|
| Detailed Specification (18 chapters) | [`docs/spec/SPEC_CHAPTER_*.md`](docs/spec/) | SOURCE OF TRUTH |
| Spec-vs-Code Audit | [`docs/spec/AUDIT_SPEC_VS_CODE.md`](docs/spec/AUDIT_SPEC_VS_CODE.md) | BINDING |
| Spec Expansion Plan | [`docs/spec/SPEC_EXPANSION_PLAN.md`](docs/spec/SPEC_EXPANSION_PLAN.md) | REFERENCE |
| System Spec (overview) | [`SYSTEM_SPEC.md`](SYSTEM_SPEC.md) | BINDING |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) | BINDING |
| Agent Governance | [`AGENTS.md`](AGENTS.md) | BINDING |
| Documentation Index | [`docs/INDEX.md`](docs/INDEX.md) | REFERENCE |

## 8. Historical ExecPlans

All historical ExecPlans (01-16) are archived in `docs/audit/historical_execplans/`.
They document the evolution of the project but are NOT part of the canonical plan.
Current truth: this PLANS.md document.

---

**END OF OPERATIONAL PLAN**


### 3.0.4 SLD Reset — canonical cutover

- [x] Wyłączono dane demo w głównym widoku SLD (`App.tsx` -> `SldEditorPage useDemo={false}`).
- [x] Spis inwentaryzacyjny starego/nowego pipeline i kanonicznego cutover: `docs/SLD_RESET_CANONICAL.md`.
- [x] Krytyczny browser E2E działa na realnym backendzie i potwierdza brak mutacji snapshot hash po run/results.

### 3.0.5 SLD proof package — 4 referencyjne sieci w głównej ścieżce

- [x] `#sld-view` obsługuje query `ref=leaf|pass|branch|ring` i ładuje kanoniczne dane topologiczne bez osobnego ekranu pomocniczego.
- [x] Dodano `referenceTopologies.ts`: jawne dane wejściowe 4 sieci + przejście przez `buildVisualGraphFromTopology` i `computeLayout` (GPZ/trunk/branch/stacja/ring/NOP).
- [x] `SLDView` przekazuje `canonicalAnnotations` do `SLDViewCanvas`, więc warstwa GPZ/trunk/branch/station renderuje się w głównym widoku.
- [x] Dodano test `referenceTopologies.test.ts` (non-empty symbols, annotations, NOP w scenariuszu ring).

### 3.0.6 SLD odbiorowy — skala, czytelność i język polski

- [x] Podniesiono minimalny zoom dopasowania dla scenariuszy referencyjnych (`#sld-view?ref=*`), aby wyeliminować miniaturyzację schematu.
- [x] Wzmocniono wizualnie GPZ/magistralę/odgałęzienia/stację (większy blok GPZ, mocniejsza oś pionowa, większa ramka stacji, czytelniejsze etykiety).
- [x] Ujednolicono etykiety scenariuszy referencyjnych do języka polskiego (bez anglicyzmów użytkowych).
- [x] Dodano testy jakości widoku: minimalna skala, wykorzystanie obszaru, brak mikrotekstu, brak anglicyzmów.

---


## 9. Archiwum sesji operacyjnych

Sekcje historyczne 5.0–5.9 (sesja audytu wizualnego SLD, pętle K20/K30, 2026-05) przeniesione do
[`docs/audit/archive/PLANS_SESJE_SLD_2026-05.md`](docs/audit/archive/PLANS_SESJE_SLD_2026-05.md) (2026-07-15, U0.4).
