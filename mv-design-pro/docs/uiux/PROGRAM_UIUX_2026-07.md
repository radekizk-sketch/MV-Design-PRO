# PROGRAM UI/UX KLASY PRZEMYSŁOWEJ — MV-DESIGN-PRO (2026-07)

**Status:** AKTYWNY PROGRAM (podrzędny wobec kanonu V12.xx i specyfikacji `docs/system/`)
**Data:** 2026-07-15
**Dokumenty powiązane (wiążące dla programu):**
- `docs/uiux/INWENTARZ_FUNKCJI_2026-07.md` — inwentarz funkcji + macierz pokrycia (nic nie pomijamy)
- `docs/uiux/MODEL_INTERAKCJI_APLIKACJI_2026-07.md` — gramatyka interakcji + REJESTR OKIEN (każde okno od nowa)
- `docs/uiux/SPEC_KREATORY_2026-07.md` — kreatory: zero pustych pól, podpowiedź przy każdym polu, gotowe przykłady
- `docs/uiux/SPEC_POWIAZANIA_WARSTW_2026-07.md` — powiązanie warstw: jeden cykl propagacji, wspólna selekcja, kontrakt świeżości, nawigacja dwukierunkowa
- `docs/uiux/SPEC_UKLAD_PANELI_2026-07.md` — układ paneli lewy/środkowy/prawy (rozszerzalne, chowane) + tryby zaawansowania (progresywne odsłanianie)
- `docs/uiux/SZABLONY_STACJI_2026-07.md` — taksonomia szablonów stacji (role A–E, cel ≥ 80) + przeglądarka
- `docs/uiux/PROPOZYCJE_ROZSZERZEN_2026-07.md` — PROPOZYCJE P1–P12 (status: czekają na decyzję właściciela)
- `docs/uiux/KARTA_KOORDYNACJI_SLD_01_TOKENY.md` — karta styku z wątkiem SLD (tokeny motywów)
- `docs/uiux/PROMPT_ZARZADCA_FABLE_UIUX.md` — prompt zarządcy programu (Fable)
- `docs/plan/PLAN_PRZEBUDOWY_10X_2026-07.md` — program inżynieryjny 10x (perymetr, jakość, współbieżność)
- `docs/plan/PLAN_SLD_REWORK.md` + `docs/sld/SLD_INDUSTRIAL_SPEC_v1.md` — rework SLD (OSOBNY WĄTEK)
- `docs/ui/` — istniejące kontrakty UI (obowiązują, dopóki karta zadania ich jawnie nie zastąpi)

---

## 1. Cel

Zbudować warstwę prezentacji **całkowicie od nowa (clean-room UI)**: każde okno, każdy widok,
każda interakcja (klik, dwuklik, prawy przycisk, hover, klawiatura) zaprojektowana i wykonana
na nowo wg `MODEL_INTERAKCJI_APLIKACJI_2026-07.md` — istniejący kod służy WYŁĄCZNIE jako
inspiracja i dowód zakresu funkcjonalnego, a stare okno ginie w tym samym PR, w którym nowe
przejmuje jego funkcję. Cel jakościowy: klasa narzędzi ETAP / DIgSILENT PowerFactory /
ABB e-Design, mierzona bramką „100× lepiej" (MODEL_INTERAKCJI §5), z zachowaniem wszystkich
przewag repo: WHITE BOX obliczeń, determinizm, katalog-first, jeden model sieci.
Granica przebudowy: backend, solvery, kontrakty API i pliki wątku SLD — nietknięte.

**Użytkownik pierwszoplanowy:** inżynier projektujący sieci SN ze źródłami OZE (PV, BESS, FW),
prowadzący projekt od GPZ przez magistrale, stacje SN/nn, przyłączenia DER, po analizy, dowody
obliczeń i dokumentację do wniosku przyłączeniowego (OSD).

**Nienegocjowalne:** żadna funkcja obliczeniowa z inwentarza nie może zostać pominięta ani ukryta.
Macierz pokrycia (inwentarz §6) jest listą kontrolną programu: pozycje ❌ dostają nowe powierzchnie
UI, pozycje ◐ są dokańczane, pozycje ✅ są podnoszone jakościowo.

## 2. Ład programu

### 2.0 Zasada „ZAWSZE NA MAX" (decyzja właściciela 2026-07-15 — nadrzędna dla zakresu)
Jeśli czegokolwiek brakuje do pełnej wartości dla inżyniera — **rozbudowujemy od razu, także
backend**. Konsekwencje:
1. Propozycje rozszerzeń (P1–P12 i kolejne) są ZATWIERDZONE z automatu: wchodzą do backlogu
   epików bez osobnej zgody; właściciel zachowuje prawo weta i zmiany kolejności.
2. Rozbudowa backendu jest W ZAKRESIE programu, gdy funkcja jej wymaga (wpięcie analizy do API,
   nowe kategorie szablonów, nowe analizy/interpretacje, dane profili). Granice niezmienne:
   kanon warstw (fizyka tylko w solverach, WHITE BOX dla każdej nowej analizy/solvera),
   katalog-first, determinizm, FROZEN Result API (zmiany wyłącznie przez wersjonowanie),
   pliki wątku SLD nietykalne. Bezpieczeństwo/CI/współbieżność pozostają w programie 10x.
3. Bramka „100× lepiej" ocenia też kompletność: okno, któremu brakuje funkcji możliwej do
   zbudowania, nie przechodzi recenzji z adnotacją „na później" — dostaje kartę rozbudowy.

### 2.1 Relacja do kanonu
Program NIE zmienia kanonu V12.xx, warstw architektury, FROZEN Result API ani zasad z `CLAUDE.md`
(NOT-A-SOLVER, WHITE BOX, Single Model, determinizm, katalog-first, polskie etykiety, zakaz
codenames). Program projektuje wyłącznie warstwę prezentacji i aplikacyjne kontrakty UI.
Konflikt z kanonem → wpis do `docs/v12xx/REJESTR_KONFLIKTOW.md` + STOP na danym zadaniu.

### 2.2 Relacja do programu 10x
Program 10x (F0–F4) właśnie zabezpiecza fundament (bramki CI, auth, współbieżność, god-file).
Program UI/UX nie dubluje jego zadań: auth, sekrety, offload event-loopu, mypy — poza zakresem.
Punkt styku: charakteryzacja OpenAPI (F0.5a) jest szwem, na którym UI może bezpiecznie budować.

### 2.3 Relacja do wątku SLD (RÓWNOLEGŁA SESJA — twarda granica)
Naprawa/rework SLD (plan F1–F5 z `PLAN_SLD_REWORK.md`) biegnie w **osobnym wątku**. W tym programie:
- ZAKAZ modyfikacji: `frontend/src/ui/sld/**`, `frontend/src/ui/sld-editor/**`,
  `frontend/src/engine/sld-layout/**`, symboli kanonicznych, silnika layoutu, rendererów.
- DOZWOLONE: konsumowanie kontraktów SLD (osadzenie widoku SLD w nowej powłoce, wywołanie
  nakładek wyników przez ich publiczne API), projektowanie miejsc na SLD w architekturze informacji.
- Punkty styku wymagające kart koordynacyjnych (uzgodnienie między wątkami, nie samowolna zmiana):
  tokeny motywów `dark_scada`/`light_technical` (SLD F4), API nakładek wyników, panel szczegółów.
- Kolizja plików z wątkiem SLD wykryta w PR → STOP, eskalacja do właściciela.

## 3. Rada specjalistów (poziom recenzji „profesorski")

Każdy epik przechodzi recenzję z perspektyw (checklisty per epik w kartach zadań):
1. **Profesor energetyki** — poprawność pojęć, jednostek, symboli normowych (IEC 60909, 60364,
   60255, 60617), rygor prezentacji niepewności i założeń; żadnych uproszczeń bez przypisu.
2. **Specjalista OZE** — kompletność ścieżki DER: PV/BESS/FW, falowniki, tryby pracy, ograniczenia
   mocy, bilans do wniosku przyłączeniowego.
3. **Specjalista analiz sieciowych** — czytelność wyników LF/SC/wrażliwości, porównania A/B,
   profile napięć, ergonomia pracy iteracyjnej (zmiana → przelicz → porównaj).
4. **Specjalista NC RfG / kodeksów sieciowych** — testy zgodności, FRT/HVRT, raporty do OSD,
   terminologia PTPiREE.
5. **Projektant sieci i urządzeń energetycznych** — przepływ pracy projektowej end-to-end,
   zestawienia materiałowe, kompletność techniczna.
6. **Projektant stacji SN/nn** — konfiguracja rozdzielnic, pola, aparaty, układy pomiarowe,
   uziemienia, sekcjonowanie.
7. **Specjalista zabezpieczeń** — TCC, koordynacja, marginesy, nastawy.
8. **Audytor WHITE BOX** — każdy wynik ma ścieżkę „liczba → wzór → podstawienie → dowód";
   zero liczb bez pochodzenia.

Recenzja = pisemna checklista w PR (sekcja „Rada specjalistów"), nie deklaracja.

## 4. Architektura informacji (IA) — kanon nawigacji

Jedna powłoka, siedem przestrzeni roboczych (kolejność = przepływ pracy inżyniera):

| # | Przestrzeń (etykieta PL) | Zawartość (moduły zastane → docelowe) |
|---|---|---|
| N1 | **Projekt** | pulpit projektu, projects, project-archive, onboarding, ustawienia |
| N2 | **Model sieci** | kreator sieci i stacji (designer, network-build, reference-patterns, station templates, switchgear config), topologia, dane elementów (property-grid, tech-card), katalog |
| N3 | **Schemat (SLD)** | widok SLD + edytor (WŁASNOŚĆ WĄTKU SLD; tu tylko osadzenie i nawigacja) |
| N4 | **Gotowość** | engineering-readiness, issue-panel, analysis-eligibility, schema-completeness, mode-gate |
| N5 | **Obliczenia** | study-cases, active-case-bar, fault-scenarios, batch/przebiegi, eligibility per analiza |
| N6 | **Wyniki i dowody** | results, results-inspector, power-flow-results, voltage-profile, power-distribution, sensitivity, protection*, ncrfg-tests, comparison (skonsolidowane), proof (WHITE BOX), nakładki na SLD |
| N7 | **Dokumentacja** | reports, eksporty PDF/DOCX, bilans mocy, zestawienia materiałowe, paczki dowodowe |

Zasady IA:
- Stała lewa nawigacja przestrzeni + kontekstowy panel prawy (inspektor/szczegóły) + pasek stanu.
- Aktywny przypadek obliczeniowy widoczny ZAWSZE (pasek aktywnego przypadku w powłoce).
- Breadcrumb: Projekt → przestrzeń → obiekt. Głębokość nawigacji ≤ 3 kliknięcia do każdej funkcji.
- Każdy wynik liczbowy klikalny → inspektor → ślad WHITE BOX → dowód (LaTeX) → eksport.
- Stany obowiązkowe każdego widoku: pusty / ładowanie / błąd / brak uprawnień / gotowy (z danymi).

## 5. System projektowy (design system)

- **Tokeny:** semantyczne (`--mvd-*`), zero kolorów inline; skala odstępów 4 px; siatka gęstości
  „kompakt inżynierski" (tabele danych gęste, formularze przestronne).
- **Motywy:** `light_technical` (domyślny, druk/eksport) i `dark_scada` (ekran) — WSPÓLNE tokeny
  z wątkiem SLD F4 (karta koordynacyjna, nie fork).
- **Typografia:** jedna rodzina UI + mono dla wartości liczbowych/jednostek; liczby wyrównane
  do prawej, jednostki zawsze obecne (kV, kA, MW, MVar, s, Ω/km).
- **Język:** wyłącznie polski język techniczny w CAŁYM interfejsie (dyrektywa właściciela
  2026-07-15). Zakaz surowych identyfikatorów z kodu (nazwy modułów/solverów, snake_case,
  angielskie statusy, skróty kodowe pakietów) w tekstach pierwszoplanowych; normy cytowane po
  numerze („IEC 60909-0") są dozwolone. Identyfikatory techniczne tylko w strefie „szczegóły
  techniczne" (MODEL_INTERAKCJI §2.7). Słownik terminów = `CLAUDE.md` §Terminology + kontrakty
  `docs/ui/`; zakaz codenames (guard). Egzekwowanie: rozszerzenie `ui_terminology_guard`
  o wykrywanie identyfikatorów kodowych w stringach UI — obowiązkowa karta w U1.
- **Dostępność:** pełna obsługa klawiatury, ARIA, kontrast ≥ WCAG AA w obu motywach.
- **Komponenty bazowe (biblioteka `ui/shared` przeprojektowana):** tabela danych (sort/filtr/
  wirtualizacja), formularz z walidacją zod, inspektor, karta wyniku, wykres (Recharts + KaTeX
  dla wzorów), drzewo, pasek narzędzi, dialogi (kontrakt kompletności dialogów — guard istnieje).
- Determinizm renderu: zakaz `Date.now()`/losowości w komponentach prezentacji wyników.

## 6. Epiki programu

Każdy epik rozpisywany przez zarządcę na karty zadań (format §9). Kolumna „Wyk." = sugerowany
wykonawca (O=Opus, S=Sonnet, G=Codex GPT, F=Fable-zarządca; szczegóły w prompcie zarządcy).

| Epik | Zakres | Moduły zastane | Wyk. | Faza |
|---|---|---|---|---|
| E1 Powłoka i nawigacja | shell, navigation, workspace, status-bar, notifications, settings, help, onboarding — nowa IA §4 | shell, navigation, workspace, layout, status-bar, notifications, settings, help, onboarding | O | U1 |
| E2 Pulpit projektu | projekty, archiwum ZIP, diff archiwów, kopie | projects, project-archive | S | U1 |
| E3 Kreator sieci i stacji | kreator od GPZ: magistrale, stacje, rozdzielnice, DER (PV/BESS/FW), szablony stacji, wzorce referencyjne, podgląd źródła; tryb ekspercki; WIĄŻĄCE: `SPEC_KREATORY_2026-07.md` (zero pustych pól, podpowiedź per pole, gotowe przykłady P-01…P-05) | designer, network-build, reference-patterns, wizard (kontrakty `docs/ui/UX_KREATOR_SIECI_SN_OD_GPZ.md`, `docs/ui/KANON_KREATOR_SN_NN_NA_ZYWO.md`) | O | U2 |
| E4 Katalog-first | przeglądarka katalogu, karta techniczna, wiązanie typów, kompletność danych | catalog, tech-card, property-grid | S | U2 |
| E5 Dane i topologia | drzewo topologii, inspektor ENM, menedżer danych, property grid multi-edit | topology, enm-inspector, data-manager, property-grid, schema-completeness | S | U2 |
| E6 Gotowość i walidacja | readiness gate, panel problemów, fix-actions, eligibility | engineering-readiness, issue-panel, analysis-eligibility, mode-gate | S | U2 |
| E7 Przypadki i przebiegi | study cases, aktywny przypadek, scenariusze zwarć, przebiegi wsadowe, cykl życia wyników | study-cases, active-case-bar, fault-scenarios | O | U3 |
| E8 Wyniki analiz | przeglądarka wyników, inspektor, LF/profil napięć/rozdział mocy/wrażliwość; NOWE powierzchnie: rozpływ niesymetryczny, estymacja stanu, stan fazowy, sanity bounds, walidacja energetyczna | results, results-inspector, power-flow-results, voltage-profile, power-distribution, sensitivity | O+S | U3 |
| E9 WHITE BOX / dowody | inspektor dowodów, ślady, LaTeX, paczki proof (wszystkie z inwentarza §3), eksport | proof, results-inspector | O | U3 |
| E10 Zabezpieczenia | biblioteka, TCC, koordynacja, porównania, diagnostyka; NOWE: pętla zwarciowa nn (IEC 60364), zwarcia maszyn | protection, protection-coordination, protection-curves, protection-comparison | O+S | U4 |
| E11 OZE i zgodność NC RfG | testy NC RfG/PTPiREE, FRT/HVRT, NOWE powierzchnie: siła sieci (SCR), adekwatność mocy biernej, SSCI, arc flash; bilans mocy do wniosku przyłączeniowego | ncrfg-tests | O | U4 |
| E12 Porównania (konsolidacja) | JEDEN moduł porównań A/B dla LF/SC/zabezpieczeń/scenariuszy — likwidacja duplikacji comparison / power-flow-comparison / protection-comparison | comparison, power-flow-comparison, protection-comparison | S | U4 |
| E13 Raporty i dokumentacja | centrum raportów: PDF/DOCX, zestawienia materiałowe, kompletność techniczna, import XLSX | reports, audit | S | U4 |
| E14 Integracja SLD | osadzenie SLD w nowej powłoce, nawigacja model↔schemat↔wyniki, nakładki przez publiczne API | sld-overlay (konsumpcja) | F (koordynacja) | U5 |
| E15 Fundament stanu | app-state, selection, history (undo/redo), context-menu, contracts, canon, field — audyt i uporządkowanie pod nową IA; WIĄŻĄCE: `SPEC_POWIAZANIA_WARSTW_2026-07.md` (magistrala zdarzeń powłoki, selekcja globalna, kontrakt świeżości rewizji) | app-state, selection, history, context-menu, contracts, canon, field, common, shared, config, icons | S | U1 |

Reguła konsolidacji: stary moduł znika w tym samym PR, w którym nowy przejmuje jego funkcję
(zero bytów równoległych — zgodnie z programem 10x §5).

## 7. Braki i niespójności podniesione przez program (z dowodami)

| # | Problem | Dowód | Rozwiązanie |
|---|---|---|---|
| B1 | 8 analiz backendu bez ŻADNEJ powierzchni UI (arc flash, estymacja stanu, SSCI, siła sieci, adekwatność Q, zwarcia maszyn, sanity bounds, walidacja energii) | inwentarz §6 (grep 0 plików) | nowe powierzchnie w E8/E10/E11 |
| B2 | Trzy równoległe moduły porównań | `ui/comparison`, `ui/power-flow-comparison`, `ui/protection-comparison` | konsolidacja E12 |
| B3 | Pętla zwarciowa nn ledwie dotknięta w UI | grep: 2 pliki | E10 |
| B4 | `CLAUDE.md` opisywał strukturę i status niezgodne ze stanem repo (4 solvery vs 18 modułów solverów) | porównanie z inwentarzem | naprawione 2026-07-15 (CLAUDE.md wskazuje inwentarz) |
| B5 | `PLANS.md` §1 deklarował stan z 2026-05 | PLANS.md vs plan 10x §1 | wpis aktualizujący 2026-07-15 |
| B6 | `README.md` wskazywał archiwalne `docs/spec/` jako specyfikację | README:11 | naprawione 2026-07-15 (spójne z hierarchią kanonu) |
| B7 | Rozjazd nazw modułów UI między dokumentami | inwentarz §5 UWAGA | jedno źródło: inwentarz |
| B8 | Bałagan struktury `PLANS.md` (sekcje 5.0–5.9 po §8) | PLANS.md | porządkowanie w U0.4 (bez utraty historii — przeniesienie do archiwum) |
| B9 | Brak auth / sekrety w repo | program 10x §1 | POZA ZAKRESEM — własność programu 10x F1 |

## 8. Fazy programu

| Faza | Zakres | DoD (bramka wyjścia) |
|---|---|---|
| **U0 Porządek i kanon** | U0.1 inwentarz (✅); U0.2 rejestracja programu w INDEX/PLANS/CLAUDE.md (✅); U0.3 weryfikacja wpięcia API (✅ 2026-07-15 — wyniki w inwentarzu §4/§6); U0.4 porządkowanie PLANS.md (✅ — historia → archiwum); U0.5 karta koordynacyjna tokenów motywów z wątkiem SLD (✅ — czeka na odpowiedź wątku SLD); U0.6 makiety IA (artefakt HTML) zatwierdzone przez właściciela; U0.7 model interakcji + rejestr okien (✅ seed W-101…W-703) | inwentarz bez pozycji „do weryfikacji"; INDEX/PLANS/CLAUDE.md spójne; makiety zatwierdzone |
| **U1 Powłoka** | E1, E2, E15 + design system (tokeny, komponenty bazowe) | nowa powłoka z 7 przestrzeniami; wszystkie dotychczasowe widoki osiągalne; pełne bramki zielone |
| **U2 Model i dane** | E3, E4, E5, E6 | kreator od GPZ do DER przechodzi e2e; katalog-first wymuszony w UI; readiness czytelny |
| **U3 Obliczenia i wyniki** | E7, E8, E9 | każda analiza z inwentarza uruchamialna i czytelna z UI; każdy wynik → ślad → dowód |
| **U4 Specjalistyczne** | E10, E11, E12, E13 | macierz pokrycia: zero ❌, zero ◐; raporty kompletne |
| **U5 Scalenie** | E14 + przejścia e2e wszystkich person §3, polish, visual regression nowej powłoki | ocena rady specjalistów ≥ 9/10 per przestrzeń; pełny e2e „projekt → analiza → dowód → raport" |

Fazy sekwencyjne; wewnątrz fazy epiki mogą biec równolegle (różni wykonawcy, rozłączne pliki).

## 9. Zasada „zero zgadywania" — obowiązkowy format karty zadania

Wykonawca dostaje kartę kompletną albo zadanie nie startuje. Pola obowiązkowe:

```
KARTA ZADANIA <epik>.<nr>
1. Cel (1–2 zdania) + persona z §3, której służy.
2. Pliki wejściowe (istniejące, pełne ścieżki) i pliki wyjściowe (tworzone/zastępowane).
3. Kontrakt danych: endpointy (metoda+ścieżka), schematy request/response, typy TS.
4. Stany UI: pusty / ładowanie / błąd / brak danych / gotowy — opis każdego.
4a. Kontrakt interakcji: tabela klik / 2× klik / prawy klik / hover / klawiatura zgodna z
    gramatyką `MODEL_INTERAKCJI_APLIKACJI_2026-07.md` §2 + ID okna z rejestru okien (§4 tamże).
5. Etykiety PL: dokładne stringi (słownik), formaty liczb i jednostek.
6. Zależności i granice: czego NIE wolno dotykać (zawsze: pliki wątku SLD, solvery, Result API).
7. Kryteria akceptacji: testowalne, z nazwami plików testów do napisania.
8. Bramki: pełny type-check, lint, vitest (całość), guardy tier-1, guard codenames.
9. Recenzja rady specjalistów: które perspektywy z §3 i ich checklisty.
```

Jeśli wykonawca musi zgadnąć COKOLWIEK z pól 2–5 → obowiązek zwrotu karty do zarządcy z pytaniem.
Improwizacja = odrzucenie PR.

## 10. Bramki jakości programu

Przed każdym mergem: `npm run type-check`, `npm run lint`, pełny `vitest run --no-file-parallelism`,
`npm run guard:codenames`, guardy: `forbidden_ui_terms_guard.py`, `ui_terminology_guard.py`,
`dialog_completeness_guard.py`, `dead_click_guard.py`, `overlay_no_physics_guard.py`,
`trace_ui_leak_guard.py`, `utf8_mojibake_guard.py`, `docs_guard.py` (przy zmianach doc).
Zmiany wizualne: artefakt renderu + samoocena vs makieta zatwierdzona w U0.6.
Backend (tylko gdy karta jawnie obejmuje API): pełny pytest + guardy backendowe.

## 11. Rejestr decyzji

Decyzje programowe i konflikty → `docs/v12xx/REJESTR_KONFLIKTOW.md` (kanał istniejący).
Postęp faz → `PLANS.md` §3 (wpis programu). Zmiany tego dokumentu wymagają zgody właściciela.
