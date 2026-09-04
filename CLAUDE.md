# CLAUDE.md - AI Assistant Guidelines for MV-DESIGN-PRO

---

## ⛔ ZASADY NADRZĘDNE PROJEKTU (czytaj przed każdą pracą)

Pełny kanon: `PROMPT_MV_DESIGN_PRO_PRZEBUDOWA.md` (UWAGA: pliku NIE MA w repo — przywołuje go też `mv-design-pro/STAN_REPO.md`; do czasu dodania kanonu obowiązuje hierarchia dokumentów z sekcji „Document Hierarchy" poniżej). Stan i dług: `mv-design-pro/STAN_REPO.md` (czytaj NAJPIERW). Repo > specy > rejestr.

**ZASADA NR 1 — ZERO DŁUGU.** Każda funkcja w UI ma w pełni wdrożony backend: UI + solver + kontrakt + testy + integracja. Zakaz `no_module` / `funkcja w przygotowaniu` / `TODO` / zaślepek. Funkcja istniejąca tylko w testach, niewpięta w ścieżkę użytkownika, to dług.

**ZASADA NR 2 — WERYFIKACJA WIZUALNA.** Kod się kompiluje ≠ ekran działa. Dowodem jest render/zrzut, nie kod. Werdykt wizualny SLD wystawia właściciel (gate B-02), nie agent. Zakaz samocertyfikacji jakości wizualnej.

**ZASADA NR 3 — NIC NA POTEM.** Wykryte = naprawione natychmiast, w tej samej pracy. Zakaz: „follow-on", „osobny przebieg", „sekwencyjnie", „bounded increment", „dług porządkowy odłożony", jawnego błędu (`NotSupportedError`) zamiast funkcji, okrajania zakresu „bo nie tu". Dług architektoniczny wykryty przy okazji (np. dwie ścieżki tej samej fizyki) → naprawiony od razu. „Duże/przekrojowe" → orkiestracja teraz (`mv-design-pro/ORKIESTRACJA_AGENTOW.md`), nie odroczenie. Jeśli piszesz „później/sekwencyjnie/poza zakresem" — to sygnał, że odkładasz: zatrzymaj się i zrób to teraz.

**ZAKAZ SKRÓTÓW.** Kompletność ponad zwięzłość. Zakaz „etc.", „analogicznie", „uproszczony", „do dopracowania", „do dopracowania później". Każdy przypadek brzegowy, każde miejsce wpięcia, każdy solver — w pełni, jawnie.

**PEŁNA IMPLEMENTACJA.** Luka wykryta = solver napisany wg właściwej normy + kontrakt + White Box + testy + sanity-bounds + wpięcie we WSZYSTKIE miejsca (nie część). Wymaganie nie pasujące do bieżącego miejsca wpinasz tam, gdzie pasuje — nie odkładasz.

**JEDYNE DOZWOLONE ZATRZYMANIA** (to NIE są odroczenia): (1) edycja zamrożonego rdzenia bez zgody właściciela — B-01; (2) werdykt wizualny SLD — B-02; (3) bramki bezpieczeństwa, np. reduce-to-NR przy zmianie rdzenia. Poza tym: działaj do końca, autonomicznie, bez odkładania.

**UCZCIWOŚĆ.** Raportuj stan zgodnie z prawdą — co domknięte z dowodem, co częściowe, czego nie zrobiono i dlaczego. Korekta w obie strony. Nigdy nie zawyżaj. „Renderuje się / testy zielone / wygląda gotowo" ≠ dowód ukończenia.

---

## 🤖 INSTRUKCJA MODELU — Claude Fable 5.1 (`claude-fable-5-1`)

Oficjalna dokumentacja: https://platform.claude.com/docs/en/about-claude/models/overview
Zakres sekcji: kontrakt API modelu prowadzącego pracę w tym repo oraz reguły pisania promptów i skilli pod ten model. W sesji Claude Code sam model wybiera harness (`/model`) — reguły promptowania obowiązują niezależnie od tego wyboru.
Project Glasswing: `claude-mythos-5-1` to ten sam model o innym identyfikatorze — całość poniżej obowiązuje bez zmian.

### Limity i kontekst
- **Okno kontekstu:** 1 000 000 tokenów (maksimum jest zarazem wartością domyślną)
- **Maks. output:** 128 000 tokenów na żądanie; przy dużym `max_tokens` używaj streamingu (`.stream()` + `get_final_message()`), inaczej ryzykujesz timeout HTTP
- **Tokenizer:** ten sam co Opus 4.8/4.7 → liczby tokenów bez zmian względem tych modeli; z Opus 4.6, Sonnet, Haiku i starszych ten sam tekst daje ×1,0–1,35 tokenów — przelicz `count_tokens`, nie przenoś starych budżetów kontekstu
- **Retencja danych:** wymagane 30 dni. Organizacja w trybie zero-data-retention dostaje `400 invalid_request_error` — sprawdź konfigurację retencji, zanim zaczniesz debugować payload

### Myślenie — zawsze włączone
Nie wysyłaj konfiguracji `thinking`. Pominięcie parametru = myślenie adaptacyjne (dozwolone jest też jawne `{type: "adaptive"}`). `{type: "disabled"}` oraz `{type: "enabled", budget_tokens: N}` → **400**. `budget_tokens` nie ma następcy: głębokością steruje `output_config.effort`, który jest kontrolą wyjścia, nie budżetem myślenia.
Surowy łańcuch myśli nigdy nie wraca. `display` steruje wyłącznie widocznością — myślenie zachodzi i jest rozliczane tak samo w każdym trybie:

| `thinking.display` | Co wraca |
|--------------------|----------|
| `omitted` (domyślne) | bloki `thinking` z pustym tekstem — długa tura agentowa wygląda na ciszę |
| `summarized` | czytelne streszczenie rozumowania (dla widoków strumieniowych) |
| `updates` | krótkie meldunki postępu między wywołaniami narzędzi (beta `thinking-display-updates-2026-08-18`) |

**Parametr `effort`** (`output_config.effort`, GA, domyślnie `high`):

| Poziom | Kiedy używać |
|--------|-------------|
| `max` | Poprawność ważniejsza od kosztu (zmiana rdzenia, solver, bramka bezpieczeństwa) |
| `xhigh` | Najbardziej wymagające zadania agentowe i architektoniczne |
| `high` | Wartość domyślna dla pracy w tym repo |
| `medium` | Praca rutynowa, gdy jakość się utrzymuje (zmierz, zanim ustawisz na stałe) |
| `low` | Subagenty, proste kroki, wysoki wolumen |

Niższy `effort` na Fable 5.1 bywa lepszy niż `xhigh`/`max` poprzednich modeli — nie podnoś domyślnej wartości „na wszelki wypadek", tylko po pomiarze. Przy wyższym `effort` model chętniej rozbudowuje kontekst i weryfikuje: to zaleta na trudnym zadaniu, koszt na rutynowym.

### Zakazy (400 na Fable 5.1)
- `temperature`, `top_p`, `top_k` — steruj promptem, nie parametrami
- `thinking: {type: "disabled"}` oraz `budget_tokens`
- prefill ostatniej tury asystenta — użyj `output_config.format` (structured outputs) albo instrukcji systemowej
- **wymuszone narzędzie**: `tool_choice: {type: "any"}` i `{type: "tool", name: …}` (dotyczy też Batches i `count_tokens`). Zamienniki wg intencji: `auto` + zdanie w prompcie nazywające narzędzie (sterowanie), `strict: true` na definicji narzędzia z `additionalProperties: false` (gwarancja zgodności argumentów), `output_config.format` (gdy wymuszenie służyło tylko odebraniu JSON-a). `{type: "none"}` działa bez zmian; `disable_parallel_tool_use` z `auto` znaczy teraz „co najwyżej jedno wywołanie", nie „dokładnie jedno"

### Zachowane myślenie (preserved thinking) — historia TYLKO dopisywana
Blok `thinking` jest związany (a) z modelem, który go wytworzył, i (b) z prefiksem rozmowy: `system` + `tools` + wszystkie wcześniejsze wiadomości. Edycja wcześniejszej tury unieważnia KAŻDY późniejszy blok — żądanie kończy się `400` (konta założone od 2026-08-31 mają egzekwowanie domyślnie włączone).
- Odsyłaj bloki `thinking` **bez zmian**, także te z pustym tekstem. Nie usuwaj ich „dla oszczędności": blok nieczytelny dla modelu docelowego API i tak odrzuca przed wyceną — nie wchodzi do `input_tokens` i nie jest rozliczany, a ręczne usuwanie wywołuje błędy kolejności/podpisu.
- Zmiana instrukcji w trakcie sesji: **nie przepisuj** `system` ani `tools` — dopisz wiadomość `{"role": "system", …}` do `messages` (GA, bez nagłówka beta). Przypomnienie na jedną turę: `clear_at: "next_user_message"` (beta `mid-conversation-system-clear-at-2026-08-21`) i zostaw w historii wszystkie starsze kopie — czyszczą się same i nie kosztują tokenów.
- Skracanie kontekstu: kompakcja serwerowa (beta `compact-2026-01-12`) albo context editing — to NIE liczy się jako edycja historii. Po stronie klienta jedyny bezpieczny kształt to streszczenie całości do jednej wiadomości; wariant „zostaw ostatnie tury" łamie kontrakt, bo ich bloki powstały przy pełnej historii.
- Diagnostyka i CI: nagłówek `thinking-binding-controls-2026-08-01` + `thinking.block_binding.prefix_mismatch_behavior` — `"error"` w CI (edycja historii wywala bieg), `"drop_block"` w produkcji; zrzucone bloki wracają w `input_transformations` z powodem `prefix_binding_mismatch` (zmieniona historia) albo `model_binding_mismatch` (zmiana modelu).

### Odmowa klasyfikatora (`stop_reason: "refusal"`)
Fable 5.1 uruchamia klasyfikatory bezpieczeństwa (m.in. biologia badawcza i większość treści z cyberbezpieczeństwa); praca sąsiadująca z tymi obszarami bywa odrzucana fałszywie. Odmowa to **HTTP 200**, nie wyjątek: sprawdzaj `stop_reason` PRZED odczytem `content` — kod czytający `content[0]` bezwarunkowo pęka. Kategoria siedzi w `stop_details.category` (`"cyber"`, `"bio"`, `"reasoning_extraction"`, `"frontier_llm"` albo `null`), ale rozgałęziaj po `stop_reason`: `stop_details` bywa `null` również przy odmowie.
Fallback włączaj domyślnie: `betas: ["server-side-fallback-2026-07-01"]` + `fallbacks: "default"`. Dozwolone cele to `claude-opus-5` i `claude-opus-4-8`. Ponowienie z `fallback_credit_token` (beta `fallback-credit-2026-07-01`) rozlicza wcześniej zbuforowany prefiks po stawce odczytu — ciało żądania musi być identyczne z odrzuconym.

### Prompt caching — tu leży największa oszczędność
- Odczyt z cache kosztuje **$0,25/1M (0,025× wejścia)** — cztery razy taniej niż na Fable 5 i dwa razy taniej niż na Opus 5. Skoro trafienie jest tak tanie, **utrzymanie ciepłego cache waży więcej niż jego rozmiar**.
- Minimalny buforowany prefiks: **512 tokenów**. Maks. 4 punkty `cache_control` na żądanie. TTL 5 min (zapis 1,25×) lub 1 h (2×).
- Kolejność renderu: `tools` → `system` → `messages`. `cache_control` stawiaj na ostatnim bloku, który NIE zmienia się między żądaniami; dane zmienne (znaczniki czasu, identyfikatory, pytanie użytkownika) zawsze PO punkcie cięcia.
- Zmiana `effort` na poziomie żądania **kasuje cache**. W trakcie rozmowy zmieniaj go wiadomością `role: "system"` z pustą treścią i własnym `output_config` (beta `mid-conversation-output-config-2026-07-01`) — cache zostaje, a sterowanie jest pewniejsze.
- Przerwa 5–60 min: tańsze bywa odświeżenie żądaniem `max_tokens: 0` niż TTL godzinny.
- Weryfikacja: `usage.cache_read_input_tokens`. Zero przy powtarzalnych żądaniach = cichy unieważniacz (np. `datetime.now()` w system prompcie, nieposortowany JSON, zmienny zestaw narzędzi).

### Koszt (Claude API, za 1M tokenów)
| Typ | Fable 5.1 | Opus 5 (cel fallbacku, tańsza ścieżka) |
|-----|-----------|----------------------------------------|
| Wejście | $10 | $5 |
| Wyjście | $50 | $25 |
| Zapis cache 5 min | $12,50 | 1,25× wejścia |
| Zapis cache 1 h | $20 | 2× wejścia |
| Odczyt cache | **$0,25** | $0,50 |
| Batch | $5 / $25 | −50% od stawek bazowych |

### Multi-agent i subagenty
- Delegacja równoległa jest na tym modelu niezawodna — używaj jej i nazwij wprost, KIEDY jest pożądana, zamiast blokować ją regułą pisaną pod starsze modele.
- Subagenty **asynchroniczne** biją wzorzec „uruchom i czekaj": zachowują kontekst między podzadaniami (tańsze odczyty z cache) i nie blokują orkiestratora na najwolniejszym wykonawcy.
- Proste kroki: `effort: "low"`. Recenzja, architektura, solver: `high`/`xhigh`.
- Daj modelowi powierzchnię pamięci: plik `.md` na wnioski plus instrukcję, żeby do niego zaglądał w kolejnych sesjach — w długich przebiegach daje mierzalną poprawę.

### Prompting — czego NIE robić po migracji
- **Odchudź prompty i skille pisane pod starsze modele.** Rozpisany proces („krok 1, krok 2…") OBNIŻA jakość na Fable 5.1. Podawaj cel, ograniczenia i kryterium ukończenia zamiast wyliczać kroki.
- Podaj **powód** zadania, nie tylko polecenie — model wiąże je z właściwym kontekstem, zamiast zgadywać intencję.
- Nazwij **granice**, bo przy wyższym `effort` model bywa nadgorliwy (sprząta, refaktoryzuje, dopisuje testy, których nikt nie zamawiał). W tym repo granicą są kontrakty FROZEN, determinizm, fikstury e2e i cudze warstwy.
- W długich sesjach agentowych dopisz sekcję o stylu komunikacji — bez niej meldunki gęstnieją do skrótów zrozumiałych tylko dla autora.
- Pojedyncza tura na trudnym zadaniu potrafi trwać kilkanaście minut. Planuj streaming i asynchroniczny odbiór wyników, nie blokujące oczekiwanie.

### Czego Fable 5.1 NIE ma (żeby mit nie wrócił)
- **Fast Mode** — wyłącznie Opus 5 i Opus 4.8 na Claude API. Na Fable 5.1 nie istnieje.
- **Priority Tier** — nieobsługiwany (Fable 5 go miał). Limity dzielone we wspólnej puli z Fable 5 — przelicz zapas, jeśli oba modele jadą równolegle.
- **Prefill i wymuszone narzędzie** — patrz „Zakazy" powyżej.

### Wizja i pliki
- Obrazy: JPEG, PNG, GIF, WebP; wysoka rozdzielczość bez przycinania skalą (jak od Opus 4.7). Model jest trenowany do sięgania po bash i kadrowanie przy obrazach obróconych, rozmytych i zaszumionych.
- **Files API i Skills wyszły z bety**: `client.files.*` / `client.skills.*` BEZ nagłówka `anthropic-beta`. Nagłówki `files-api-2025-04-14` i `skills-2025-10-02` w kodzie to dług do usunięcia.
- Wyjście wyłącznie tekstowe; pliki binarne (DOCX, PDF, wykresy) powstają w sandboxie code execution i wracają przez Files API.

---

## 🧠 MODEL RECENZENTA — GPT-6 Astra (`gpt-6-astra`)

Dokumentacja: https://developers.openai.com/api/docs/models/gpt-6-astra · wskazówki migracyjne: https://developers.openai.com/api/docs/guides/latest-model · rozumowanie: https://developers.openai.com/api/docs/guides/reasoning
Rola w projekcie: **niezależny recenzent** (burza mózgów · audytor · recenzent · doradca) wywoływany wg `mv-design-pro/docs/uiux/SKILL_GPT_RECENZENT.md`. Zasada nienegocjowalna stamtąd obowiązuje bez zmian: nie wolno zacytować opinii GPT, której GPT nie wypowiedział — brak CLI albo klucza = recenzja własna, jawnie oznaczona.

### Limity i kontekst
- Okno kontekstu: 1 050 000 tokenów (maks. wejście 922 000, maks. wyjście 128 000)
- Wiedza do: 30 kwietnia 2026
- Wejście: tekst i obrazy; wyjście: tekst
- Endpointy: `v1/responses` (zalecany — **wywołanie narzędzi działa tylko tutaj**), `v1/chat/completions`, `v1/batch`. Brak: Realtime, Assistants, fine-tuning, embeddings

### Rozumowanie
- `reasoning.effort` (Responses) / `reasoning_effort` (Chat Completions): `low` · `medium` · `high` · `xhigh` · `max`. **`none` nieobsługiwane** — kod ustawiony na `none`/`minimal` przestaw na `low`. Dla recenzji w tym repo: `xhigh`.
- Rozumowanie jest ukryte („recurrent depth") — łańcuch myśli nie wraca w całości. Streszczenie: `reasoning.summary: "auto"`.
- Trwałość rozumowania między turami: `reasoning.context` (`current_turn` albo `all_turns`); przy `store: false` elementy niosą `encrypted_content`. Zachowane rozumowanie przenosi się wyłącznie w obrębie tej samej rodziny modeli.

### Zakazy
- `temperature`, `top_p`, `top_logprobs` — usuń z wywołań; dodatkowo `logprobs` w Chat Completions i `message.output_text.logprobs` w `include` dla Responses

### Wywołanie przez Codex CLI (ścieżka domyślna w tym repo)
```bash
codex exec --model gpt-6-astra --reasoning-effort xhigh --sandbox read-only \
  --cd <katalog_repo> "$(cat /tmp/prompt_recenzji.md)"
```
Wymagany Codex CLI ≥ 0.153.1 — wcześniejsze wersje nie znają tego identyfikatora. `--sandbox read-only`: recenzent CZYTA, nie zmienia repo; zmiany wprowadza agent prowadzący po weryfikacji. Długi przegląd puszczaj w tle i odbieraj wynik z pliku.

### Koszt (za 1M tokenów)
| Typ | Koszt |
|-----|-------|
| Wejście | $10 |
| Wejście z cache | $1 |
| Wyjście | $50 |
| Zapis cache | $12,50 |

Prompt powyżej 272 000 tokenów: 2× stawka wejścia i cache, 1,5× wyjścia (wg tabeli cennika modelu). Batch: −50%.

### Prompting (wg wskazówek OpenAI dla Astry)
- Model **działa z rozmachem**: sam dopowiada zakres i domyka zadanie do końca. Podaj cel, kontekst, granice, poziom autonomii, format wyjścia i definicję ukończenia — inaczej dokończy po swojemu.
- **Zwiększona wrażliwość na pliki kontekstowe** (`AGENTS.md`, `CLAUDE.md`, skille): sprzeczne instrukcje potrafią go zatrzymać albo zmienić kierunek. Po każdej zmianie tych plików sprawdź, czy nie powstała sprzeczność — rozstrzyga „Document Hierarchy" poniżej.
- Domyślnie ciągnie do list i tabel; jeśli chcesz prozy, powiedz to wprost.
- Dostęp: na kontach Enterprise model bywa domyślnie wyłączony (włącza administrator), a zadania z ofensywnego cyberbezpieczeństwa są ograniczone. Odmowa dostępu ≠ awaria skillu — zgłoś ją wprost i przejdź do trybu zastępczego.

---

## Project Overview

MV-DESIGN-PRO is a professional Medium Voltage (MV) network design and analysis system for the power industry. It provides tools for network modeling, short circuit calculations (IEC 60909), power flow analysis (Newton-Raphson, Gauss-Seidel, Fast Decoupled), protection coordination, and proof generation with full OZE (renewable energy) integration.

The system is architecturally aligned with **DIgSILENT PowerFactory** principles:
- One explicit Network Model per project (singleton)
- Multiple Study Cases (calculation scenarios)
- WHITE BOX calculations (all intermediate values auditable)
- No fictional entities in solvers
- Strict layer separation (Solver vs Analysis vs Application vs Presentation)

## Technology Stack

### Backend (Python 3.11+)
- **Framework**: FastAPI
- **Package Manager**: Poetry
- **Core Dependencies**: numpy, scipy, networkx, pydantic, pandas
- **Databases**: PostgreSQL (asyncpg/psycopg), MongoDB (motor), Redis
- **Task Queue**: Celery
- **HTTP Client**: httpx
- **Export**: reportlab (PDF), python-docx (DOCX)
- **Testing**: pytest, pytest-asyncio, pytest-cov
- **Linting/Formatting**: black (line-length 100), ruff (E, F, W, I, N, UP, B, C4), mypy (strict)

### Frontend (TypeScript 5 / React 18)
- **Build Tool**: Vite 5
- **State Management**: Zustand
- **Data Fetching**: @tanstack/react-query
- **Forms**: react-hook-form with zod validation
- **Styling**: Tailwind CSS, tailwind-merge, clsx
- **Math Rendering**: KaTeX
- **Charts**: Recharts
- **PDF Export**: html2canvas + jspdf
- **Routing**: react-router-dom
- **Testing**: Vitest (unit), @testing-library/react (components), Playwright (e2e)
- **Node.js**: >=18.0.0 (CI uses Node 20)

## Project Structure

```
MV-Design-PRO/
├── .github/workflows/            # CI/CD pipelines (9 workflows — see "CI/CD Pipelines" below)
│   ├── python-tests.yml          # Backend tests + Python guards
│   ├── frontend-checks.yml       # Frontend tests, lint, type-check + guards
│   ├── sld-determinism.yml       # SLD contract tests + render artifacts
│   ├── docs-guard.yml            # Documentation integrity checks
│   ├── arch-guard.yml            # Architecture layer + repo hygiene guards
│   ├── p0-extended-guards.yml    # V12K invariant guards
│   ├── physics-label-guard.yml   # Catalog-first physics field guard
│   ├── frontend-e2e-smoke.yml    # Critical-path Playwright e2e (real backend)
│   └── frontend-e2e-full.yml     # Full Playwright e2e suite (real backend)
├── docs/                         # Root-level documentation index
│   ├── INDEX.md                  # UI documentation index
│   ├── ui/                       # UI contracts (root-level)
│   ├── sld/                      # SLD layout contracts
│   └── system/                   # System-level docs
│   # Detailed audit reports + execution plans live under mv-design-pro/docs/audit/ and mv-design-pro/docs/plan/
├── mv-design-pro/                # Main application
│   ├── SYSTEM_SPEC.md            # Executive overview + navigation hub (BINDING, v4.1)
│   ├── AGENTS.md                 # Agent governance rules (BINDING, v4.3)
│   ├── ARCHITECTURE.md           # Technical architecture reference (BINDING, v4.0)
│   ├── PLANS.md                  # Operational status & next steps (LIVING, v5.1)
│   ├── docker-compose.yml        # 6 services: backend, frontend, postgres, mongodb, redis, celery
│   ├── backend/
│   │   ├── pyproject.toml        # Poetry configuration
│   │   ├── Dockerfile
│   │   ├── src/
│   │   │   ├── api/              # FastAPI endpoints (15+ modules)
│   │   │   ├── analysis/         # Interpretation layer (NO physics)
│   │   │   │   ├── boundary/     # Boundary identification
│   │   │   │   ├── coverage_score/
│   │   │   │   ├── energy_validation/
│   │   │   │   ├── lf_sensitivity/
│   │   │   │   ├── normative/
│   │   │   │   ├── power_flow/
│   │   │   │   ├── power_flow_interpretation/
│   │   │   │   ├── protection_curves_it/
│   │   │   │   ├── protection_insight/
│   │   │   │   ├── recommendations/
│   │   │   │   ├── reporting/    # PDF report generation
│   │   │   │   ├── scenario_comparison/
│   │   │   │   ├── sensitivity/
│   │   │   │   └── voltage_profile/
│   │   │   ├── application/      # Application layer (NO physics)
│   │   │   │   ├── active_case/  # Active case management
│   │   │   │   ├── analyses/     # Analysis execution services
│   │   │   │   ├── analysis_dispatch/
│   │   │   │   ├── analysis_run/
│   │   │   │   ├── designer/     # Designer/Wizard engine
│   │   │   │   ├── equipment_proof/
│   │   │   │   ├── network_model/# Single model management
│   │   │   │   ├── network_wizard/
│   │   │   │   ├── project_archive/
│   │   │   │   ├── reference_patterns/
│   │   │   │   ├── sld/          # SLD layout, overlay, integration
│   │   │   │   ├── study_case/
│   │   │   │   ├── wizard_actions/
│   │   │   │   └── wizard_runtime/
│   │   │   ├── compliance/       # IEC normative compliance checks
│   │   │   ├── diagnostics/      # Diagnostic utilities
│   │   │   ├── domain/           # Domain models (mutation allowed HERE ONLY)
│   │   │   ├── enm/              # Energy Network Model (API, topology, validator)
│   │   │   ├── infrastructure/   # Persistence (repositories), external services
│   │   │   ├── network_model/    # Core network model
│   │   │   │   ├── core/         # Bus, Branch, Switch, Source, Load, Graph, Snapshot, Station
│   │   │   │   ├── catalog/      # Type library (immutable types, resolver, governance)
│   │   │   │   ├── solvers/      # Physics calculations (WHITE BOX)
│   │   │   │   │   ├── short_circuit_iec60909.py
│   │   │   │   │   ├── power_flow_newton.py
│   │   │   │   │   ├── power_flow_gauss_seidel.py
│   │   │   │   │   └── power_flow_fast_decoupled.py
│   │   │   │   ├── validation/   # NetworkValidator, rules, constraints
│   │   │   │   └── whitebox/     # Calculation trace utilities
│   │   │   ├── protection/       # Protection domain (NOT a solver)
│   │   │   ├── solver_input/     # Solver input preparation, contracts, eligibility
│   │   │   ├── solvers/          # Solver wrapper/dispatcher layer
│   │   │   └── whitebox/         # Stub (realny proof engine: application/proof_engine/)
│   │   ├── tests/                # Backend tests (1600+ tests)
│   │   │   ├── conftest.py
│   │   │   ├── analysis/         # Analysis layer tests
│   │   │   ├── api/              # API endpoint tests
│   │   │   ├── application/      # Application layer tests
│   │   │   ├── ci/               # CI guard validation tests
│   │   │   ├── domain/           # Domain model tests
│   │   │   ├── e2e/              # End-to-end workflow tests
│   │   │   ├── enm/              # ENM model tests
│   │   │   ├── golden/           # Golden network fixtures
│   │   │   ├── infrastructure/   # Persistence tests
│   │   │   ├── network_model/    # Network model & catalog tests
│   │   │   ├── proof_engine/     # Proof engine tests
│   │   │   ├── reference_networks/ # Reference network builders
│   │   │   └── utils/            # Test utilities (determinism helpers)
│   │   └── schemas/              # JSON schemas (resultset_v1_schema.json)
│   ├── frontend/
│   │   ├── package.json
│   │   ├── tsconfig.json         # Strict mode, ES2020, noUnusedLocals/Parameters
│   │   ├── vite.config.ts        # Vitest config embedded (jsdom, globals)
│   │   ├── tailwind.config.js
│   │   ├── src/
│   │   │   ├── App.tsx           # Root React component
│   │   │   ├── main.tsx          # Entry point
│   │   │   ├── engine/           # Algorithm engines
│   │   │   │   └── sld-layout/   # SLD auto-layout engine (7-phase pipeline)
│   │   │   ├── types/            # Shared TypeScript type definitions
│   │   │   ├── test/             # Test infrastructure (setup.ts)
│   │   │   ├── ui/               # React components — 56 modulow (stan zmierzony, pin: scripts/claude_md_struktura_guard.py)
│   │   │   │   ├── analysis-eligibility/  # Wynik pre-kontroli analizy
│   │   │   │   ├── app-state/             # Globalny store Zustand
│   │   │   │   ├── audit/                 # Narzedzia audytowe
│   │   │   │   ├── canon/                 # Narzedzia postaci kanonicznej
│   │   │   │   ├── catalog/               # Przegladarka biblioteki typow
│   │   │   │   ├── common/                # Wspolne
│   │   │   │   ├── comparison/            # Modul porownania
│   │   │   │   ├── config/                # Konfiguracja
│   │   │   │   ├── context-menu/          # Akcje menu kontekstowego
│   │   │   │   ├── contracts/             # Definicje kontraktow API
│   │   │   │   ├── data-manager/          # Panel zarzadzania danymi
│   │   │   │   ├── engineering-readiness/ # Bramka gotowosci inzynierskiej
│   │   │   │   ├── enm-inspector/         # Inspektor modelu ENM
│   │   │   │   ├── fault-scenarios/       # Konfiguracja scenariuszy zwarciowych
│   │   │   │   ├── field/                 # Komponenty pol formularza
│   │   │   │   ├── help/                  # Pomoc kontekstowa
│   │   │   │   ├── history/               # Cofnij/ponow
│   │   │   │   ├── icons/                 # Definicje ikon
│   │   │   │   ├── inspector/             # Inspektor ogolny
│   │   │   │   ├── issue-panel/           # Panel bledow walidacji
│   │   │   │   ├── mode-gate/             # Bramkowanie trybu eksperckiego
│   │   │   │   ├── navigation/            # Nawigacja aplikacji
│   │   │   │   ├── ncrfg-tests/           # Testy zgodnosci NC RfG
│   │   │   │   ├── network-build/         # Narzedzia budowy sieci
│   │   │   │   ├── notifications/         # Powiadomienia
│   │   │   │   ├── onboarding/            # Wdrozenie uzytkownika
│   │   │   │   ├── power-distribution/    # Analiza rozdzialu mocy
│   │   │   │   ├── power-flow-comparison/ # Porownanie A/B rozplywu
│   │   │   │   ├── power-flow-results/    # Wyniki rozplywu mocy
│   │   │   │   ├── project-archive/       # Import/eksport projektu (ZIP)
│   │   │   │   ├── projects/              # Lista i zarzadzanie projektami
│   │   │   │   ├── proof/                 # Prezentacja pakietu dowodowego
│   │   │   │   ├── property-grid/         # Edytor wlasciwosci elementu
│   │   │   │   ├── protection/            # Przegladarka biblioteki zabezpieczen
│   │   │   │   ├── protection-comparison/ # Porownanie A/B zabezpieczen
│   │   │   │   ├── protection-coordination/ # Wykresy TCC, koordynacja
│   │   │   │   ├── protection-curves/     # Rysowanie krzywych zabezpieczen
│   │   │   │   ├── reference-networks/    # Sieci referencyjne (fikstury)
│   │   │   │   ├── reference-patterns/    # Wzorce sieci referencyjnych
│   │   │   │   ├── reports/               # Raporty
│   │   │   │   ├── results/               # Modul wynikow
│   │   │   │   ├── results-inspector/     # Inspektor szczegolow wyniku
│   │   │   │   ├── schema-completeness/   # Kompletnosc schematu
│   │   │   │   ├── selection/             # Zaznaczenie elementow
│   │   │   │   ├── settings/              # Ustawienia
│   │   │   │   ├── shared/                # Wspoldzielone
│   │   │   │   ├── shell/                 # Komponenty powloki
│   │   │   │   ├── sld/          # Schemat jednokreskowy (kanwa v2/v3, sedno produktu)
│   │   │   │   │   ├── canonical_symbols/
│   │   │   │   │   ├── core/
│   │   │   │   │   ├── export/
│   │   │   │   │   ├── reference/
│   │   │   │   │   ├── shared/
│   │   │   │   │   ├── v2/
│   │   │   │   │   ├── v3/
│   │   │   │   ├── sld-editor/            # Edycja SLD (geometria CAD, przeciaganie, trasowanie)
│   │   │   │   ├── sld-overlay/           # Nakladka wynikow na SLD
│   │   │   │   ├── status-bar/            # Pasek stanu
│   │   │   │   ├── study-cases/           # Menedzer przypadkow obliczeniowych
│   │   │   │   ├── tech-card/             # Karta techniczna elementu
│   │   │   │   ├── topology/              # Drzewo topologii
│   │   │   │   ├── voltage-profile/       # Wykresy profilu napiecia
│   │   │   │   ├── workspace/             # Zarzadzanie przestrzenia robocza
│   │   │   └── ui2/              # Warstwa UI programu 2026-07 — 18 modulow (tu toczy sie biezaca praca)
│   │   │       ├── adapters/          # Adaptery do kontraktow backendu
│   │   │       ├── events/            # Szyna zdarzen
│   │   │       ├── freshness/         # Znaczniki swiezosci wynikow
│   │   │       ├── inspector/         # Inspektor ui2
│   │   │       ├── kreatory/          # Kreatory (stacja, pole SN, zrodlo OZE, pierscien)
│   │   │       ├── kryteria/          # Kryteria oceny
│   │   │       ├── legacy/            # Mosty do warstwy ui/
│   │   │       ├── model/             # Warstwa modelu ui2
│   │   │       ├── nav/               # Nawigacja etapow E1-E8
│   │   │       ├── oze/               # Strumien OZE (krzywe, LOM, zgodnosc NC RfG)
│   │   │       ├── proces/            # Kanon etapow E1-E8: mapa procesu + nastepna najlepsza akcja
│   │   │       ├── referencje/        # Referencje katalogowe
│   │   │       ├── search/            # Wyszukiwanie
│   │   │       ├── shared/            # Wspoldzielone komponenty ui2 (tabela edytowalna)
│   │   │       ├── shell/             # Powloka ui2 (chrom, doki, store powloki)
│   │   │       ├── spaces/            # Przestrzenie pracy (projekt, model, analizy)
│   │   │       ├── theme/             # Motyw i tokeny
│   │   │       ├── wyniki/            # Ekrany wynikow (rozplyw, zwarcia, porownanie, estymacja, skladowe)
│   │   └── e2e/                  # Playwright end-to-end tests
│   ├── scripts/                  # CI/CD guard scripts (64+ scripts)
│   └── docs/                     # Detailed documentation (150+ files)
│       ├── spec/                 # DETAILED SPECIFICATION (18 chapters + supplements - SOURCE OF TRUTH)
│       ├── ui/                   # UI contracts (35+ canonical contracts)
│       ├── proof_engine/         # Proof Pack specifications
│       ├── analysis/             # Analysis specifications
│       ├── adr/                  # Architecture Decision Records (15+)
│       ├── sld/                  # SLD specifications
│       ├── protection/           # Protection specifications
│       ├── domain/               # Domain model specs
│       ├── export/               # Export specifications
│       ├── audit/                # Audit reports, historical exec plans
│       ├── prompts/              # AI prompt engineering templates
│       └── tests/                # Test specifications (golden networks)
```

## Document Hierarchy (BINDING)

Authority order (highest first). Updated 2026-05-13 per conflict resolution V12K-001 (see `mv-design-pro/docs/v12xx/REJESTR_KONFLIKTOW.md`):

| Priority | Document | Purpose |
|----------|----------|---------|
| 1 | `mv-design-pro/docs/v12xx/KANON_V12_XX.md` + registries/matrices | **V12.xx canon — SOURCE OF TRUTH** (frozen 2026-04-24) |
| 2 | `mv-design-pro/docs/system/SPEC_*.md` (6 binding specs) | V12.5 binding system specs (catalog/model/operations/readiness/results/types) |
| 3 | `mv-design-pro/docs/domain/*.md` + `docs/sld/SLD_CONTRACT_FLOW_V1.md` + `SLD_SEMANTIC_MODEL_CANONICAL_V1.md` | Active operational & semantic contracts |
| 4 | `mv-design-pro/SYSTEM_SPEC.md` | Executive overview + navigation hub |
| 5 | `mv-design-pro/ARCHITECTURE.md` | Technical architecture reference |
| 6 | `mv-design-pro/AGENTS.md` | Agent governance rules |
| 7 | `mv-design-pro/PLANS.md` | Operational status & next steps (LIVING) |
| 8 | `mv-design-pro/docs/INDEX.md` + `INDEX_KANONICZNY.md` | Active canon indexes |
| 9 | `mv-design-pro/docs/spec/SPEC_CHAPTER_*.md` (18 chapters) | ARCHIVAL — V11 reference for spec-vs-code audit. All 28 files marked "Historical note (V12.5)". |
| 10 | `mv-design-pro/docs/audit/archive/` + `historical_execplans/` | ARCHIVE (closed audits, ExecPlans) |

Note: `POWERFACTORY_COMPLIANCE.md` was removed in the V12.5.1 hard cut (2026-04-21); PowerFactory/catalog compliance guidance now lives in `mv-design-pro/docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md` (priority 2 above).

In case of conflict: higher priority wins. Conflicts must be recorded in `docs/v12xx/REJESTR_KONFLIKTOW.md`. The latest canon documents (DOC_INVENTORY_2026-05, AUDYT_BRAKI_2026-05, PLAN_E2E_INDUSTRIAL_2026-05, SLD_INDUSTRIAL_SPEC_v1) live under `mv-design-pro/docs/audit/` and `mv-design-pro/docs/plan/` and `mv-design-pro/docs/sld/`.

Active operational programs (2026-07, subordinate to the canon above): `mv-design-pro/docs/uiux/PROGRAM_UIUX_2026-07.md` (UI/UX rebuild, with the BINDING functional inventory `docs/uiux/INWENTARZ_FUNKCJI_2026-07.md`), `mv-design-pro/docs/plan/PLAN_SLD_REWORK.md` (SLD — separate thread), `mv-design-pro/docs/plan/PLAN_PRZEBUDOWY_10X_2026-07.md` (engineering 10x). See "Active programs" in Project Status below.

## Architecture Layer Boundaries (CRITICAL)

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│  - Frontend, Reports, Export                                 │
│  NO physics, NO model mutation                               │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                         │
│  - Wizard (edit controller)                                  │
│  - SLD (visualization)                                       │
│  - Validation (pre-check)                                    │
│  NO physics calculations                                     │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      DOMAIN LAYER                            │
│  - NetworkModel (Bus, Branch, Switch, Source, Load)          │
│  - ENM (Energy Network Model)                                │
│  - Catalog (Type Library - immutable)                        │
│  - Case (Study Cases)                                        │
│  Model mutation allowed HERE ONLY                            │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                      SOLVER LAYER                            │
│  - IEC 60909 Short Circuit                                   │
│  - Newton-Raphson Power Flow                                 │
│  - Gauss-Seidel Power Flow                                   │
│  - Fast Decoupled Power Flow                                 │
│  - Fault Scenario Executor                                   │
│  PHYSICS HERE ONLY, WHITE BOX REQUIRED                       │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                     ANALYSIS LAYER                           │
│  - Protection Analysis / Insight / Curves                    │
│  - Voltage Profile / Sensitivity                             │
│  - Boundary Identification                                   │
│  - Coverage Score / Normative Compliance                     │
│  - Scenario Comparison / Recommendations                     │
│  INTERPRETATION ONLY, NO physics                             │
└─────────────────────────────────────────────────────────────┘
```

## Core Rules (IMMUTABLE)

### 1. NOT-A-SOLVER Rule
Only dedicated solvers in `network_model/solvers/` compute physics. These components **CANNOT** contain physics calculations:
- Protection, Frontend, Reporting, Wizard, SLD, Validation, Proof Engine, Analysis

### 2. WHITE BOX Rule
All solvers **MUST**:
- Expose all calculation steps
- Provide intermediate values (Y-bus matrix, Z-thevenin, Jacobian, etc.)
- Allow numerical audit
- Document assumptions

**Forbidden**: Black-box solvers, hidden corrections, undocumented simplifications.

### 3. Single Model Rule
- **ONE NetworkModel** per project (singleton)
- Wizard and SLD edit **THE SAME** model instance
- No shadow models, no duplicate data stores

### 4. Case Immutability Rule
- Case **CANNOT mutate** NetworkModel
- Case stores **ONLY** calculation parameters (configuration)
- Multiple Cases reference one Model (read-only view)
- Model change invalidates ALL case results

### 5. BoundaryNode Prohibition Rule
- **BoundaryNode is NOT in NetworkModel** (it's interpretation, not physics)
- BoundaryNode belongs ONLY in the Analysis/Interpretation layer (BoundaryIdentifier)

### 6. Frozen Result API Rule
- ShortCircuitResult and PowerFlowResult APIs are **FROZEN**
- Changes require major version bump
- Proof Engine reads results READ-ONLY

### 7. Determinism Rule
- Same input **MUST** produce identical output
- Solver results, proof documents, exports must be deterministic
- SHA-256 fingerprints must be stable

### 8. No Codenames in UI
Project codenames (P7, P11, P14, P17, P20, etc.) must **NEVER** appear in:
- UI-visible strings
- Exports
- Test artifacts

Use Polish labels instead. Enforced by `scripts/no_codenames_guard.py`.

### 9. No Heuristics in Solvers
Load flow and protection solvers must NOT apply heuristics, guesses, or undocumented corrections. Enforced by `scripts/load_flow_no_heuristics_guard.py` and `scripts/protection_no_heuristics_guard.py`.

### 10. Catalog Binding Rule
All network elements must reference catalog types. Direct parameter injection bypassing the catalog is forbidden. Enforced by `scripts/catalog_binding_guard.py`, `catalog_enforcement_guard.py`, `catalog_gate_guard.py`.

## Development Commands

### Backend
```bash
cd mv-design-pro/backend

# Install dependencies
poetry install --with dev

# Run tests
poetry run pytest -q

# Run specific test file
poetry run pytest tests/test_short_circuit_iec60909.py -v

# Run specific test directory
poetry run pytest tests/proof_engine/ -v

# Run linting
poetry run black src tests
poetry run ruff check src tests
poetry run mypy src

# Run server (development)
poetry run uvicorn src.api.main:app --reload --port 8000
```

### Frontend
```bash
cd mv-design-pro/frontend

# Install dependencies
npm ci            # preferred (deterministic)
npm install       # alternative

# Run tests (--no-file-parallelism is required)
npm test
# Equivalent: vitest run --no-file-parallelism

# Run tests for CI
npm run test:ci

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run e2e tests (Playwright, mock backend)
npm run test:e2e

# Run e2e against real backend (critical path)
npm run test:e2e:real

# Set up Playwright dependencies
npm run test:e2e:setup

# E2E with UI debugger
npm run test:e2e:ui

# Bootstrap e2e (npm ci + setup)
npm run test:e2e:bootstrap

# Full e2e bootstrap with real backend
npm run test:e2e:setup:real

# Type checking
npm run type-check

# Linting
npm run lint

# Build (runs tsc then vite build)
npm run build

# Development server (port 5173, proxies /api to backend)
npm run dev

# No-codenames guard check
npm run guard:codenames
```

### Docker (6 services)
```bash
cd mv-design-pro

# Start all services (backend:18000, frontend:3000, postgres:5432, mongodb:27017, redis:6379, celery)
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

### Guard Scripts (64+ total)
```bash
cd mv-design-pro

# Architecture & domain integrity
python scripts/arch_guard.py                      # Architecture layer boundaries
python scripts/pcc_zero_guard.py                  # Prevent PCC in NetworkModel
python scripts/domain_no_guessing_guard.py        # Domain model validation
python scripts/solver_boundary_guard.py           # Solver layer isolation
python scripts/solver_diff_guard.py               # Solver output diff guard
python scripts/active_public_layer.py             # Active/public layer separation

# Operations & canonicalization
python scripts/canonical_ops_guard.py             # Canonical operations check
python scripts/readiness_codes_guard.py           # Readiness gate validation
python scripts/audit_contract_guard.py            # Audit contract compliance
python scripts/api_lifecycle_guard.py             # API lifecycle enforcement

# Catalog guards
python scripts/catalog_binding_guard.py           # Catalog binding enforcement
python scripts/catalog_enforcement_guard.py       # Catalog usage enforcement
python scripts/catalog_gate_guard.py              # Catalog gate checks
python scripts/catalog_metadata_guard.py          # Catalog metadata validation
python scripts/transformer_catalog_voltage_guard.py # Transformer catalog voltage

# UI / UX guards
python scripts/no_codenames_guard.py              # Block codenames in UI strings
python scripts/test_no_codenames_guard.py         # Block codenames in test artifacts
python scripts/forbidden_ui_terms_guard.py        # Block forbidden UI terminology
python scripts/ui_terminology_guard.py            # UI terminology validation
python scripts/dead_click_guard.py                # Detect dead/unhandled UI actions
python scripts/fix_action_completeness_guard.py   # Fix action completeness
python scripts/dialog_completeness_guard.py       # Dialog contract completeness
python scripts/nn_source_menu_guard.py            # Source menu guard
python scripts/guard_ux_flow_v1.py                # UX flow v1 compliance
python scripts/interaction_matrix_guard.py        # Interaction matrix validation
python scripts/ui_no_physics_guard.py             # No network physics in ui2/** presentation layer

# Physics separation guards
python scripts/overlay_no_physics_guard.py        # Overlay layer physics prohibition
python scripts/physics_label_guard.py             # Physics label validation
python scripts/trace_ui_leak_guard.py             # Prevent trace data leaking to UI
python scripts/load_flow_no_heuristics_guard.py   # No heuristics in load flow
python scripts/protection_no_heuristics_guard.py  # No heuristics in protection
python scripts/no_direct_fault_params_guard.py    # No direct fault param injection

# SLD & determinism guards
python scripts/sld_determinism_guards.py          # SLD rendering determinism
python scripts/trace_determinism_guard.py         # Trace output determinism
python scripts/fault_scenarios_determinism_guard.py # Fault scenario determinism

# Schema guards
python scripts/resultset_v1_schema_guard.py       # ResultSet v1 schema compliance
python scripts/severity_contract_guard.py         # Severity contract enforcement

# Legacy & compatibility guards
python scripts/legacy_public_path_guard.py        # Legacy path detection
python scripts/v12xx_canon_guard.py               # v12.xx canonical form guard
python scripts/reference_networks_guard.py        # Reference network validation

# Repository & quality guards
python scripts/docs_guard.py                      # Documentation integrity
python scripts/local_truth_guard.py               # Local vs remote consistency
python scripts/docs_archive_guard.py              # Documentation archive validation
python scripts/repo_hygiene_guard.py              # Repository cleanliness
python scripts/grep_zero_guard.py                 # Zero-occurrence grep checks
python scripts/import_graph_guard.py              # Import dependency graph analysis
python scripts/vulture_guard.py                   # Dead code detection
python scripts/utf8_mojibake_guard.py             # UTF-8 encoding validation

# Testing & verification
python scripts/test_no_codenames_guard.py         # Test artifact codename check
python scripts/test_api_lifecycle_guard.py        # API lifecycle test validation
python scripts/test_interaction_matrix_guard.py   # Interaction matrix test validation
python scripts/test_legacy_public_path_guard.py   # Legacy path test validation
python scripts/test_reference_networks_guard.py   # Reference network test validation
python scripts/test_severity_contract_guard.py    # Severity contract test validation
python scripts/test_ui_terminology_guard.py       # UI terminology test validation
python scripts/test_utf8_mojibake_guard.py        # UTF-8 encoding test validation
python scripts/verify_v12_5.py                    # v12.5 verification suite
python scripts/verify_v12_5_1.py                  # v12.5.1 verification suite

# Scripts & utilities
python scripts/smoke_local.sh                     # Local smoke test
```

## CI/CD Pipelines

9 workflows in `.github/workflows/`, all on push and pull_request (`frontend-e2e-smoke.yml` and `frontend-e2e-full.yml` are path-filtered to `frontend/**` + `backend/**`):

| Workflow | File | What It Does |
|----------|------|-------------|
| Python tests | `python-tests.yml` | pytest + pcc_zero + domain_no_guessing + canonical_ops + readiness_codes + catalog_binding + catalog_gate + audit_contract + repo_hygiene guards |
| Frontend checks | `frontend-checks.yml` | type-check + lint + vitest + codenames + dialog_completeness + local_truth guards |
| SLD Determinism | `sld-determinism.yml` | Python SLD guards + SLD v2/v3 Vitest contract tests + render-odbiór acceptance |
| Docs Guard | `docs-guard.yml` | Documentation integrity check (broken links, PCC terms) |
| Architecture & Repo Hygiene | `arch-guard.yml` | arch_guard + repo_hygiene guards |
| P0 Extended Guards | `p0-extended-guards.yml` | V12K invariant guards (load_flow/protection heuristics, solver_boundary, overlay_no_physics, trace_determinism, fault_scenarios_determinism, ui_terminology, forbidden_ui_terms) |
| Physics Label Guard | `physics-label-guard.yml` | Catalog-first physics field guard for modals |
| Frontend E2E smoke | `frontend-e2e-smoke.yml` | Playwright e2e against the real backend (`npm run test:e2e:real`) |
| Frontend E2E full | `frontend-e2e-full.yml` | Full Playwright e2e suite against the real backend (`npm run test:e2e`, all `e2e/*.spec.ts`) |

## Code Style & Conventions

### Python
- Line length: 100 characters
- Formatter: black (`target-version = ['py311']`)
- Linter: ruff (rules: E, F, W, I, N, UP, B, C4; ignores: E501)
- Type hints required: mypy strict mode with pydantic plugin
- asyncio mode: auto (pytest-asyncio)
- Use frozen dataclasses for immutable result types

### TypeScript
- Strict mode enabled (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`)
- Target: ES2020, module: ESNext, JSX: react-jsx
- ESLint with React hooks + React refresh plugins
- Prefer zustand for state management
- Tests exclude pattern in tsconfig: `src/**/__tests__/**/*`

### Terminology
| Term | Definition | PowerFactory Equivalent |
|------|------------|------------------------|
| Bus | Electrical node (single potential) | Terminal |
| Line | Overhead line (explicit branch) | Line |
| Cable | Underground cable (explicit branch) | Cable |
| Transformer2W | Two-winding transformer | Transformer |
| Switch/Breaker | Switching device (no impedance) | Switch/Breaker |
| Source | External Grid / Generator / Inverter | External Grid |
| Load | Electrical load | Load |
| Station | Logical container (no physics) | Substation folder |
| Case | Calculation scenario | Study Case |
| Catalog | Type library (immutable) | Type Library |

**Forbidden Terms in Core Model**: PCC, Connection Point, Virtual Node, Aggregated Element, BoundaryNode

## Testing Guidelines

### Backend Tests (1600+ tests)
- Located in `mv-design-pro/backend/tests/`
- Use pytest with asyncio mode auto
- Mark integration tests with `@pytest.mark.integration`
- Key test areas:
  - `test_short_circuit_iec60909.py` - IEC 60909 SC solver
  - `test_power_flow_v2.py` - Power flow solver
  - `tests/proof_engine/` - All proof pack generation (SC3F, VDROP, Equipment, Protection, Earthing, Losses, LF Voltage)
  - `tests/enm/` - ENM model, topology, validation, golden network
  - `tests/e2e/` - Determinism workflows, export stability
  - `tests/api/` - API endpoint contract tests
  - `tests/golden/` - Golden network fixtures
  - `tests/ci/` - CI guard validation tests

### Frontend Tests (190+ test files)
- Unit tests with Vitest in `src/**/__tests__/`
- E2E tests with Playwright in `e2e/`
- Component tests use @testing-library/react
- Tests run with `--no-file-parallelism` (required for determinism)
- Test environment: jsdom with globals enabled
- Critical contract tests (run in SLD Determinism CI) — **spisane z
  `.github/workflows/sld-determinism.yml`, nie z pamięci** (korekta 2026-08-08:
  poprzednia lista wymieniała sześć plików w `sld/core/__tests__/`, z których
  **nie istniał ANI JEDEN** — ani tam, ani nigdzie w `src`; workflow nie
  uruchamia niczego z `sld/core/**`. Przy każdej zmianie tego workflowa
  aktualizuj tę listę, inaczej wróci fikcja):
  - `sld/v2/geometry/__tests__/layoutEngine.substrate.test.ts`
  - `sld/v2/geometry/__tests__/portAnchoredGeometry.substrate.test.ts`
  - `sld/v2/__tests__/{ViewportController,LodPolicy,renderers,StationInternalView}.test.ts(x)`
  - `sld/v2/command/__tests__/SldCommandService.test.ts` · `sld/v2/core/__tests__/ports.test.ts`
  - `sld/v3/scene/__tests__/{lodContinuity,buildScene.sheetRows,buildScene.gpzCollapsed,busbarLabelClearance}.test.ts`
  - `sld/v3/canvas/__tests__/{minSymbolSize,kadrTresci,toolbarLayout,tozsamoscEtykiet}.contract.test.ts(x)`
    oraz `gpzCollapsedExpand.test.tsx`
  - `sld/v3/layout/__tests__/sheetRows.test.ts` · `sld/v3/theme/__tests__/palette.test.ts`
  - SLD v3 render-odbiór acceptance: `npm run accept:sld-v3`
- Critical E2E (real backend): `e2e/critical-run-flow.spec.ts` via `npm run test:e2e:real`

## Proof Engine

The Proof Engine generates mathematical proofs from solver results:

### Key Concepts
- **TraceArtifact**: Immutable calculation trace from solvers
- **ProofDocument**: Formal mathematical proof
- **ProofStep**: Formula -> Data -> Substitution -> Result -> Unit verification
- **EquationRegistry**: Canonical equation definitions (LaTeX)

### Proof Pack Types
- SC3F (3-phase short circuit)
- VDROP (voltage drop)
- Equipment (thermal/dynamic withstand)
- Power Flow (load flow)
- Losses/Energy
- Protection (overcurrent)
- Earthing (ground fault)
- LF Voltage (load flow voltage)

### Invariants
- Solver untouched - Proof Engine does NOT modify solvers
- Determinism - same `run_id` produces identical output
- Pure interpretation - proofs generated from existing trace/result data
- LaTeX-only math - all formulas in block LaTeX `$$...$$`
- I_dyn and I_th mandatory in SC3F proofs

### Export Formats
- JSON (`proof.json`)
- LaTeX (`proof.tex`)
- PDF (`proof.pdf`)
- DOCX

## Project Status (as of 2026-07)

**Binding functional inventory:** `mv-design-pro/docs/uiux/INWENTARZ_FUNKCJI_2026-07.md` —
single source of truth for the solver/analysis/API/UI surface. Where this file's structure
snapshot (above) and the inventory differ, the inventory wins.

The system is fully functional with:
- 18 solver modules (IEC 60909 SC + machine SC, NR/GS/FD/unbalanced Power Flow, inverter/ZIP
  models, IEC 60364 fault loop, IEC 60255 protection, NC RfG/PTPiREE, FRT/HVRT, RMS stability,
  WLS state estimation, phase state SN, grid source preview, V12.6 academic)
- 8+ proof packs (SC3F, VDROP, Equipment, PF, Losses, Protection, Earthing, LF Voltage, V12.6 academic)
- 19 analysis modules (incl. Arc Flash, Grid Strength, Reactive Adequacy, SSCI, Sanity Bounds,
  Energy Validation — see inventory)
- Full frontend (63 UI modules): SLD editor, Results, Study Cases, Proof Inspector, Protection, NC RfG tests
- ~5,400 backend test functions; ~7,350 frontend tests (537 files); 79 guard scripts
- Project import/export (ZIP, deterministic, versioned), CAD geometry editing in SLD,
  PDF/DOCX report generation, ENM v1.0 (EnergyNetworkModel)

### Active programs (2026-07) — three programs, unified thread (2026-07-21)
1. **Program UI/UX klasy przemysłowej** (`mv-design-pro/docs/uiux/PROGRAM_UIUX_2026-07.md`,
   phases U0–U5; orchestration: `docs/uiux/PROMPT_ZARZADCA_FABLE_UIUX.md`).
   Branch: `claude/power-network-design-ui-ir91mv`.
2. **SLD rework F1–F5** (`mv-design-pro/docs/plan/PLAN_SLD_REWORK.md`) —
   `frontend/src/ui/sld/**`, `sld-editor/**`, `engine/sld-layout/**`.
3. **Engineering 10x program F0–F4** (`mv-design-pro/docs/plan/PLAN_PRZEBUDOWY_10X_2026-07.md`) —
   CI gates, auth/perimeter, concurrency, god-file containment.

**Twarda granica wątków ZNIESIONA (dyrektywa właściciela 2026-07-21: „twarda granica
wątków usunięta … działaj enduro end").** Jeden wątek prowadzi wszystkie trzy programy
end-to-end — wolno edytować `ui/sld/**`, `sld-editor/**`, `engine/sld-layout/**` oraz
warstwy 10x w tej samej sesji/PR. Nie ma już zakazu kolizji cross-thread ani obowiązku
kart koordynacyjnych między wątkami; łańcuch domykamy do ostatniego klika bez odkładania
zmian SLD/10x do „osobnego wątku". Rygor jakości bez zmian: pełna regresja właściwej
warstwy + guardy + determinizm + FROZEN/golden nietknięte przed scaleniem.
Historical K30 handoff: `mv-design-pro/docs/audit/K30_SESSION_HANDOFF_2026-05-16.md`.

## Common Tasks

### Adding a New Element Type
1. Check `docs/spec/` and `SYSTEM_SPEC.md` for allowed element types
2. Add to `network_model/core/`
3. Update ENM model if applicable (`src/enm/`)
4. Update NetworkValidator
5. Add SLD symbol mapping
6. Write tests

### Modifying Solver Output
1. **STOP** - Result APIs are FROZEN
2. Check if change requires version bump
3. Ensure WHITE BOX trace is maintained
4. Update ProofDocument mapping if needed
5. Verify determinism (SHA-256 fingerprints)

### Adding UI Feature
1. Review UI contracts in `mv-design-pro/docs/ui/`
2. Follow layer boundaries (no physics in UI)
3. Use Polish labels, no project codenames
4. Add tests (Vitest for unit, Playwright for e2e)
5. Run `npm run guard:codenames` and `scripts/forbidden_ui_terms_guard.py` to verify

### Working with Study Cases
- Cases store config only, not model data
- Model changes invalidate ALL case results
- Clone creates new case with NONE status (no results copied)
- Only ONE case active at a time

### Adding Catalog Types
1. Review `mv-design-pro/docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md` for catalog compliance rules
2. Add to `network_model/catalog/` (types are immutable once published)
3. Run catalog guards: `catalog_binding_guard.py`, `catalog_enforcement_guard.py`, `catalog_gate_guard.py`

### Running All Guards Locally
```bash
cd mv-design-pro

# Core architectural guards (critical)
python scripts/pcc_zero_guard.py
python scripts/domain_no_guessing_guard.py
python scripts/arch_guard.py
python scripts/solver_boundary_guard.py
python scripts/canonical_ops_guard.py

# UI & terminology guards
python scripts/no_codenames_guard.py
python scripts/forbidden_ui_terms_guard.py
python scripts/ui_terminology_guard.py
python scripts/dialog_completeness_guard.py
python scripts/dead_click_guard.py

# Catalog & binding guards
python scripts/catalog_binding_guard.py
python scripts/catalog_enforcement_guard.py
python scripts/catalog_gate_guard.py
python scripts/catalog_metadata_guard.py

# Physics & solver guards
python scripts/overlay_no_physics_guard.py
python scripts/load_flow_no_heuristics_guard.py
python scripts/protection_no_heuristics_guard.py
python scripts/trace_ui_leak_guard.py

# Determinism & trace guards
python scripts/sld_determinism_guards.py
python scripts/trace_determinism_guard.py
python scripts/fault_scenarios_determinism_guard.py
python scripts/resultset_v1_schema_guard.py

# Validation & contracts
python scripts/readiness_codes_guard.py
python scripts/audit_contract_guard.py
python scripts/api_lifecycle_guard.py
python scripts/severity_contract_guard.py
python scripts/reference_networks_guard.py

# Repository & code quality
python scripts/docs_guard.py
python scripts/local_truth_guard.py
python scripts/docs_archive_guard.py
python scripts/repo_hygiene_guard.py
python scripts/import_graph_guard.py
python scripts/vulture_guard.py
```

## Important Warnings

1. **NEVER** add PCC/BoundaryNode concepts to NetworkModel
2. **NEVER** add physics calculations to non-solver components
3. **NEVER** modify frozen Result APIs without version bump
4. **NEVER** create shadow/duplicate data models
5. **NEVER** bypass NetworkValidator before solver execution
6. **NEVER** use project codenames (P11, P14, etc.) in UI strings
7. **NEVER** apply heuristics or undocumented corrections in load flow or protection solvers
8. **NEVER** bypass catalog type binding (use catalog types, not direct parameter injection)
9. **ALWAYS** maintain WHITE BOX traceability in solvers
10. **ALWAYS** preserve deterministic behavior (same input = same output)
11. **ALWAYS** consult `docs/spec/` before architectural changes
12. **ALWAYS** run relevant guards before pushing changes
13. **ALWAYS** consult `docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md` when adding/modifying network model elements

## Zero-Debt Rule (BINDING — dyrektywa właściciela, 2026-07-17)

Każdy wykryty defekt, dług techniczny, bug lub brak naprawiasz **end-to-end,
od razu, bez pytania o pozwolenie** — dotyczy to również znalezisk ubocznych
(guard czerwony na HEAD, wykluczony test, martwy kod, nieaktualny dokument,
workflow CI, który nigdy się nie wykonał, niespójność danych szablonu).

Zasady wykonania:
1. **Wykluczenie ≠ naprawa.** Nie wolno maskować długu (exclude w konfigu
   testów, `continue-on-error`, skip, komentarz „do naprawy później").
   Nowe wykluczenie wymaga uzasadnienia w commicie i wpisu długu w execplanie.
   **Każdy NAPOTKANY błąd naprawiasz — także pre-existing, nie tylko własny
   (dyrektywa właściciela 2026-07-21: „masz naprawiać wszystkie napotkane
   błędy").** Błąd typów/lint/test/guard, który zobaczyłeś przy swojej pracy
   (nawet jeśli był w repo przed Twoją zmianą), naprawiasz u źródła w tej samej
   kolejce — nie wolno go pominąć argumentem „był wcześniej" ani „poza moim
   zakresem". Jedyny wyjątek to dług nienaprawialny w bieżącej sesji (pkt 4) —
   wtedy wpis do execplanu z pomiarem i planem, nigdy cicho.
2. **Naprawa u źródła.** Test czerwony z powodu regresji komponentu ⇒ napraw
   komponent, nie asercję. Test czerwony z powodu zmiany kanonu ⇒ przepisz
   test do obecnego kanonu z zachowaniem intencji (i zapisz intencję w
   komentarzu).
3. **Weryfikacja end-to-end przed commitem**: pełna regresja właściwego
   stosu, kody wyjścia łapane BEZPOŚREDNIO (nigdy `cmd | tail; echo $?` —
   pipe zwraca kod ostatniego członu); pętle oczekiwania bez samodopasowania
   `pgrep -f` (sentinel w pliku wyników zamiast wzorca tekstowego procesu).
4. **Dług nienaprawialny w bieżącej sesji** (wymaga decyzji produktowej,
   danych, których nie ma, albo przekracza sesję) — wpis do execplanu z
   pomiarem, przyczyną i planem, nigdy cicho.
5. **Test maskujący defekt produktu = dwa defekty** (dyrektywa właściciela,
   2026-07-17). Gdy test „przechodzi" tylko dzięki obejściu realnej ścieżki
   użytkownika (syntetyczny `dispatchEvent` zamiast natywnego klika,
   wymuszony stan store zamiast interakcji, sztuczny fixture omijający
   walidację) — naprawiasz OBA: defekt produktu u źródła ORAZ test, żeby
   ćwiczył realną ścieżkę (inaczej regresja naprawy będzie niewykrywalna).
   Precedens: martwy lewy klik w elementy kanwy SLD (capture-on-pointerdown
   przekierowywał click na tło) był latami niewidoczny, bo wszystkie specy
   klikały syntetycznie. Nowy test interakcji ZAWSZE zaczyna od ścieżki
   natywnej; syntetyczny event wymaga uzasadnienia w komentarzu.

## Reguła KLASA, NIE INSTANCJA (BINDING — wniosek z przeglądu 2026-08-01)

Przegląd kodu fali audytu (`docs/audit/PRZEGLAD_FALI_2026-08-01.md`) wykrył
**jeden błąd metodyczny powtórzony cztery razy w czterech niezależnych kartach**:
naprawiono INSTANCJĘ defektu nazwaną w audycie, a nie jego KLASĘ. Za każdym razem
zbiór, na którym działa nowy mechanizm, okazał się inny niż zbiór, na którym
powinien: rozdzielano szerzej niż doklejano z powrotem (wielomian ZIP), bramkowano
transformator, ale nie źródło nN ani aparat pola (brama katalogowa), blokowano
jeden z czterech cykli zapisu (współbieżność), wycofywano model, ale nie dziennik.
Wszystkie cztery przeszły pełną regresję, komplet guardów i iniekcje — bo iniekcje
sprawdzały ścieżkę, którą ktoś przewidział.

Dlatego każda karta naprawcza MUSI zawierać:

1. **Inwentarz klasy przed naprawą.** Wypisz WSZYSTKIE miejsca/ścieżki/elementy
   dzielące ten sam mechanizm — nie tylko to z audytu. Inwentarz idzie do meldunku
   i do wpisu rejestru. Miejsce świadomie zostawione poza naprawą wymaga
   uzasadnienia merytorycznego (nie „poza zakresem karty").
2. **Test jako ILOCZYN CECH, nie przykład z karty.** Nowe testy pokrywają iloczyn
   cech, w którym defekt mógłby się schować (np. „czułość częstotliwościowa ×
   generacja na szynie", „ten sam obiekt × awaria zapisu dziennika", „operacja A ×
   operacja B równolegle"), a nie tylko scenariusz opisany w karcie. Zanim uznasz
   pokrycie za wystarczające, wypisz cechy i sprawdź grepem, czy ich kombinacja
   występuje w testach.
3. **Predykaty parami.** Gdy kod dzieli zbiór na dwie części i składa je z powrotem
   (rozdziel/dołóż, zablokuj/zwolnij, zapisz/wycofaj), warunek WEJŚCIA i WYJŚCIA
   musi pochodzić z JEDNEGO źródła prawdy. Dwa niezależne warunki, które „dziś się
   zgadzają", są defektem oczekującym na dane brzegowe.
4. **Deklaracja bez testu = fałszywa pewność.** Każde mocne zdanie w docstringu,
   rejestrze albo dokumencie („operacja meldująca błąd nie zostawia żadnego skutku",
   „lista ZAMKNIĘTA — każde nowe miejsce to naruszenie") musi mieć PRZYPIĘTY test.
   Obietnica bez testu jest groźniejsza niż sam defekt, bo wyłącza czujność.
5. **Uczciwość w obrębie jednego pliku.** Jeśli karta zakazuje wzorca (zaszyty próg,
   ciche zero, domysł), przeszukaj CAŁY moduł, w którym pracujesz — zostawienie tego
   samego wzorca w sąsiedniej funkcji jest naruszeniem tej samej karty.

## Dyrektywy właściciela — projektowanie i wdrażanie (BINDING)

Skumulowane, wiążące zasady właściciela (dyrektywy 2026-07-17…19). Obowiązują
łącznie z Zero-Debt powyżej i kanonem V12.xx.

1. **Wizja globalna end-to-end (2026-07-19).** Każdy element planujesz i wdrażasz
   z wizją całego łańcucha — „do ostatniego klika w systemie": od kontraktu danych,
   przez backend, warstwę domenową i API, po UI i miejsce, GDZIE dane są dalej
   wykorzystywane (SLD, analizy, zabezpieczenia, raporty, oceny zgodności). Przed
   budową ustalasz: skąd dane pochodzą, jak się wiążą, gdzie spływają. Nigdy nie
   buduj wyspy — buduj ogniwo łańcucha.

2. **Opcja MAX, bez spłycania (2026-07-18).** Realizujesz maksymalny, kompletny
   zakres funkcji — bez skracania, upraszczania „na później", ukrywania opcji.
   „Wszystko, co potrzebne, rozbuduj". Kompletność wyprowadzasz z rzeczywistego
   kontraktu backendu/domeny (a nie z wygody UI).

3. **Zero fabrykacji (phantom rule).** Każda opcja/kontrolka UI MUSI mapować na
   realne pole/operację backendu. Kontrolka, którą backend ignoruje, jest zakazana
   (to „phantom"). Jeśli brakuje pokrycia w backendzie — rozbudowujesz backend
   (osobnym, przetestowanym krokiem), nie udajesz działania. Wynik liczbowy zawsze
   z solvera/backendu — ZERO fizyki w UI.

4. **Nigdy nic na potem — braki uzupełniasz end-to-end (2026-07-18).** Wykryty brak
   (zdolność bez dostawcy, brak powiązania, luka w łańcuchu) naprawiasz od razu, w
   tej samej kolejce. Rejestr „do zlecenia" nie jest poczekalnią.

5. **Audyt szerokiego grona ekspertów przed przebudową od zera (2026-07-18).** Dla
   zadań jakościowych („zadanie dla fable, opcja max") najpierw wielosoczewkowy
   audyt ekspercki (projektant sieci, zwarciowiec, zabezpieczenia, rozdzielnie,
   katalogi/Reference Engine, przyłączenia/OZE, UX/IA), potem projekt i wdrożenie.
   Wynik audytu zapisujesz jako wiążący dokument w `docs/uiux/`.

6. **FLOW projektanta — stare ekrany nie są kanoniczne (2026-07-18).** Projektujesz
   od etapu pracy inżyniera (E1–E8), wg kontraktu ekranu prowadzącego (cel jednym
   zdaniem · tor pracy z akcjami naprawczymi · uczciwe stany zerowe · jawny następny
   krok · język inżynierski: po co / z czego / co daje). Kanon V12.xx = rejestr
   ZDOLNOŚCI, nie ekranów; `componentKey` jest metadaną dostawcy (podmiana Opcja 1).
   Szczegóły: `mv-design-pro/docs/uiux/FLOW_PROJEKTANTA_2026-07.md`.

7. **Reużycie zamiast duplikacji.** Wykorzystujesz istniejącą infrastrukturę
   (szablony pól producentów / Reference Engine, gotowe pickery, kontrakty
   kreatora stacji), zamiast tworzyć równoległe rozwiązania. „Po to było robione,
   żeby to wykorzystać".

8. **Pokazuj ekrany do oceny po każdym etapie (2026-07-18).** Po każdym scalonym
   etapie UI publikujesz zrzuty ŻYWEJ aplikacji (oba motywy) na stałej stronie oceny
   i traktujesz uwagi z oględzin jako karty naprawcze.

9. **Rola: Fable zarządza, wykonawcy wykonują.** Piszesz karty z §0 rozstrzygnięć +
   bramkami, delegujesz do wykonawców (worktree, commit BEZ push), niezależnie
   weryfikujesz, cherry-pickujesz, uruchamiasz pełne potwierdzenia i pushujesz.
   Wyjątek: zadania jakościowe oznaczone „tylko dla fable / opcja max" robisz osobiście.

10. **Pełna autonomia.** Działasz jak architekt bez zatrzymywania: dzielisz zadania,
    zlecasz kolejne karty, nie pytasz o pozwolenie. Ulepszasz i usuwasz braki/dług/błędy
    aż do pełnego wdrożenia end-to-end. Myślisz jak inżynier projektujący sieci
    energetyczne. Wyjątek: realne rozstrzygnięcia produktowe (AskUserQuestion).

11. **Weryfikacja end-to-end przed scaleniem.** Zmiana warstwy → pełna regresja tej
    warstwy (backend pytest, frontend vitest), type-check, lint, właściwe guardy,
    determinizm/hash. Kontrakty FROZEN i determinizm nietknięte (nowe pola addytywne,
    `exclude_none`; seed bez zmian dla istniejących payloadów).

## Zasady inżynierskie (dyrektywa właściciela)

1. Nie dbaj o kompatybilność wsteczną. Co przestarzałe, to usuń na amen – bez warstw kompatybilności, bez migracji, bez fallbacków.
2. Wybierz najprostszą implementację, która spełnia bieżące potrzeby. Zero prewencyjnych abstrakcji, zero zbędnych warstw konfiguracyjnych.
3. Dziel system na warstwy, ale stopniowo. Najpierw uruchom minimalną wersję end-to-end, potem dodawaj. Nigdy nie rozwalaj działającej rzeczy dla niedokończonej złożoności.
4. Trzymaj komponenty modułowe, separuj odpowiedzialności.
5. Stawiaj na dojrzałe, utrzymywane biblioteki. Bez konkretnego powodu nie przepisuj od zera.
6. Najpierw sprawdź, co potrafią istniejące zależności w projekcie, zanim zaczniesz dodawać nowe pakiety czy pisać własne. Nie zakładaj z góry, że w bibliotekach niczego nie ma.
7. Podejmuj decyzje architektoniczne z myślą o przyszłości. Nie akceptuj prowizorek w stylu „na razie tak, potem zmienimy".
8. Sprawdź, jak dojrzałe produkty rozwiązują ten sam problem – korzystaj z zweryfikowanych wzorców, nie wymyślaj koła na nowo.

## Escalation

If any rule conflict is detected:
1. Stop implementation
2. Document conflict in PLANS.md
3. Request architectural review
4. Do not proceed until resolved

## Git Workflow

### Branch Naming
- `main` - stable, tested
- `develop` - integration
- `feature/*` - new features
- `refactor/*` - architectural changes
- `fix/*` - bug fixes
- `claude/*` - AI assistant branches

### PR Requirements
- Small, focused changes
- Reference to ExecPlan step (if applicable)
- Verification of compliance checklist
- WHITE BOX tests included for solver changes
- All 4 CI workflows must pass

## Quick Reference

| Action | Command |
|--------|---------|
| Run backend tests | `cd mv-design-pro/backend && poetry run pytest -q` |
| Run frontend tests | `cd mv-design-pro/frontend && npm test` |
| Run frontend tests (CI) | `cd mv-design-pro/frontend && npm run test:ci` |
| Run e2e tests | `cd mv-design-pro/frontend && npm run test:e2e` |
| Run e2e (real backend) | `cd mv-design-pro/frontend && npm run test:e2e:real` |
| Type check frontend | `cd mv-design-pro/frontend && npm run type-check` |
| Lint frontend | `cd mv-design-pro/frontend && npm run lint` |
| Lint Python | `cd mv-design-pro/backend && poetry run ruff check src` |
| Format Python | `cd mv-design-pro/backend && poetry run black src tests` |
| Check codenames | `cd mv-design-pro && python scripts/no_codenames_guard.py` |
| Check PCC guard | `cd mv-design-pro && python scripts/pcc_zero_guard.py` |
| Check catalog binding | `cd mv-design-pro && python scripts/catalog_binding_guard.py` |
| Check physics leaks | `cd mv-design-pro && python scripts/overlay_no_physics_guard.py` |
| Check docs guard | `cd mv-design-pro && python scripts/docs_guard.py` |
| Start dev servers | `cd mv-design-pro && docker-compose up -d` |
| Build frontend | `cd mv-design-pro/frontend && npm run build` |

# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
