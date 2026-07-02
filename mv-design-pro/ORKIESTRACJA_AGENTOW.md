# ORKIESTRACJA AGENTÓW — DYNAMIC WORKFLOWS + SWARM SUBAGENTÓW DLA MV-DESIGN-PRO

**Status:** warstwa procesowa pakietu (obok PROMPT / STAN_REPO / ZADANIE) · **Podstawa:** zweryfikowana dokumentacja Claude Code (`code.claude.com/docs/en/workflows`, `/en/sub-agents`), stan 2026-05-29
**Cel:** podnieść wykonanie z „jeden agent, jedno zadanie, jedna sesja" do **orkiestracji wielu subagentów** tam, gdzie zadanie jest na to zbyt duże — BEZ łamania ZASADY NR 1 (zero długu) i ZASADY NR 2 (weryfikacja zrzutem).

> **Uwaga o dojrzałości funkcji.** Dynamic workflows to **research preview** (Claude Code v2.1.154+, plany płatne). Traktuj jako narzędzie produkcyjne dla zadań masowych, ale z gate'ami właściciela — nie jako autopilota całego projektu.
>
> **Uwaga wykonawcza (2026-05-29):** w bieżącym harnessie agenta narzędzie *Workflow* (runtime skryptu JS) **nie jest wystawione** — dostępny prymityw orkiestracji to **subagent** (`Agent`/Explore/general-purpose), uruchamialny równolegle/w tle. Wzorce poniżej realizuje się subagentami (zgodnie z mapą §1: SLD = „subagenty sekwencyjnie", audyt/walidacja = swarm subagentów). Gdy runtime workflow stanie się dostępny — te same wzorce przenoszą się 1:1.

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

**B-01 — Zakaz dotykania zamrożonego rdzenia.** Subagenty wykonawcze NIE edytują: frozen solverów (`short_circuit_iec60909.py` i in. FROZEN), modelu ENM (`enm/models.py`), kontraktów API solverów. Egzekwuj `disallowedTools`/allowlist ścieżek. Zmiany tam — tylko główna sesja z jawną zgodą właściciela.

**B-02 — Gate wizualny (ZASADA NR 2) zostaje przy właścicielu.** Workflow może *wyprodukować* zrzuty (harness Playwright), ale werdykt „≥8/10 / PASS" wystawia człowiek. Każdy etap z oceną wizualną = osobny run ze STOP na zrzucie. Workflow nie przyjmuje wejścia w trakcie runu — ocena musi być POZA runem.

**B-03 — Atomowość i samowystarczalność work package.** Kanał rodzic→subagent to tylko string promptu. Każde zadanie MUSI zawierać: ścieżki plików, kontrakt I/O, kryteria akceptacji, listę zakazanych obszarów (B-01), definicję „done". Subagent startuje z czystym kontekstem.

**B-04 — Recenzja przed scaleniem (nie po).** Agent-wykonawca produkuje, agent-recenzent sprawdza wg kryteriów K + sanity-bounds, dopiero scalenie. Orkiestrator = warstwa integracyjna.

**B-05 — Determinizm i ślad (K-28).** Każdy run zapisuje: wersję solvera, wejścia, seed. Workflow jest skryptem do ponownego uruchomienia — dowód odtwarzalności.

---

## 3. SKŁAD SWARM — subagenty wyspecjalizowane

Definiuj jako `.claude/agents/*.md` (frontmatter: `description`, `prompt`, `tools`, `model`, `disallowedTools`). Opis: „Użyj, gdy…", jawny format wyjścia, jeden cel.

| Subagent | Model | Rola | Narzędzia |
|---|---|---|---|
| `audytor-repo` | Haiku | Skan repo, zakazane frazy/`no_module`/sieroty, inwentarz (§5.0) — read-only | read, grep, glob |
| `solver-engineer` | Opus | Implementacja solvera (D-01…D-06): metoda + kontrakt + White Box | read, write, edit, bash |
| `test-engineer` | Sonnet | Testy jednostkowe + sanity-bounds; weryfikacja progów K-04/K-08 | read, write, edit, bash |
| `recenzent-norm` | Opus | Adwersarialna recenzja: IEC/PN-EN, poprawność wartości, brak drugiej prawdy | read, grep |
| `sld-layout` | Opus | Silnik layoutu drzewiastego + kontrakt geometrii (port→port) | read, write, edit |
| `wizualizator` | Sonnet | Harness Playwright, produkcja zrzutów (NIE wystawia werdyktu — B-02) | read, bash |

**Zasada modelu:** read-only → Haiku (koszt), implementacja/recenzja → Opus (jakość), testy → Sonnet. `CLAUDE_CODE_SUBAGENT_MODEL` może wymusić pułap kosztów.

---

## 4. WZORCE WORKFLOW DLA BIEŻĄCYCH ZADAŃ

### 4.1. Domknięcie długu funkcjonalnego (D-01…D-06)
Fazy: (1) `audytor-repo` inwentaryzuje stan każdej pozycji; (2) równolegle `solver-engineer` implementuje wg kontraktu; (3) `test-engineer` dokłada testy + sanity-bounds; (4) `recenzent-norm` adwersarialnie sprawdza zgodność i wartości; (5) scalenie tylko pozycji, które przeszły; reszta → FEEDBACK. Gate: przegląd dekompozycji PRZED dispatchem.

### 4.2. Walidacja wiarygodności wartości (K-04 + K-08)
Fan-out: jeden agent na solver V12.6 liczy benchmark vs próg/sanity-bounds; `recenzent-norm` głosuje, które wiarygodne; raport per próg.

### 4.3. SLD — etapy z gate'em (B-02), nie jeden workflow w tle
- Etap A: `sld-layout` buduje silnik drzewa + zakotwiczenie portów na 52 stacjach; `wizualizator` produkuje zrzuty. → **STOP, ocena właściciela.**
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
