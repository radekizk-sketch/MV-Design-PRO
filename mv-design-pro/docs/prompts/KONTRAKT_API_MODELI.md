# Kontrakt API modeli — Claude Fable 5.1 i GPT-6 Astra

Przeniesione z `CLAUDE.md`: materiał referencyjny dla kodu, który wywołuje API modeli, i dla promptów pisanych pod te modele. Stan na 2026-09-04 (zweryfikuj z dokumentacją producenta przed użyciem w kodzie).

## 🤖 INSTRUKCJA MODELU — Claude Fable 5.1 (`claude-fable-5-1`)

Oficjalna dokumentacja: https://platform.claude.com/docs/en/about-claude/models/overview
Zakres sekcji: kontrakt API Claude Fable 5.1 — modelu, na który właściciel przełącza pracę po eskalacji z drzewa agentów (`CLAUDE.md`), oraz reguły pisania promptów pod ten model.
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
- **Fast Mode** — wyłącznie Opus 5, Opus 5.5 i Opus 4.8 na Claude API. Na Fable 5.1 nie istnieje.
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
- **Zwiększona wrażliwość na pliki kontekstowe** (`AGENTS.md`, `CLAUDE.md`, skille): sprzeczne instrukcje potrafią go zatrzymać albo zmienić kierunek. Po każdej zmianie tych plików sprawdź, czy nie powstała sprzeczność — rozstrzyga „Document Hierarchy" w `CLAUDE.md`.
- Domyślnie ciągnie do list i tabel; jeśli chcesz prozy, powiedz to wprost.
- Dostęp: na kontach Enterprise model bywa domyślnie wyłączony (włącza administrator), a zadania z ofensywnego cyberbezpieczeństwa są ograniczone. Odmowa dostępu ≠ awaria skillu — zgłoś ją wprost i przejdź do trybu zastępczego.

---
