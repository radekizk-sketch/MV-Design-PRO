# PROGRAM UI/UX KLASY PRZEMYSŁOWEJ — MV-DESIGN-PRO (2026-07)

**Status:** JEDYNY AKTYWNY PROGRAM WYKONAWCZY UI/UX (podrzędny wobec kanonu V12.xx i specyfikacji `docs/system/`)
**Data:** 2026-07-15; zintegrowany mandat wykonawczy: 2026-10-23
> **JEDYNY AKTYWNY PLAN WYKONAWCZY UI/UX — UJEDNOLICENIE 2026-10-23.**
> Właściciel podtrzymuje istniejący program „UI/UX klasy przemysłowej”; NIE uruchamia kolejnego programu SEL/SLD. **Claude Opus 5.5** jest zarządcą wykonawczym tego programu (zespół pomocniczy tylko wg delegacji). Jedna kolejka, jeden status, jedna kontrola E2E i odbiór właścicielski. Niniejszy dokument jest **jedynym miejscem zmiany priorytetów, kart i bramek UI/UX**; patrz §12. `PLANS.md` jest skrótem postępu, nie konkurencyjnym planem. Materiały SEL są referencją oraz kryteriami, nie odrębnym programem.
> **B-02 NADAL ODRZUCONE. GIS P3 — NIE WDRAŻAĆ W AKTUALNYM ZAKRESIE.**

**Dokumenty powiązane (wiążące dla programu):**
- `docs/uiux/INWENTARZ_FUNKCJI_2026-07.md` — inwentarz funkcji + macierz pokrycia (nic nie pomijamy)
- `docs/uiux/MODEL_INTERAKCJI_APLIKACJI_2026-07.md` — gramatyka interakcji + REJESTR OKIEN (każde okno od nowa)
- `docs/uiux/SPEC_KREATORY_2026-07.md` — kreatory: zero pustych pól, podpowiedź przy każdym polu, gotowe przykłady
- `docs/uiux/SPEC_POWIAZANIA_WARSTW_2026-07.md` — powiązanie warstw: jeden cykl propagacji, wspólna selekcja, kontrakt świeżości, nawigacja dwukierunkowa
- `docs/uiux/SPEC_UKLAD_PANELI_2026-07.md` — układ paneli lewy/środkowy/prawy (rozszerzalne, chowane) + tryby zaawansowania (progresywne odsłanianie)
- `docs/uiux/SZABLONY_STACJI_2026-07.md` — taksonomia szablonów stacji (role A–E, cel ≥ 80) + przeglądarka
- `docs/uiux/PROPOZYCJE_ROZSZERZEN_2026-07.md` — rozszerzenia P1–P22 (zatwierdzone zasadą „na max")
- `docs/uiux/AUDYT_RADY_SPECJALISTOW_2026-07.md` — audyt 13 perspektyw: rozbudowa każdego okna + delta rejestru (+16 okien)
- `docs/uiux/KARTA_KOORDYNACJI_SLD_01_TOKENY.md` — karta styku z wątkiem SLD (tokeny motywów)
- `docs/uiux/KONTRAKT_PREZENTACJI_INZYNIERSKIEJ_V12_7.md` — KANON prezentacji inżynierskiej (V12.7): matematyka wyłącznie KaTeX (nigdy ASCII), metadane produkcyjne poza pierwszym planem, werdykt nie szerszy niż zakres kryterium, wiarygodność ≠ spełnienie, hierarchia jawności obliczeń — obowiązuje przy KAŻDEJ nowej analizie/kryterium na ekranach wyników
- `docs/uiux/PROMPT_ZARZADCA_FABLE_UIUX.md` — prompt zarządcy programu (Fable)
- `docs/plan/PLAN_PRZEBUDOWY_10X_2026-07.md` — program inżynieryjny 10x (perymetr, jakość, współbieżność)
- `docs/plan/PLAN_SLD_REWORK.md` + `docs/sld/SLD_INDUSTRIAL_SPEC_v1.md` — historyczne fazy i szczegółowe wymagania SLD, **bez oddzielnego zarządzania UI/UX**, realizacja w niniejszym programie; §12
- `docs/ui/` — istniejące kontrakty UI (obowiązują, dopóki karta zadania ich jawnie nie zastąpi)
- `docs/research/sel-blueframe/` — osadzone ekrany SEL, filmy, rejestr 32 funkcji i kontrakt wdrożenia „+”; **materiał referencyjny i wejście do kolejki §12, nie nowa roadmapa**
- `docs/plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` (W1–W12) i `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` — plany **domeny i fizyki produktu**, które dostarczają funkcje UI; nie stanowią osobnych kolejek interfejsu; §12.2

---

## 1. Cel

Zbudować warstwę prezentacji **całkowicie od nowa (clean-room UI)**: każde okno, każdy widok,
każda interakcja (klik, dwuklik, prawy przycisk, hover, klawiatura) zaprojektowana i wykonana
na nowo wg `MODEL_INTERAKCJI_APLIKACJI_2026-07.md` — istniejący kod służy WYŁĄCZNIE jako
inspiracja i dowód zakresu funkcjonalnego, a stare okno ginie w tym samym PR, w którym nowe
przejmuje jego funkcję. Cel jakościowy: klasa narzędzi ETAP / DIgSILENT PowerFactory /
ABB e-Design, mierzona bramką „100× lepiej" (MODEL_INTERAKCJI §5), z zachowaniem wszystkich
przewag repo: WHITE BOX obliczeń, determinizm, katalog-first, jeden model sieci.
Granica przebudowy: solverów i fizyki nie przenosi się do UI; kontrakty API respektują wersjonowanie. Zmiany backendu i plików SLD są dozwolone tylko w ramach realnego domknięcia zdolności i istniejącego kanonu (decyzja §2.0 oraz aktualizacja §2.3).

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

### 2.4 Zasada FLOW PROJEKTANTA (dyrektywa właściciela 2026-07-18 — OSTRA, nadrzędna dla UX)
Pełna specyfikacja: [`FLOW_PROJEKTANTA_2026-07.md`](FLOW_PROJEKTANTA_2026-07.md) (WIĄŻĄCA).
Interpretacja kanonu zarejestrowana jako V12K-041. Skrót zasad twardych:
1. **Kanon V12.xx = rejestr ZDOLNOŚCI, nie ekranów.** Stare ekrany (`ui/**`, most) NIE są
   wzorcem docelowym ani „kanonicznymi dostawcami" — są tymczasowymi dostawcami zdolności
   z terminem wygaszenia. Bramka Parytetu dotyczy zdolności, nigdy układu/stylu starego ekranu.
2. **Projektujemy od etapu flow, nie od starego ekranu.** Pytanie wyjściowe każdej karty UI:
   „na którym etapie pracy (E1–E8) jest inżynier i czego potrzebuje, żeby przejść dalej?"
3. **Kontrakt ekranu prowadzącego** (obowiązkowy): cel jednym zdaniem · stan łańcucha pracy
   z akcjami naprawczymi (wzorzec „Tor pracy" z `EkranAnalizTechnicznych`) · uczciwe stany
   zerowe · jawny następny krok · język inżynierski (po co / z czego / co daje).
4. Priorytety przebudów wg bólu inżyniera na etapach E1–E8 (FLOW §2), nie wg wieku kodu.
5. **Ocena wizualna per etap (dyrektywa właściciela 2026-07-18):** po KAŻDYM scaleniu
   etapu zmieniającego UI zarządca wykonuje zrzuty żywej aplikacji (oba motywy tam,
   gdzie dotyczy) i publikuje właścicielowi stronę „Ocena etapów" (stały link);
   znaleziska z oględzin trafiają do rejestru FLOW jako karty poprawek.

### 2.2 Relacja do programu 10x
Program 10x (F0–F4) właśnie zabezpiecza fundament (bramki CI, auth, współbieżność, god-file).
Program UI/UX nie dubluje jego zadań: auth, sekrety, offload event-loopu, mypy — poza zakresem.
Punkt styku: charakteryzacja OpenAPI (F0.5a) jest szwem, na którym UI może bezpiecznie budować.

### 2.3 Relacja do SLD — JEDEN PROGRAM (decyzja właściciela 2026-07-21, V12K-084; konsolidacja 2026-10-23)
**Poprzednia zasada osobnego wątku SLD jest UCHYLONA.** `PLANS.md` §3.-1 potwierdza zniesienie
rozdziału od 2026-07-21. Program UI/UX prowadzi **całą interakcję SLD + kreatory + inspektory +
nakładki wyników + przepływ projektanta** aż do odbioru; SLD jest integralną częścią jednego produktu.
- Wolno modyfikować `frontend/src/ui/sld/**`, `sld-editor/**`, `engine/sld-layout/**`,
  gdy jest to konieczne do wykonania karty i zachowania zgodności z nadrzędnym kanonem.
- **Tylko `SldCanvasV3` i istniejące symbole/projekcja**: zakaz tworzenia nowego SLD, drugiego
  grafu lub zastępowania renderera nowym edytorem. Dwie osobne projekcje SN i nN z jednego ENM.
- Jedno źródło `ownerRef`, `PortRef`, katalogu i stanu aparatu dla SLD, drzewa, inspektora
  i wyników. Nie kopiować fizyki ani rozwiązań backendowych do interfejsu.
- Konflikt współbieżnych zmian rozstrzyga Opus jako integrator; praca na izolowanych gałęziach,
  a nie dwa niezależne programy i dwa źródła statusu.
- Historyczne `PLAN_SLD_REWORK.md` i dokumenty F1–F13 / SCHEMAT-10 są **specyfikacjami
  technicznymi i dowodami**, nie ponownym harmonogramem programu. Odbiór B-02 przez właściciela
  pozostaje niezaliczony niezależnie od deklarowanych zakończeń dawnych etapów.

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
| E5 Dane i topologia | drzewo topologii, inspektor ENM, menedżer danych, property grid multi-edit | topology, enm-inspector, property-grid, schema-completeness | S | U2 |
| E6 Gotowość i walidacja | readiness gate, panel problemów, fix-actions, eligibility | engineering-readiness, issue-panel, analysis-eligibility, mode-gate | S | U2 |
| E7 Przypadki i przebiegi | study cases, aktywny przypadek, scenariusze zwarć, przebiegi wsadowe, cykl życia wyników | study-cases, active-case-bar, fault-scenarios | O | U3 |
| E8 Wyniki analiz | przeglądarka wyników, inspektor, LF/profil napięć/rozdział mocy/wrażliwość; NOWE powierzchnie: rozpływ niesymetryczny, estymacja stanu, stan fazowy, sanity bounds, walidacja energetyczna | results, results-inspector, power-flow-results, voltage-profile, power-distribution, sensitivity | O+S | U3 |
| E9 WHITE BOX / dowody | inspektor dowodów, ślady, LaTeX, paczki proof (wszystkie z inwentarza §3), eksport | proof, results-inspector | O | U3 |
| E10 Zabezpieczenia | biblioteka, TCC, koordynacja, porównania, diagnostyka; NOWE: pętla zwarciowa nn (IEC 60364), zwarcia maszyn | protection, protection-coordination, protection-curves, protection-comparison | O+S | U4 |
| E11 OZE i zgodność NC RfG | testy NC RfG/PTPiREE, FRT/HVRT, NOWE powierzchnie: siła sieci (SCR), adekwatność mocy biernej, SSCI, arc flash; bilans mocy do wniosku przyłączeniowego | ncrfg-tests | O | U4 |
| E12 Porównania (konsolidacja) | JEDEN moduł porównań A/B dla LF/SC/zabezpieczeń/scenariuszy — likwidacja duplikacji comparison / power-flow-comparison / protection-comparison | comparison, power-flow-comparison, protection-comparison | S | U4 |
| E13 Raporty i dokumentacja | centrum raportów: PDF/DOCX, zestawienia materiałowe, kompletność techniczna, import XLSX | reports, audit | S | U4 |
| E14 Integracja SLD | bezpośrednia praca na `SldCanvasV3`: dodawanie, edycja, inspektor, łącza ENM, nawigacja model↔schemat↔wyniki i nakładki | sld-overlay, `SldCanvasV3Workspace`, istniejący executor | **O (prowadzi całość)** | **U2+U5 / P0** |
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
| **U0 Porządek i kanon** | U0.1 inwentarz (✅); U0.2 rejestracja programu w INDEX/PLANS/CLAUDE.md (✅); U0.3 weryfikacja wpięcia API (✅ 2026-07-15 — wyniki w inwentarzu §4/§6); U0.4 porządkowanie PLANS.md (✅ — historia → archiwum); U0.5 karta koordynacyjna tokenów motywów z wątkiem SLD (✅ — czeka na odpowiedź wątku SLD); U0.6 makiety IA (artefakt HTML) zatwierdzone przez właściciela; U0.7 model interakcji + rejestr okien (✅ seed W-101…W-703) | inwentarz bez pozycji „do weryfikacji"; INDEX/PLANS/CLAUDE.md spójne; makiety zatwierdzone — **FAZA U0 ZAMKNIĘTA** (`PLANS.md` §3.-1: „FAZA U0 ZAMKNIĘTA") |
| **U1 Powłoka** | E1, E2, E15 + design system (tokeny, komponenty bazowe) | nowa powłoka z 7 przestrzeniami; wszystkie dotychczasowe widoki osiągalne; pełne bramki zielone — **FAZA U1 ZAMKNIĘTA 2026-07-15** (`PLANS.md` §3.-1: „FAZA U1 ZAMKNIĘTA 2026-07-15") |
| **U2 Model i dane** | E3, E4, E5, E6 | kreator od GPZ do DER przechodzi e2e; katalog-first wymuszony w UI; readiness czytelny — stan wg audytu bramek: `docs/uiux/AUDYT_BRAMEK_U2_U5_2026-08.md` (werdykt U2: 8/11) |
| **U3 Obliczenia i wyniki** | E7, E8, E9 | każda analiza z inwentarza uruchamialna i czytelna z UI; każdy wynik → ślad → dowód — stan wg audytu bramek: `docs/uiux/AUDYT_BRAMEK_U2_U5_2026-08.md` (werdykt U3: 7/9) |
| **U4 Specjalistyczne** | E10, E11, E12, E13 | macierz pokrycia: zero ❌, zero ◐; raporty kompletne — stan wg audytu bramek: `docs/uiux/AUDYT_BRAMEK_U2_U5_2026-08.md` (werdykt U4: 3/7) |
| **U5 Scalenie** | E14 + przejścia e2e wszystkich person §3, polish, visual regression nowej powłoki | ocena rady specjalistów ≥ 9/10 per przestrzeń; pełny e2e „projekt → analiza → dowód → raport" — stan wg audytu bramek: `docs/uiux/AUDYT_BRAMEK_U2_U5_2026-08.md` (werdykt U5: 4/9) |

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
`utf8_mojibake_guard.py`, `docs_guard.py` (przy zmianach doc).
Zmiany wizualne: artefakt renderu + samoocena vs makieta zatwierdzona w U0.6.
Backend (tylko gdy karta jawnie obejmuje API): pełny pytest + guardy backendowe.

## 11. Rejestr decyzji

Decyzje programowe i konflikty → `docs/v12xx/REJESTR_KONFLIKTOW.md` (kanał istniejący).
Postęp faz → `PLANS.md` §3 (wpis programu). Zmiany tego dokumentu wymagają zgody właściciela.

---

## 12. ZINTEGROWANA KOLEJKA WYKONAWCZA — UI/UX PRZEMYSŁOWY (decyzja właściciela 2026-10-23)

### 12.1 Jedna odpowiedzialność, jedno miejsce rozliczenia

**Zarządca wykonawczy:** Claude Opus 5.5 (pełny program UI/UX). Fable i inni agenci mogą dostarczać
części programu wyłącznie na polecenie Opusa, na rozłącznych plikach, bez tworzenia konkurencyjnej
roadmapy i bez autonomicznej zmiany kolejności priorytetów właściciela.

**Jedyny aktywny plan zadań UI/UX:** bieżący dokument, §6 (istniejące epiki E1–E15), §8
(bramki U0–U5) oraz poniższa **jedna kolejka §12.3**. Zadania „SEL +”, „SLD rework”, „ekrany
obliczeń” i „flow” to karty **tych samych epików**, a nie osobne programy.

**Status i dowody:** jedna tabela §12.3 aktualizowana po każdej weryfikacji i scaleniu;
`PLANS.md` §3.-1 publikuje tylko krótkie podsumowanie z linkiem do tego dokumentu.
`docs/uiux/AUDYT_BRAMEK_U2_U5_2026-08.md` pozostaje historycznym dowodem, nie aktualnym
wynikiem. Dokumenty techniczne SLD, W1–W12 i A/B zachowują wartość specyfikacji i
rejestrów fizyki, **nie mogą deklarować innego statusu UI**. Zadanie jest ZAMKNIĘTE tylko,
gdy kod + rzeczywiste kliknięcie użytkownika + poprawne dane ENM/solver + pełne E2E + zrzuty
obu motywów + ocena użytkowa mają dowód. Istnienie ekranu, testy jednostkowe i zielone CI
nie wystarczają.

**Priorytety:** P0 natychmiast i równolegle z konieczną naprawą poprawności obliczeń;
P1 po stabilizacji P0; P2 po odbiorze kluczowego przepływu; P3 GIS — tylko
biblioteka inspiracji, bez realizacji. Żaden element P1/P2/P3 nie może blokować P0.

### 12.2 Rozstrzygnięcie rozproszenia planów — co jest źródłem prawdy

| Dokument | Rola po konsolidacji | Które tematy pobieramy |
|---|---|---|
| **TEN `PROGRAM_UIUX_2026-07.md`** | **JEDYNE sterowanie i postęp UI/UX** | U0–U5, E1–E15, kolejka P0–P3, odbiór, decyzje właściciela |
| `PLANS.md` §3.-1 | tylko skrót postępu i odnośnik | bez nowej listy konkurencyjnych działań |
| `PLAN_SLD_REWORK.md`, `SLD_CAD_*`, `SCHEMAT-10` | specyfikacje techniczne, historia oraz testy SLD | symbole PN-EN 60617, geometria, porty, LOD, deterministyczność, regresja |
| `MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` W1–W12 | nadrzędna mapa **zdolności całego produktu**, nie osobny program UX | W2: uczciwość UI; W7: SLD; W9: ciąg pracy; W4/W5/W6/W8/W10/W11: ekrany zależne od fizyki |
| `PLAN_AB_DYNAMIKA_A_B_2026-09.md` | obowiązujący specjalistyczny program **modelowania i walidacji fizyki A/B** | ekrany RMS, FRT, harmoniczne, zgodność dopiero na autentycznym wyniku |
| `docs/research/sel-blueframe/` (PR #490) | ekranowe źródła, filmy, 32 wzorce, kontrakt testów | inteligentne „+”, drzewo, inspektor, walidacja; **GIS P3** |
| `INWENTARZ_FUNKCJI_2026-07.md`, `FLOW_PROJEKTANTA_2026-07.md` | macierz pokrycia zdolności i kontrakt zachowania, nie drugie harmonogramy | kontrola kompletności i jednolity proces E1–E8 |

### 12.3 JEDNA kolejka — karty powiązane z istniejącymi epikami

Każdy wiersz = ta sama karta niezależnie, czy dotyka SLD, ENM, katalogu czy ekranu.
Pola: **identyfikator, priorytet, epiki U/E i domenowe W, wymagany produkt, dowód, status**.
Poniższe statusy powstały z analizy dokumentów i kodu z 2026-10-23; **nie udają odbioru
żywej aplikacji**. Opus po przejściu rzeczywistych kliknięć aktualizuje je i dopisuje
identyfikatory testów, commitów i zrzutów.

| Karta | Priorytet | Epiki / wejście W | Produkt widoczny dla inżyniera | Obowiązkowy dowód | Status na 2026-10-23 |
|---|---|---|---|---|---|
| **UX-00** | **P0** | U2/U5; E3/E5/E6/E14; W7/W9 | audyt żywego procesu GPZ→SN→stacja→TR→nN→OZE→obliczenia, mapa już działających interakcji i braków; nie pisz nowej kanwy | video/zrzuty obu motywów, lista braków z konkretnymi plikami i klikami | **DO WERYFIKACJI** |
| **UX-01** | **P0** | U2; E3/E14/E15; W7 | inteligentny **„+”** w legalnych punktach elektrycznych, lista akcji zależna od portu i zajętości, klawiatura/dotyk | T+01, T+04, T+05, widoczny uchwyt na SLD V3 | **DO WDROŻENIA/OCENY ISTNIEJĄCYCH MECHANIZMÓW** |
| **UX-02** | **P0** | U2; E3/E4/E5/E14; W7/W9 | z punktu „+” dodaj kabel, pole, ZKSN, stację przelotową/końcową i PV/BESS; automatyczna topologia i rozmieszczenie | T+02/03/06/07/08/09, poprawne `PortRef` i ENM, rzeczywisty solver | **DO WDROŻENIA/OCENY** |
| **UX-03** | **P0** | U2; E4/E5/E6; W9 | drzewo, inspektor, katalog, źródło danych i walidacja w jednym kontekście zaznaczonego elementu | zmiana parametru → ENM → odświeżenie SLD/wyniku; błąd → aparat | **DO WERYFIKACJI I DOMKNIĘCIA** |
| **UX-04** | **P0** | U1/U5; E1/E14; W7 | wspólna estetyka przemysłowa inspirowana SEL: dominująca kanwa, proporcje, motywy, panele niezasłaniające schematu | zrzuty rzeczywistego produktu jasny/ciemny, bez alternatywnych makiet | **B-02 ODRZUCONE** |
| **UX-05** | **P0** | U3/U4; E7/E8/E9/E10/E11; W2/W4/W5/W6 | obliczenia, nakładki na ten sam SLD, wynik → wywód White Box → dowód, brak fikcyjnych liczb i pozornych werdyktów | prawdziwe wejścia solwera, nieaktualność po zmianie ENM, walidacja fizyki | **CZĘŚCIOWE / NIEODEBRANE PRZEKROJOWO** |
| **UX-06** | **P0** | U5; E1–E15; W9 | pełna ścieżka projektanta w jednej aplikacji od GPZ do raportu i odbioru | T+01…T+10 + Playwright na realnym backendzie, regresja obu motywów, B-02 | **NIEODEBRANE** |
| **UX-07** | P1 | U1/U4; E12/E15; W9/W10 | wersje projektu, szkic, cofnij/ponów, porównanie A/B i stany przed/po | operacje odwracalne w ENM z historią i własnym wynikiem, E2E | DO OCENY |
| **UX-08** | P2 | U2/U4; E4/E13; W10 | wygoda katalogów, szablonów i eksportów bez nowych równoległych modułów | kompletna karta, raport, lista urządzeń i parytet zdolności | DO OCENY |
| **UX-09** | **P3 / STOP** | poza bieżącą misją UI | GIS, MDI, mapy, import geograficzny, DNP3/SCADA — zachować jedynie referencje i ewentualny przyszły interfejs danych | brak implementacji bez odrębnego polecenia właściciela | **ODŁOŻONE** |

Nie jest to nowy plan względem E1–E15: to **jawne uporządkowanie i integracja w tych samych
epikach**; w §6 nie wolno tworzyć duplikujących epików ani w planach W i SLD kolejnej kolejki UI.

### 12.4 Kolejność wykonania, bez zatrzymywania pracy Opusa

1. **UX-00 → UX-01/UX-02/UX-03/UX-04**: inspekcja i niezwłoczne wykonanie najbliższej
   brakującej interakcji. Opus prowadzi UX-01/02 na istniejących `SldCanvasV3`,
   `SldCanvasV3Workspace`, `SldCommandService`, `sldActionExecutor`, `PortRef`
   i operacjach backendu. Dotknięte pliki wymagają jednej gałęzi integracyjnej
   i właściciela zmiany; zespół może równolegle weryfikować UX-03/04 na innych plikach.
2. **UX-05** biegnie równolegle pod warunkiem spójności fizyki i nie może udawać odbioru
   naukowego na podstawie zielonego UI. W razie błędu P0 liczenia priorytet ma korekta
   fizyki; po niej podłącz wynik do widoku bez zmiany kontraktu ENM.
3. **UX-06** jest bramką integracyjną P0 każdej partii. **Nie odkładać do ostatniego etapu**:
   po każdej nowej zdolności sprawdzaj cały tor GPZ→stacje→OZE→obliczenia→wynik→dowód/raport.
4. **UX-07/08** tylko po zamknięciu odpowiadających im P0. **UX-09: stop.**
5. Zrzuty i protokół właściciela są aktualizowane po każdej istotnej zmianie ekranu;
   automatyczna regresja wizualna nie zastępuje werdyktu właściciela.
6. Brak zgody właściciela wymaganej przez B-02 nie blokuje napraw P0, ale blokuje
   deklarację akceptacji wizualnej produktu.

### 12.5 Jeden obowiązkowy scenariusz odbioru

Projektant tworzy GPZ (model zasilania SN, **bez szczegółowej rozdzielnicy 110 kV**), pole
liniowe SN, wyprowadza kabel znakiem `+`, wstawia stację przelotową 15/0,4 kV
(2 pola liniowe + transformatorowe), kontynuuje ciąg, dodaje ZKSN i stację końcową,
przechodzi portalem do osobnego SLD nN, dodaje PV/BESS zgodnie z portami i rzeczywistym
katalogiem, oblicza rozpływ i zwarcia, przechodzi z liczby na SLD do szczegółu dowodu,
zmienia parametr kabla/transformatora, widzi oznaczenie wcześniejszych wyników jako
nieaktualnych, przelicza, porównuje warianty i generuje raport. Każdy brak danych ma
uczciwą odmowę z nazwanym elementem i akcją naprawczą. Na końcu zapis projektu,
ponowny odczyt i powtórzenie obliczeń; ekran przy małej szerokości i oba motywy.

**Bramki (wszystkie wymagane):**
- jedna spójna ENM i poprawny tor od GPZ do odbiorcy, porty w polach, żadnych połączeń
  „kreska do kreski”; brak nieuprawnionej architektury WN;
- selekcja drzewa, SLD, inspektora, katalogu i wyników na tym samym `ownerRef`;
- bilans i zwarcia z niezależną wyrocznią, kontrakt źródeł i prądów gałęziowych bez
  nieudowodnionego sumowania modułów jako fazorów;
- widoczny i prawidłowo aktualizowany stan obliczenia, źródło parametrów i White Box A–D;
- wynik Playwright na realnej aplikacji i backendzie + testy odmów i pełnej regresji,
  zrzuty obu motywów dla dokładnie tego samego modelu;
- ocena wizualna **B-02 wyłącznie przez właściciela**; zielone CI ≠ B-02.

### 12.6 Reguła raportowania i pomiaru procentów

Po każdej zmianie Opus raportuje **jedną tabelę** w programie: `UX-ID |
jest → wykonano | wersja/commit | jednostkowe | E2E real | zrzuty ciemny/jasny |
ocena właściciela | status`. Nie ma drugiej listy statusów w SLD i SEL; pliki
referencyjne wskazują identyfikator `UX-ID` z tego dokumentu.

**Procenty**: liczba kart P0 z kompletem dowodów / liczba kart P0 (UX-00…UX-06);
dodatkowo oddzielny procent spełnionych kryteriów faz U2/U3/U4/U5 wg ZAKTUALIZOWANEJ
macierzy. Częściowych kart nie liczyć jako ukończonych, nie ważyć commitami, liniami
kodu ani liczbą testów. **Stan bazowy jest niezweryfikowany po PR #489** i wymaga audytu
UX-00; nie podawać aktualnego procentu z raportu sierpniowego.

### 12.7 Rygor stanu repo i odpowiedzialności

W chwili konsolidacji 2026-10-23 GitHub pokazuje PR #489 jako **OPEN** (nawet jeśli
właściciel przyjmuje na potrzeby planowania, że jest scalony). Repo nie wolno
sztucznie traktować jako innej gałęzi niż rzeczywista. Pakiet źródeł SEL jest w
PR #490. **Zapis niniejszego mandatu do PR #490** powoduje, że Opus po scaleniu
#490 do właściwej gałęzi ma JEDEN dokument programu, a nie kolejną roadmapę;
dalszy rozwój implementacyjny dopiero na rzeczywistym aktualnym HEAD.

**Nadrzędność:** `CLAUDE.md` / kanon V12.xx / normy i poprawna fizyka >
program UI/UX jako jedyna kolejka prezentacji > szczegółowe specyfikacje
SLD/SEL/UI/UX jako materiały implementacyjne. Każdą kolizję rozstrzyga się
na podstawie aktualniejszej decyzji właściciela i rzeczywistego kodu, z
udokumentowanym śladem, bez domniemywania „wdrożone”.

