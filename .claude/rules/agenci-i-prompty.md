# Agenci, oszczędność tokenów i pisanie promptów (BINDING)

<!-- Przeniesione z sekcji „Model i pisanie promptów" CLAUDE.md (karta CLAUDE-MD-ANTHROPIC,
     2026-11-11). Drzewo agentów i przydział modeli zostały w CLAUDE.md. Reguła bez `paths`:
     karty i prompty powstają poza repozytorium (scratchpad), więc reguła ładuje się zawsze. -->

## Oszczędność tokenów (wg dokumentacji Claude Code „Manage costs”)
- Wąskie karty z plikiem:linią zamiast szerokiego skanowania.
- Gadatliwe wyjścia (testy, logi, listy sesji) do pliku, do kontekstu tylko podsumowanie i kody wyjścia.
- Jeden pełny bieg regresji na końcu karty, nie po każdym kroku.
- Bezczynna sesja z dużym kontekstem nie jest wybudzana po wygaśnięciu pamięci podręcznej promptu
  (1 h) — kontynuację prowadzi nowa sesja z kartą i gałęzią jako stanem.
- Check-iny planowane rzadko (każdy niesie pełny kontekst).
- Workflowy i przeglądy adwersarzowe tylko dla zmian rdzenia i kart dużych.
- Okno autokompakcji 400 tys. tokenów (`autoCompactWindow` w `.claude/settings.json`, zamiast
  domyślnych ~967 tys.) — każde żądanie niesie mniejszy kontekst.

## Metody użycia agentów
Delegacja asynchroniczna, weryfikator ze świeżym kontekstem, meldunki ugruntowane w kodach
wyjścia, granice nazwane w karcie, karta bez listy kroków, wznawianie wykonawców zamiast
tworzenia nowych: `mv-design-pro/ORKIESTRACJA_AGENTOW.md` §3–§3a.

Kontrakt API modeli (Claude Fable, GPT-6 Astra: parametry, zakazy 400, caching, koszty,
wywołanie Codex CLI) jest w `mv-design-pro/docs/prompts/KONTRAKT_API_MODELI.md` — czytaj go,
gdy piszesz kod wywołujący API modelu albo prompt/skill dla niego.

## Reguły pisania promptów, kart i skilli w tym repo
- Podawaj cel, ograniczenia i kryterium ukończenia zamiast wyliczać kroki — rozpisany proces
  („krok 1, krok 2…") obniża jakość na obecnych modelach. Numerowana kolejność zostaje tylko
  tam, gdzie kolejność jest faktem (zależności, operacje nieodwracalne).
- Podaj **powód** zadania, nie tylko polecenie.
- Nazwij **granice**: kontrakty FROZEN, determinizm, fikstury e2e i cudze warstwy.
- Recenzent zewnętrzny (GPT-6 Astra) działa wg `mv-design-pro/docs/uiux/SKILL_GPT_RECENZENT.md`:
  nie wolno zacytować opinii GPT, której GPT nie wypowiedział — brak CLI albo klucza =
  recenzja własna, jawnie oznaczona.
