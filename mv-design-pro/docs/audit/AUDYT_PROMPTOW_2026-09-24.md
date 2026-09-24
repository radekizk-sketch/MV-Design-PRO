> **Status: wdrożone 2026-09-24** (akceptacja właściciela: wszystkie pozycje). Pozycje L1–L2 — bez edycji zgodnie z zaleceniem raportu.

# Audyt promptów — MV-DESIGN-PRO (2026-09-24)

## Założenia (Krok 0)

- **Zakres:** cała powierzchnia promptów w repo (żądanie nie wskazywało pliku). Pełnym audytem
  objęte są pliki, które model Claude faktycznie dostaje jako instrukcję: `CLAUDE.md` (ładowany
  w każdej sesji), `mv-design-pro/docs/uiux/PROMPT_ZARZADCA_FABLE_UIUX.md` (wskazany w CLAUDE.md
  jako aktywny prompt orkiestracji), `mv-design-pro/ORKIESTRACJA_AGENTOW.md` (przywołany w ZASADZIE
  NR 3), `mv-design-pro/docs/uiux/SKILL_GPT_RECENZENT.md`,
  `mv-design-pro/skills/inzynier-elektrotechniki-sieci-dystrybucyjnych/SKILL.md`,
  `mv-design-pro/docs/prompts/PROMPT_FABLE_DOWODZI_OPUS_WYKONUJE_2026-07-29.md`.
- **Poza zakresem ustaleń:** datowane zapisy promptów w `docs/audits/*.prompt.md`,
  `docs/audit/**`, `tmp/` — to archiwum przebiegów, nie żywe instrukcje.
- **Model docelowy:** `claude-fable-5-1`. CLAUDE.md nazywa go modelem prowadzącym (sekcja z 2026-09-04).
  Ten audyt uruchomiono pod `claude-opus-5-5`; ustalenia dotyczące tylko Opusa 5.5 opisano osobno.
- **Znaczniki innego dostawcy (zapisane, bez propozycji zmiany dostawcy):** `AGENTS.md` (w katalogu głównym)
  i `mv-design-pro/AGENTS.md` §0 są pisane pod Codex / GPT-6 Astra; sekcja GPT w CLAUDE.md oraz
  prompt recenzji w SKILL_GPT_RECENZENT §5 są adresowane do GPT. Treści pisanej pod GPT nie oceniano
  według reguł Claude.
- **Kod wywołujący API:** brak. W repo nie ma importu `anthropic` ani `@anthropic-ai/sdk`, więc Grupa 4
  (konfiguracja żądań) jest pusta. Moduł `backend/src/application/symphony` renderuje szablon z `WORKFLOW.md`,
  ale tego pliku nie ma w repo, a sam moduł nie woła żadnego modelu.
- **Pochodzenie linii (provenance):** klon jest płytki (`^fd695649`, 2026-08-14), więc `git blame` sięga
  najdalej tego commita. Sekcję o modelu dopisał właściciel w commicie `7e84753a` (#473, 2026-09-04).

## Podsumowanie

| Grupa | Ustalenia | Wysoka | Średnia | Niska / tylko zgłoszenie |
|---|---|---|---|---|
| 1 — tekst promptu (sprzeczności, wzorce po migracji, skamieliny) | 9 | 3 | 5 | 1 |
| 2 — pliki skilli i reguł | 6 | 0 | 3 | 3 |
| 3 — opisy narzędzi | 0 | — | — | — |
| 4 — konfiguracja żądań | 0 | — | — | — |

Trzy ustalenia o największym wpływie:

1. **Na końcu `CLAUDE.md` doklejono ogólny szablon „CLAUDE.md" (linie 1171–1231), który przeczy
   regułom projektu.** Szablon mówi: „If you notice unrelated dead code, mention it – don't delete
   it”, „Don't refactor things that aren't broken”, „If uncertain, ask”. Te same zachowania
   wprost zakazują Zero-Debt pkt 1 („Każdy NAPOTKANY błąd naprawiasz… martwy kod”), ZASADA NR 3
   oraz Dyrektywa 10 („nie pytasz o pozwolenie”). Fable 5.1 wykonuje instrukcje dosłownie, więc
   przy dwóch sprzecznych wersjach albo się zatrzymuje, albo losowo wybiera jedną.
2. **Granica wątku SLD w `PROMPT_ZARZADCA_FABLE_UIUX.md`** („ZAKAZ zlecania zmian w `ui/sld/**` …
   bez wyjątków”) **przeczy `CLAUDE.md:862`**, gdzie granicę zniesiono 2026-07-21. Zarządca wklejony
   wprost z tego pliku zablokuje pracę, którą kanon każe wykonać.
3. **Sekcja „Escalation” (`CLAUDE.md:1125`)** każe zatrzymać pracę przy każdym konflikcie reguł
   i wpisać go do `PLANS.md`. To przeczy „JEDYNE DOZWOLONE ZATRZYMANIA” (`:19`) oraz regule, że
   konflikty trafiają do `REJESTR_KONFLIKTOW.md` (`:426`).

## Ustalenia (od najwyższej pewności)

### H1 — `CLAUDE.md:1171-1231` · Pewność: **wysoka** · Akcja: `remove`
- **Dowód:** `# CLAUDE.md … If you notice unrelated dead code, mention it - don't delete it. … Don't remove pre-existing dead code unless asked. … If uncertain, ask.`
- **Wzorzec:** 1d „Patch accretion” + lista zachowań pkt 8 (duplikaty, które się **nie zgadzają**) + Grupa 2 „Time-sensitive content / duplicated info”.
- **Dlaczego przestarzałe:** to ogólny blok doklejony do pliku (drugi nagłówek H1). Jego sens
  w projekcie już pokrywają „Zasady inżynierskie” 2–4 (prostota) i Zero-Debt pkt 3 (weryfikacja),
  a w trzech punktach mówi coś odwrotnego. Obecne modele traktują każde zdanie jako obowiązujące,
  więc sprzeczność daje zachowanie, którego nie da się przewidzieć.

### H2 — `mv-design-pro/docs/uiux/PROMPT_ZARZADCA_FABLE_UIUX.md:38,47-50,103,134-135` · Pewność: **wysoka** · Akcja: `rewrite`
- **Dowód:** `RÓWNOLEGŁY WĄTEK SLD … ZAKAZ zlecania zmian w frontend/src/ui/sld/** … Wykrycie kolizji plików → STOP.` oraz `Granica wątku SLD … bez wyjątków`.
- **Wzorzec:** 1d „Fossils” (reguła przeżyła decyzję, która ją uchyliła) + lista zachowań pkt 8 (duplikaty się nie zgadzają).
- **Dlaczego przestarzałe:** `CLAUDE.md:862-868` stoi wyżej w hierarchii i jest nowsze. Znosi granicę
  wątków i każde domykać SLD w tym samym wątku. Prompt zarządcy wkleja się jako pierwszą wiadomość
  sesji, więc w tej sesji jego zakaz wygrywa z kanonem.
- **Zamiana:** SLD należy do tego samego wątku, a werdykt wizualny zostaje przy właścicielu (B-02).
  Warunek eskalacji (b) zmienia się na STOP przy bramce B-02.

### H3 — `CLAUDE.md:1125-1131` · Pewność: **wysoka** · Akcja: `rewrite`
- **Dowód:** `1. Stop implementation 2. Document conflict in PLANS.md 3. Request architectural review 4. Do not proceed until resolved`
- **Wzorzec:** 1c „Padding / near-duplicate rules” w odmianie, gdzie duplikaty się nie zgadzają + 1d „Patch accretion”.
- **Dlaczego przestarzałe:** ta sama sytuacja ma w pliku trzy różne reguły: STOP i `PLANS.md` (`:1127`),
  wpis do `REJESTR_KONFLIKTOW.md` (`:426`) oraz „tylko B-01/B-02/bezpieczeństwo” (`:19`).
- **Zamiana:** konflikt rozstrzyga Document Hierarchy; wpis trafia do `REJESTR_KONFLIKTOW.md`;
  zatrzymanie następuje tylko przy B-01, B-02 i bramkach bezpieczeństwa albo gdy hierarchia nie rozstrzyga konfliktu.

### M1 — `CLAUDE.md:25-159` · Pewność: **średnia** · Akcja: `move` do `mv-design-pro/docs/prompts/KONTRAKT_API_MODELI.md`
- **Dowód:** tabele cen, nagłówki beta (`thinking-binding-controls-2026-08-01`, `server-side-fallback-2026-07-01`, …), limity kontekstu, zakazy parametrów, wywołanie Codex CLI.
- **Wzorzec:** Grupa 2 „Verbose SKILL.md…”, „Volatile specifics: API claims with no verification date”.
- **Dlaczego przestarzałe:** około 135 linii (~4 tys. tokenów) materiału referencyjnego API trafia do
  każdej sesji, choć w repo nie ma kodu, który woła API modelu (patrz Założenia). Model czyta
  opis własnego API przy każdym zadaniu z solverem albo UI. Takie dane starzeją się najszybciej,
  a już jedno zdanie jest nieaktualne: Fast Mode działa także na Opus 5.5 (`:108`); ta poprawka
  jest w diffie. W CLAUDE.md zostają reguły pisania promptów (`:100-105`), zasada recenzenta
  (`:122`) i wskaźnik do nowego dokumentu.
- **Uwaga:** sekcję dopisał właściciel (#473), więc przeniesienie jest propozycją do akceptacji.

### M2 — `CLAUDE.md:970` i `:874` · Pewność: **średnia** · Akcja: `rewrite`
- **Dowód:** `11. **ALWAYS** consult docs/spec/ before architectural changes` oraz `1. Check docs/spec/ and SYSTEM_SPEC.md for allowed element types`.
- **Wzorzec:** Grupa 2 „Volatile specifics” (twierdzenie niezgodne z repo).
- **Dlaczego przestarzałe:** `docs/spec/` ma w hierarchii (`:420`) status „ARCHIVAL — V11 reference”.
  Model zgodnie z tymi regułami bierze archiwum za źródło prawdy.
- **Zamiana:** `docs/v12xx/KANON_V12_XX.md` + `docs/system/SPEC_*.md`.

### M3 — `CLAUDE.md:1148` · Pewność: **średnia** · Akcja: `rewrite`
- **Dowód:** `- All 4 CI workflows must pass`. W repo jest 9 workflowów (`.github/workflows`, zgodnie z sekcją `:714`).
- **Wzorzec:** Grupa 2 „Volatile specifics”.

### M4 — `CLAUDE.md:7` · Pewność: **średnia** · Akcja: `rewrite`
- **Dowód:** `Pełny kanon: PROMPT_MV_DESIGN_PRO_PRZEBUDOWA.md (UWAGA: pliku NIE MA w repo …)`.
- **Wzorzec:** 1d „Fossils” / Grupa 2 „Volatile specifics”.
- **Dlaczego przestarzałe:** pierwsze zdanie reguł nadrzędnych wskazuje plik, którego nie ma, a potem odsyła
  do obejścia. Obecne modele sprawdzają wskazówki, więc każda sesja traci narzędzie na szukanie
  tego pliku. Obowiązujący kanon to Document Hierarchy.

### M5 — `CLAUDE.md:862-868` · Pewność: **średnia** · Akcja: `rewrite`
- **Dowód:** `Twarda granica wątków ZNIESIONA … Nie ma już zakazu kolizji cross-thread ani obowiązku kart koordynacyjnych`.
- **Wzorzec:** 1d „Migration-relative phrasing”.
- **Dlaczego przestarzałe:** tekst opisuje różnicę względem starej wersji reguły, której model nie widział,
  i przywołuje nieistniejącą alternatywę („zakaz kolizji”). Nowe brzmienie opisuje tylko obecną regułę.

### M6 — `CLAUDE.md:1099` · Pewność: **średnia** · Akcja: `rewrite`
- **Dowód:** `9. **Rola: Fable zarządza, wykonawcy wykonują.**`
- **Wzorzec:** Grupa 2 „History narratives: … pinned model names”.
- **Dlaczego przestarzałe:** reguła ma opisywać rolę, a nie model. Sesję może prowadzić inny model
  (np. ta sesja działa pod Opus 5.5) i wtedy nazwa „Fable” wskazuje złą rolę. Frazę triggerową
  właściciela („zadanie dla fable”, `:1078`) zostawiono, bo pełni funkcję routingu.

### M7 — `PROMPT_ZARZADCA_FABLE_UIUX.md:6` · Pewność: **średnia** · Akcja: `rewrite`
- **Dowód:** `Do wklejenia jako pierwsza wiadomość nowej sesji Fable (model claude-fable-5).`
- **Wzorzec:** 1d „Fossils”, przypięty model poprzedniej generacji.
- **Dlaczego przestarzałe:** kanon wskazuje `claude-fable-5-1`, a przypięcie modelu w promptcie
  zestarzeje się przy następnym wydaniu. Nowe brzmienie opisuje rolę bez nazwy modelu.

### M8 — `PROMPT_ZARZADCA_FABLE_UIUX.md:51-52` · Pewność: **średnia** · Akcja: `rewrite`
- **Dowód:** `Stan faktyczny wtyczek (2026-07-15): zainstalowana tylko wtyczka design. Wtyczki Codex/GPT BRAK`.
- **Wzorzec:** Grupa 2 „Time-sensitive content”.
- **Dlaczego przestarzałe:** to migawka stanu środowiska z datą. Punkt G1 już każe sprawdzać
  dostępność wtyczek, więc migawka tylko temu przeczy. Zamiana to odesłanie do G1.

### M9 — `PROMPT_ZARZADCA_FABLE_UIUX.md:129` · Pewność: **średnia** · Akcja: `rewrite`
- **Dowód:** `lista defektów odkrytych poza zakresem (zgłoszone, nie naprawione po cichu)`.
- **Wzorzec:** duplikat reguły, który się nie zgadza (lista zachowań pkt 8) z Zero-Debt pkt 1 w CLAUDE.md.
- **Zamiana:** defekt napotkany poza kartą jest naprawiony (hash commita) albo wpisany do execplanu
  z pomiarem i planem.

### M10 — `ORKIESTRACJA_AGENTOW.md:8` · Pewność: **średnia** · Akcja: `rewrite`
- **Dowód:** `Uwaga wykonawcza (2026-05-29): w bieżącym harnessie … Workflow … nie jest wystawione`.
- **Wzorzec:** 1d „Fossils” / Grupa 2 „Volatile specifics”.
- **Dlaczego przestarzałe:** obecny harness udostępnia narzędzie Workflow, ale tylko po jawnej
  zgodzie użytkownika (słowo `ultracode` albo prośba o workflow). Stara uwaga każe z niego
  nie korzystać, a nowa podaje prawdziwy warunek.

### M11 — `CLAUDE.md` (brak treści, przy `:104`) · Pewność: **średnia** · Akcja: `add`
- **Dowód:** CLAUDE.md sam zaleca (`:104`): „W długich sesjach agentowych dopisz sekcję o stylu
  komunikacji — bez niej meldunki gęstnieją do skrótów”. Plik nie ma takiej sekcji, a w repo
  działa kilkadziesiąt skrótów wewnętrznych (K-, H-, V12K-, E-).
- **Wzorzec:** lista zachowań pkt 11 („Re-baselining adds text too”); w przewodniku migracji
  Fable 5.1 opisuje to punkt o gęstości tekstu.
- **Dodatek:** trzy zdania o stylu meldunków (są w hunku M1).

### L1 — `CLAUDE.md:958-972` · Pewność: **niska** · Akcja: `flag`
Kapitaliki `NEVER/ALWAYS` ×13. Blok powtarza reguły, których uzasadnienie stoi w „Core Rules”,
więc jest świadomym podsumowaniem (lista zachowań pkt 10). Poza pkt 11 (M2) nie proponuję edycji.

### L2 — `CLAUDE.md:5-21` · Pewność: **niska** · Akcja: `flag`
Duża gęstość wersalików i znak ⛔. To jednak polityka właściciela z uzasadnieniem (zatrzymania
B-01/B-02, dług), czyli kategoria 1e „policy constraint”, a nie styl. Zostaje.

### L3 — `CLAUDE.md:628` vs `:849` · Pewność: **niska** · Akcja: `flag`
„Guard Scripts (64+ total)” stoi obok „79 guard scripts”; w katalogu jest 109 plików `*guard*.py`
(razem z testami). Liczby się rozjechały. Proponuję opisywać bez liczby albo przypiąć ją do guarda.

### L4 — `mv-design-pro/skills/…/SKILL.md` i `docs/uiux/SKILL_GPT_RECENZENT.md` · Pewność: **niska** · Akcja: `flag`
Oba pliki mają frontmatter skilla, ale nie leżą w `.claude/skills/`, więc Claude Code ich
nie odkrywa automatycznie. Są przywoływane tylko ścieżką. Treść jest czysta: kolejność analiz
w SKILL.md (bilans → spadki → obciążalność → zwarcia → zabezpieczenia → selektywność) wynika
z zależności obliczeniowych, więc numeracja jest uzasadniona (lista zachowań pkt 3).

### L5 — `PROMPT_ZARZADCA_FABLE_UIUX.md:22`, `CLAUDE.md:856` · Pewność: **niska** · Akcja: `flag`
Przypięta gałąź `claude/power-network-design-ui-ir91mv`. Program scalono do `main` w ramach K0
(PROMPT_FABLE_DOWODZI §1), więc przypięcie jest prawdopodobnie nieaktualne. Decyzja należy do właściciela.

### L6 — `docs/prompts/PROMPT_FABLE_DOWODZI_OPUS_WYKONUJE_2026-07-29.md` · Pewność: **niska** · Akcja: `flag`
To jednorazowy plan sesji: decyzja K0, liczby z 2026-07-29 i kolejka K0–K8. Jeśli program jest domknięty,
plik należy do archiwum. Jeśli jest aktywny, jego liczby (7195 / 10487 testów) warto oznaczyć jako migawkę.

## Weryfikacja proponowanego diffu

- `git apply --check -p1 proponowany_diff.patch` na HEAD `7e84753a` przechodzi bez błędów.
- `claude_md_struktura_guard.py` sprawdza tylko blok drzewa `ui/` i `ui2/`, którego diff nie dotyka.
- Nowy plik `docs/prompts/KONTRAKT_API_MODELI.md` może wymagać wpisu w indeksie dokumentów,
  jeśli `docs_guard.py` tego pilnuje. Sprawdź to przy wdrożeniu.
- Zmiana zachowania jest hipotezą, a nie wnioskiem (Krok 7). Najlepszą sondą jest sesja, która
  trafia na martwy kod poza zakresem zadania: przed zmianą H1 agent raz naprawia, raz tylko zgłasza;
  po zmianie powinien naprawiać zawsze.
