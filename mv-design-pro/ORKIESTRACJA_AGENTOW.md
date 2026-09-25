# ORKIESTRACJA AGENTÓW — DYNAMIC WORKFLOWS + SWARM SUBAGENTÓW DLA MV-DESIGN-PRO

**Status:** warstwa procesowa pakietu (obok PROMPT / STAN_REPO / ZADANIE) · **Podstawa:** zweryfikowana dokumentacja Claude Code (`code.claude.com/docs/en/workflows`, `/en/sub-agents`), stan 2026-05-29
**Cel:** podnieść wykonanie z „jeden agent, jedno zadanie, jedna sesja" do **orkiestracji wielu subagentów** tam, gdzie zadanie jest na to zbyt duże — BEZ łamania ZASADY NR 1 (zero długu) i ZASADY NR 2 (weryfikacja zrzutem).

> **Uwaga o dojrzałości funkcji.** Dynamic workflows to **research preview** (Claude Code v2.1.154+, plany płatne). Traktuj jako narzędzie produkcyjne dla zadań masowych, ale z gate'ami właściciela — nie jako autopilota całego projektu.
>
> **Uwaga wykonawcza:** narzędzie *Workflow* uruchamiasz tylko, gdy właściciel jawnie o nie poprosi (słowo `ultracode` albo prośba o workflow); w pozostałych przypadkach wzorce poniżej realizujesz subagentami (`Agent`, równolegle/w tle) — SLD = „subagenty sekwencyjnie", audyt/walidacja = swarm subagentów.

---

## 1. KIEDY ORKIESTROWAĆ — detekcja zadania złożonego

Trzy prymitywy Claude Code różnią się tym, **kto trzyma plan**:

- **Subagent** — worker, którego Claude spawnuje; plan trzyma Claude tura po turze; wyniki lądują w kontekście Claude. Kilka zadań na turę.
- **Skill** — instrukcje, które Claude wykonuje; plan w prompcie.
- **Workflow** — skrypt JS, który runtime wykonuje; plan i wyniki pośrednie żyją w zmiennych skryptu, nie w kontekście Claude. **Dziesiątki do setek agentów na run.**

**Reguła detekcji:** sięgaj po workflow, gdy zadanie potrzebuje więcej agentów, niż jedna rozmowa skoordynuje, ALBO gdy orkiestracja ma być skryptem do ponownego uruchomienia.

| Zadanie | Prymityw | Uzasadnienie |
|---|---|---|
| Pojedynczy work package (jeden solver, jeden ekran) | **Subagent** lub główna sesja | Mieści się w jednej rozmowie z gate'em ACCEPT/FEEDBACK |
| Przebudowa SLD (layout + porty + 2 tryby + klikalność + OZE, iterowane) | **Subagenty sekwencyjnie** pod orkiestracją głównej sesji | Zależności (layout → porty), gate wizualny właściciela między etapami |
| Audyt całego repo / sweep (np. „znajdź wszystkie `no_module`/zakazane frazy w 625 plikach") | **Workflow** (tu: swarm subagentów read-only) | Masowy, równoległy, powtarzalny |
| Walidacja K-04 (23 progi V12.6) + K-08 (sanity-bounds) przez wiele solverów naraz | **Workflow** (tu: fan-out subagentów) | Wiele niezależnych weryfikacji, recenzja krzyżowa |
| Domknięcie długu D-01…D-06 (6 niezależnych solverów) | **Workflow z fazami** | Każdy solver = niezależna gałąź; adwersarialna recenzja przed scaleniem |

**Aktywacja:** słowo `workflow` w prompcie; `/effort ultracode` włącza automatyczną detekcję (drożej/wolniej — używać świadomie).

---

## 2. TWARDE BARIERY — czego orkiestracja NIE może złamać (nadrzędne)

**B-01 — Zakaz dotykania zamrożonego rdzenia.** Subagenty wykonawcze NIE edytują rdzeni zamrożonych z wiążącej listy `scripts/rdzenie_b01.py` (IEC 60909, NR/GS/FD, IEC 60255, NC RfG/PTPiREE z profilami, FRT/HVRT, `stability_rms`, WLS, stan fazowy SN, V12.6); pozostałe pliki `network_model/solvers/**` NIE są rdzeniami B-01 i karta naprawia w nich instancje swojej klasy. Model ENM (`enm/models.py`) i kontrakty API wyników (reguła 6 CLAUDE.md: zmiana addytywna albo z podbiciem wersji) — tylko gdy karta wprost to dopuszcza. Egzekwuj `disallowedTools`/allowlist ścieżek. Zmiany tam — tylko główna sesja z jawną zgodą właściciela.

**B-02 — Gate wizualny (ZASADA NR 2) zostaje przy właścicielu.** Workflow może *wyprodukować* zrzuty (harness Playwright), ale werdykt „≥8/10 / PASS" wystawia człowiek. Każdy etap z oceną wizualną = osobny run ze STOP na zrzucie. Workflow nie przyjmuje wejścia w trakcie runu — ocena musi być POZA runem.

**B-03 — Atomowość i samowystarczalność work package.** Kanał rodzic→subagent to tylko string promptu. Każde zadanie MUSI zawierać: ścieżki plików, kontrakt I/O, kryteria akceptacji, listę zakazanych obszarów (B-01), definicję „done". Subagent startuje z czystym kontekstem.

**B-04 — Recenzja przed scaleniem (nie po).** Agent-wykonawca produkuje, agent-recenzent sprawdza wg kryteriów K + sanity-bounds, dopiero scalenie. Orkiestrator = warstwa integracyjna.

**B-05 — Determinizm i ślad (K-28).** Każdy run zapisuje: wersję solvera, wejścia, seed. Workflow jest skryptem do ponownego uruchomienia — dowód odtwarzalności.

---

## 3. SKŁAD SWARM — drzewo agentów (dyrektywa właściciela 2026-09-24)

Drzewo agentów Claude Code na Opus 5.5 — „planuj na high, deleguj na medium, podnoś, gdy trzeba”:

```
Opus 5.5 · high — sesja główna (plan, karty, integracja)
        │ deleguje do własnych subagentów, domyślnie medium
        ├── explorer   · Opus 5.5 · medium — czyta kod i dokumenty, mierzy klasę defektu
        ├── worker     · Opus 5.5 · medium — zmiany + testy w swoim drzewie, commit lokalny
        └── researcher · Opus 5.5 · medium — normy, dokumenty regulacyjne, dokumentacja bibliotek
        │
Opus 5.5 · high — powrót do sesji głównej: przegląd i weryfikacja na czystym drzewie
        │
        └ utknięcie dwa razy na tym samym problemie → stop + meldunek → decyzja właściciela (Fable 5.1)
```

Definicje są w repozytorium: `.claude/agents/explorer.md`, `worker.md`, `researcher.md` (frontmatter
`name`, `description`, `tools`, `model: claude-opus-5-5`, `effort: medium`; treść pliku = instrukcja
roli). Sesja, która nie widzi ich jako typów agenta (katalog `.claude/agents/` powstał w jej trakcie —
Claude Code wczytuje go przy starcie), używa agenta ogólnego z `model: opus` i instrukcją roli
wskazaną ścieżką do tego pliku. `effort` podnosi się tylko z powodu: rdzeń solvera, rdzeń FROZEN,
bramka bezpieczeństwa, recenzja adwersarzowa → `high`/`xhigh` (tabela §3a).

| Subagent | Model · effort | Rola | Narzędzia |
|---|---|---|---|
| `explorer` | Opus 5.5 · medium | Odczyt i pomiar: inwentarz klasy `plik:linia`, stan kart, zależności — zero edycji | Read, Grep, Glob, Bash (tylko odczyt) |
| `worker` | Opus 5.5 · medium | Karta end-to-end w swoim drzewie `odbior-*`: zmiana, testy jako iloczyn cech, strażniki, jeden commit lokalny, meldunek | Read, Edit, Write, Bash, Grep, Glob |
| `researcher` | Opus 5.5 · medium | Źródła: IEC, NC RfG, PTPiREE/WOS, dokumentacja bibliotek — z punktem i wydaniem | Read, Grep, Glob, Bash, WebFetch, WebSearch |
| `worker-rdzen` | Opus 5.5 · high | Rola `worker` z podniesionym wysiłkiem: rdzeń solvera (dynamika), wyrocznie, bramki poprawności (strażnik werdyktu) | jak `worker` |

Utknięcie: wykonawca, który dwa razy nie rozwiąże tego samego problemu (ten sam test czerwony po dwóch
różnych próbach, ta sama niejasność karty), zatrzymuje się i melduje próby, wynik i hipotezę; sesja
główna decyduje o eskalacji, a eskalację do Fable 5.1 zleca właściciel.

Role z §4 realizują te definicje: `explorer` — audyt repo, inwentarz klasy, skan zakazanych
fraz i sierot (tylko odczyt); `worker` / `worker-rdzen` — implementacja solvera/UI wg kontraktu,
testy i sanity-bounds, harness Playwright i zrzuty (bez werdyktu wizualnego — B-02); `researcher`
— normy IEC/PN-EN, NC RfG, PTPiREE/WOS, dokumentacja bibliotek i API. Recenzję adwersarialną
wykonuje sesja główna albo osobny `explorer` z kryteriami K i sanity-bounds w prompcie.
Scalone z gałęzi main (PR #476, który trzymał definicje w `docs/prompts/agenci/` do czasu zgody
na `.claude/agents/`): definicje żyją w JEDNYM miejscu, `.claude/agents/`, bo tylko stamtąd
Claude Code ładuje typy subagentów; zgoda właściciela — polecenie z 2026-09-24 (drzewo agentów
„custom subagents explorer/worker/researcher”).

### 3a. Dobór modelu i wysiłku do złożoności zadania (dyrektywa właściciela 2026-09-23)

Zarządca dobiera model i `effort` do zadania, nie „na wszelki wypadek" (wytyczne Anthropic dla
Fable 5.1/Opus 5.5 w CLAUDE.md, sekcja „Multi-agent i subagenty" i „Prompting"):

| Klasa zadania | Model | `effort` | Przykłady z programu A/B |
|---|---|---|---|
| Odczyt i streszczenie (transkrypty, logi CI, inwentarz faktów `plik:linia`, skan grepem) | Sonnet (Haiku przy czystym skanie) | `low` | stan sześciu wykonawców z transkryptów; inwentarz frontendu pod D2 |
| Krok mechaniczny bez decyzji (kopiowanie zmierzonych fixtur, jeden guard, porównanie hunków dwóch drzew) | Sonnet | `low` | weryfikacja, że `odbior-*` zawiera wyłącznie hunki jednego pakietu |
| Implementacja karty w drzewie `odbior-*`, testy klasy, migracje kontraktów (subagent `worker`) | Opus 5.5 | `medium` (domyślnie; podnoszony z powodu) | karty językowe #141–#145, porządki, Pakiet E2 |
| Integracja na czystym drzewie, przegląd i weryfikacja (sesja główna) | Opus 5.5 | `high` | scalanie kart, pełna regresja, odbiór zrzutów |
| Solver, rdzeń FROZEN, bramka bezpieczeństwa, recenzja adwersarzowa, architektura | Opus 5.5 (Fable osobiście, gdy „opcja max") | `xhigh`/`max` | AB-1b.1a, wyrocznie, decyzje O-… |

Reguły oszczędności tokenów (te same, które obniżają koszt bez utraty jakości):
1. **Wznawiaj, nie twórz.** Wykonawca z kontekstem (cache) dostaje kolejną kartę przez `SendMessage`;
   nowy agent tylko wtedy, gdy kontekst jest nieprzydatny albo przepełniony.
2. **Karta = cel + powód + granice + kryterium ukończenia**, bez listy kroków; wykonawca meldunkiem
   §103 (co domknięte z dowodem / częściowe / niezrobione i dlaczego), bez narracji.
3. **Zero odpytywania.** Biegi w tle z sentinelem i powiadomieniem; żadnych pętli „czy już?",
   żadnych agentów do czekania. Jeden ciężki proces naraz na wykonawcę (4 CPU / 16 GB).
4. **Zarządca czyta wnioski, nie surowce.** Duży plik → agent Sonnet z pytaniem i formatem
   wyjścia; zarządca czyta streszczenie i decyduje. Wyjątek: odbiór kodu/decyzji, gdzie
   zarządca musi zobaczyć diff.
5. **Stabilny prefiks.** Karty i dokumenty odniesienia w plikach o stałej ścieżce (scratchpad),
   nie wklejane do promptu przy każdym wznowieniu.
6. **Meldunki zarządcy do właściciela:** wynik, decyzje, co dalej — jedno zdanie na wątek;
   stan „bez zmian" jednym zdaniem.

Metody użycia agentów wg dokumentacji Anthropic dla Fable 5.1 (aktualizacja 2026-09-24; źródło:
`shared/model-migration.md` → „Migrating to Claude Fable 5.1 → Behavioral shifts / Long-running
agent recommendations"; sesja główna Opus 5.5 na `high` planuje i weryfikuje,
Fable 5.1 wchodzi wyłącznie po eskalacji decyzją właściciela):
7. **Deleguj asynchronicznie, nie „uruchom i czekaj".** Subagenci równolegli są na Fable 5.1
   niezawodni: zarządca zleca kartę, wraca do własnej pracy, a wynik odbiera powiadomieniem;
   zarządca nigdy nie blokuje się na najwolniejszym wykonawcy. Pytanie wykonawcy o decyzję
   (`SendMessage` do zarządcy) dostaje odpowiedź, a wykonawca w tym czasie robi części
   niezależne od decyzji — tak jak w integracjach AB-1b.1a (resolver zacisku, klasa P9).
8. **Weryfikator ze świeżym kontekstem bije samokrytykę.** Odbiór dużej karty = niezależna
   weryfikacja na czystym drzewie (`odbior-*`): pełna regresja, guardy, piny z pomiaru — przez
   zarządcę albo osobnego agenta bez kontekstu wykonawcy; wykonawca nie certyfikuje sam siebie.
9. **Twierdzenia o postępie ugruntowane w wynikach narzędzi.** Meldunek §103 podaje kody wyjścia
   łapane bezpośrednio i ścieżki logów; zdanie „zielone" bez logu nie istnieje (to eliminuje
   sfabrykowane meldunki statusu, które dokumentacja Anthropic wymienia jako ryzyko długich biegów).
10. **Granice nazwane wprost w każdej karcie.** Fable 5.1 i Opus 5.5 chętnie robią rzeczy sąsiednie
    (sprzątanie, dodatkowe testy, przepisanie całego pliku zamiast łaty): karta wylicza, czego NIE
    wolno — git zmieniający stan, cudze pliki, rdzenie FROZEN, docs poza listą, kasacje bez dowodu.
11. **Powierzchnia pamięci.** Karty, decyzje §0 i stan wykonawców żyją w plikach o stałej ścieżce
    (scratchpad `karta_*.md`, `skroty/STAN_WYKONAWCOW_*.md`, rejestr O-… w planie); wykonawca dostaje
    ścieżkę i polecenie zaglądania do niej, zarządca dopisuje decyzje do karty, nie tylko do czatu.
12. **Karta bez listy kroków.** Rozpisany proces obniża jakość na Fable 5.1 — karta podaje cel, powód,
    granice, kryterium ukończenia i format meldunku; wykonawca sam planuje. Wyjątek: procedura
    bezpieczeństwa (np. kolejność commit → rebase → piny → push), którą zarządca wykonuje osobiście.
13. **Bez zatrzymania na opisie następnego kroku.** Tura kończy się dowodem (log, diff, meldunek), nie
    zdaniem „teraz uruchomię…"; wykonawca nie prosi o pozwolenie, którego karta już udzieliła. Jedyne
    zatrzymania: B-01, B-02, bramki bezpieczeństwa, realne rozstrzygnięcia produktowe.
14. **Wywołania niezależne równolegle, ciężkie procesy pojedynczo.** Odczyty/grepy/testy celowane w
    jednym wywołaniu; regresja, vitest, e2e — jeden proces naraz na wykonawcę, w tle z sentinelem.
15. **Odporność na limity API.** Gdy wykonawca kończy błędem limitu (HTTP 429, „weekly limit"), jego
    drzewo `odbior-*` i logi zostają nietknięte; zarządca odczytuje stan z transkryptu i logów (ostatnie
    wywołania narzędzi, sentinele), kontynuuje sam pracę krytyczną dla ścieżki (scalenia zweryfikowanych
    drzew) z wysiłkiem dobranym do zadania, a po odblokowaniu WZNAWIA tych samych wykonawców
    (`SendMessage` — kontekst i cache zostają) od miejsca przerwania, z opisem stanu z logów. Zakaz
    tworzenia nowych wykonawców do dokończenia cudzej, na wpół naniesionej pracy, gdy da się wznowić.
16. **Wykonawca weryfikuje celowo, integrator w pełni (2026-09-25).** Wykonawca uruchamia testy
    celowane warstw dotkniętych (testy modułów zmienionych i testy, które te moduły importują —
    zbiór wyznaczony grepem i podany w meldunku), `scripts/guardy_z_ci.py`, samotesty zmienionych
    strażników, type-check, lint, vitest modułów dotkniętych, speki e2e ekranów dotkniętych oraz
    generatory fikstur, które karta może zmienić. Pełną regresję backendu, pełny vitest i pełne e2e
    uruchamia integrator raz na partię, na drzewie scalonym, jeden bieg naraz. Powód (pomiar
    2026-09-25): cztery równoległe pełne regresje na maszynie z 4 CPU zajęły wszystkie rdzenie,
    każda trwała kilka razy dłużej niż sama, wykonawcy wyglądali na zawieszonych przez wiele godzin,
    a osierocone serwery e2e trzymały porty; pełna regresja w drzewie karty i tak nie jest dowodem
    odbioru, bo nie widzi zmian innych kart partii. Każdy bieg z prywatnym `--basetemp` w katalogu
    karty; katalogów tymczasowych innych biegów się nie kasuje; procesy zabija się po PID, nigdy
    wzorcem `pkill -f` (dopasowuje własną powłokę).

---

## 4. WZORCE WORKFLOW DLA BIEŻĄCYCH ZADAŃ

### 4.1. Domknięcie długu funkcjonalnego (D-01…D-06)
Fazy: (1) `explorer` inwentaryzuje stan każdej pozycji; (2) równolegle `worker` implementuje wg kontraktu wraz z testami i sanity-bounds; (3) `researcher` dostarcza podstawę normową tam, gdzie jej brak; (4) sesja główna (albo osobny `explorer` w roli recenzenta) adwersarialnie sprawdza zgodność i wartości; (5) scalenie tylko pozycji, które przeszły; reszta → FEEDBACK. Gate: przegląd dekompozycji PRZED dispatchem.

### 4.2. Walidacja wiarygodności wartości (K-04 + K-08)
Fan-out: jeden agent na solver V12.6 liczy benchmark vs próg/sanity-bounds; sesja główna rozstrzyga, które wiarygodne; raport per próg.

### 4.3. SLD — etapy z gate'em (B-02), nie jeden workflow w tle
- Etap A: `worker` buduje silnik drzewa + zakotwiczenie portów na 52 stacjach i produkuje zrzuty. → **STOP, ocena właściciela.**
- Etap B (po ACCEPT): klikalność (V-08) + łańcuchy OZE (V-10); zrzuty. → **STOP.**
- Etap C: tryb prezentacyjny + 11 warunków. → **STOP, werdykt ≥8/10.**

---

## 5. GATE'Y WŁAŚCICIELA

1. **Przed runem** — przejrzyj dekompozycję i skrypt. ZAWSZE czytaj.
2. **Między etapami z oceną wizualną** — osobne runy, ocena na zrzucie (B-02).
3. **Po recenzji adwersarialnej** — ACCEPT/FEEDBACK na scalenie.

NIE uruchamiaj swarm w `bypassPermissions` dla obszarów dotykających kanonu (B-01).

---

## 6. AKTUALIZACJA STANU PO RUNIE

Każdy zakończony run → wpis do `STAN_REPO.md`: co domknięto, jaki dług został, jakie wartości zwalidowano, link do zrzutów/dowodów. Skrypt wart powtórzenia → zapisz jako `.claude/workflows/`.

---

## 7. ZASADA NADRZĘDNA ORKIESTRACJI

Orkiestracja zwiększa **przepustowość**, nie obniża **progu jakości**. Swarm 100 agentów na zaślepkach to 100× dług. Każdy wzorzec kończy się tym samym, co praca jednoagentowa: pełne wdrożenie (solver+test+kontrakt+integracja), sanity-bounds, dowód White Box, a dla SLD — werdykt wizualny właściciela. Automatyzacja dotyczy DROGI do jakości, nigdy definicji jakości.

---

*Warstwa procesowa. Nadrzędne pozostają ZASADA NR 1, ZASADA NR 2 i zakaz drugiej prawdy.*
