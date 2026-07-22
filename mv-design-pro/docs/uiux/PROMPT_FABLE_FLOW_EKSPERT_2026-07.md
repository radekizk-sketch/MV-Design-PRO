# PROMPT PROGRAMOWY FABLE — FLOW EKSPERT+ (2026-07-21)

**Status:** WIĄŻĄCY dokument programowy (dyrektywa właściciela 2026-07-21:
„Fable przejmij kontrolę, napisz prompt który poprawi dotychczasowe działania
Opusa, zarządzaj i deleguj robotę, jesteś architektem, wynieś flow jeszcze
poziom eksperta wyżej, prompty w kolejce krok po kroku, bez pytań").
Podporządkowany kanonowi V12.xx, `FLOW_PROJEKTANTA_2026-07.md` i audytowi
`AUDYT_FLOW_INZYNIER_PROJEKTANT_2026-07.md`. Fable = architekt/zarządca
(dyrektywa #9); wykonawcy realizują karty w worktree, commit BEZ push;
Fable weryfikuje niezależnie, cherry-pickuje, uruchamia pełne potwierdzenia
i pushuje.

## §1. Diagnoza wzorca dotychczasowego (co poprawiamy)

Praca ery Opusa była poprawna warsztatowo (zero fabrykacji, testy realną
ścieżką, rejestr V12K), ale miała pięć słabości wzorca, które ten program
usuwa:

1. **Plaster po plastrze na komendę.** Każdy brak (A1→A2→B1/B2) czekał na
   „dalej" właściciela. KOREKTA: cała kolejka audytu + podniesienie poziomu
   idzie JEDNYM programem, kartami równoległymi, bez czekania na komendę
   (dyrektywa #10 pełna autonomia).
2. **Sekwencyjność zamiast delegacji.** Wszystko robione osobiście, szeregowo.
   KOREKTA: karty niezależne → wykonawcy w worktree równolegle (dyrektywa #9);
   Fable osobiście tylko karty „opcja max" przecinające backend/domenę.
3. **GAP-y backendu odkładane etykietą „osobna karta".** B1/B2 zarejestrowały
   brak pól warunków przyłączenia OSD i… odłożyły. Dyrektywa #4 („nigdy nic
   na potem") wymaga domknięcia: K2 buduje pola + operację + API + UI
   end-to-end w tej kolejce.
4. **Pętla decyzji generyczna.** „Popraw w modelu" prowadzi zawsze do
   selekcji+Schemat — inżynier-ekspert oczekuje akcji WŁAŚCIWEJ dla rodzaju
   przekroczenia (K1).
5. **Dyrektywa #8 w poślizgu.** Trzy ostatnie scalenia (V12K-098/099/100) bez
   rundy zrzutów żywej aplikacji na stronie oceny. KOREKTA: K5 zamyka program
   obowiązkową rundą wizualną (oba motywy).

## §2. Zasady wykonania (BINDING dla wykonawców i Fable)

- **Worktree + commit BEZ push.** Wykonawca commituje w swoim worktree
  i raportuje: SHA commitów, gałąź, `git rev-parse --show-toplevel`, liczby
  testów. Push wykonuje WYŁĄCZNIE Fable po niezależnej weryfikacji
  (cherry-pick na `claude/power-network-design-ui-ir91mv`).
- **Bramki wspólne (każda karta):** `npm run type-check` czysty; vitest
  celowany + pełna regresja dotkniętego obszaru (`src/ui2/...`) —
  **KONIECZNIE z cwd `mv-design-pro/frontend`** (inaczej jsdom „document is
  not defined"); guardy z cwd `mv-design-pro`: `no_codenames_guard`,
  `forbidden_ui_terms_guard`, `ui_terminology_guard`, `dead_click_guard`,
  `utf8_mojibake_guard`, `ui_no_physics_guard` (+ backendowe przy K2).
  Kody wyjścia łapane bezpośrednio (nie przez pipe).
- **Zero fabrykacji / zero fizyki w UI / FROZEN nietknięte** — jak dotąd.
  Nowy test interakcji ZAWSZE realną ścieżką (natywny klik, realny store).
- **Rejestr:** każda scalona karta = wpis V12K-1xx w
  `docs/v12xx/REJESTR_KONFLIKTOW.md` + odhaczenie w audycie §5 (robi Fable
  przy scaleniu, nie wykonawca — unika konfliktów).
- **Styl:** tokeny `--mvd-*` wyłącznie; polskie etykiety; komentarze
  w kodzie po polsku, zgodne z konwencją modułu.

## §3. Kolejka kart — prompty wykonawcze krok po kroku

### K1 (A3, F-E6.3) — Akcje kontekstowe pętli decyzji [WYKONAWCA-1]

**Cel jednym zdaniem:** przycisk „Popraw w modelu" prowadzi do akcji WŁAŚCIWEJ
dla rodzaju przekroczenia, nie zawsze do gołej selekcji na schemacie.

**§0 Rozstrzygnięcia (nie do dyskusji):**
1. Nowy czysty moduł `ui2/wyniki/wzorzec/akcjeNaprawcze.ts`: typ
   `RodzajPrzekroczenia` (np. `'napiecie' | 'obciazalnosc-galezi' |
   'obciazalnosc-transformatora' | 'migotanie' | 'bilans-biernej' | …` —
   wyprowadzony z REALNYCH źródeł werdyktów: rozpływ `napiecePozaZakresem`,
   jakość `check_type`, migotanie, odbiór U) + funkcja
   `akcjaNaprawcza(rodzaj)` zwracająca opis akcji (etykieta PL + kroki
   nawigacji).
2. **Mapować WYŁĄCZNIE na realne, osiągalne programowo powierzchnie** —
   recon obowiązkowy: jak dziś otwiera się property-grid (selekcja), ekran
   nastaw zabezpieczeń (E-27), przestrzenie shell (`useShellStore.setActiveSpace`).
   Gdzie brak realnego, programowego wejścia w konfigurator — akcja pozostaje
   dzisiejsza (selekcja + „Schemat") z etykietą kontekstową; ZERO fabrykacji
   nawigacji, której nie ma.
3. Kontrakt addytywny: `usePoprawWModelu` zyskuje opcjonalny 4. parametr
   `rodzaj?: RodzajPrzekroczenia`; brak parametru = zachowanie 1:1 jak dziś
   (żadnych zmian dla istniejących konsumentów bez rodzaju).
4. Wpiąć rodzaj w istniejących konsumentów: rozpływ (napięcie), jakość
   walidacja (z `check_type`), migotanie, odbiór (U), rejestr „Co wymaga
   uwagi" (`co-wymaga-uwagi/model.ts` — pozycja niesie rodzaj).
5. Etykieta przycisku/`title` może być kontekstowa (np. „Popraw w modelu —
   dobór odcinka") tylko tam, gdzie akcja faktycznie różni się od generycznej.

**Kroki:** (a) recon nawigacji programowej (grep `setActiveSpace`,
`openRouteSurface`, `selectElement`, ekran E-27); (b) moduł + typy + registry;
(c) rozszerzenie hooka (addytywne); (d) wpięcia u konsumentów; (e) testy:
registry czysty (mapowanie per rodzaj, fallback), hook z rodzajem i bez
(zachowanie 1:1), minimum jeden test realnej ścieżki klik→akcja kontekstowa;
(f) pełna regresja `src/ui2/wyniki` + bramki §2; (g) commit(y) z opisem
PL + trailer zgodny z harness; BEZ push; raport.

### K2 (GAP B1/B2) — Warunki przyłączenia OSD end-to-end [FABLE OSOBIŚCIE, opcja max]

**Cel:** pola „warunki przyłączenia OSD" jako dane wejściowe modelu (moc
przyłączeniowa [MW], wymagany cosφ, opcjonalnie tryb pracy przyłącza) —
łańcuch: domena ENM (nagłówek/meta projektu) → operacja domenowa → API →
kafel E1 (bilans „zainstalowana OZE vs limit OSD" z werdyktem) → strumień
wniosku OSD (E7). Backend pierwszy, przetestowany osobnym krokiem; UI
konsumuje wyłącznie realne pola. Addytywnie (exclude_none), determinizm
i golden nietknięte. Realizuje Fable po scaleniu K1/K4.

### K3 (C1) — Przemiar i domknięcie `dowodRef` [WYKONAWCA-3, po K1]

**Cel:** każda liczba wyniku, dla której istnieje dowód WHITE BOX per element,
ma `dowodRef` (2×klik → dowód). **Krok 1 = POMIAR:** tabela adapterów
`ui2/wyniki/**` × kolumn: gdzie `dowodRef` jest, gdzie go brak, i CZY istnieje
realne odwołanie w kontrakcie (np. `element_id`/`target_id`); wynik pomiaru
do raportu. **Krok 2:** domknąć wyłącznie tam, gdzie kontrakt niesie realny
ref; gdzie nie niesie — wpis GAP (bez fabrykowania refów). Testy per adapter.

### K4 (D1) — Świeżość wyników w pasku aktywnego przypadku [WYKONAWCA-2]

**Cel jednym zdaniem:** inżynier widzi „wyniki nieaktualne" w miejscu, gdzie
zawsze patrzy (pasek aktywnego przypadku), nie dopiero na ekranie wyniku.

**§0 Rozstrzygnięcia:**
1. Recon obowiązkowy: gdzie w ui2 renderowany jest aktywny przypadek
   (shell/status-bar/nagłówek przestrzeni; legacy `ui/active-case-bar` NIE
   jest celem — cel to powłoka ui2). Wpiąć znacznik TAM, gdzie aktywny
   przypadek już jest pokazywany; nie budować nowego paska.
2. Źródło prawdy: `useStudyCasesStore.activeCase` → `result_status`
   (`NONE|FRESH|OUTDATED`) + `results_valid`. Etykiety jak
   `STATUS_WYNIKOW_LABEL` (spaces/projekt/strings). **Bez numeru rewizji**
   (store go nie niesie — jak `KafelSpojnosci`, nie fabrykować liczb).
3. Znacznik „nieaktualne" jest klikalny → przestrzeń „Obliczenia"
   (`setActiveSpace('obliczenia')` — recon dokładnego id przestrzeni
   w `shell/spaces.ts`); „aktualne"/„brak" bez akcji.
4. Reuse stylistyki istniejących tagów (`mvd-tag`/FreshnessBadge) — zero
   nowych kolorów poza tokenami.

**Kroki:** (a) recon miejsca renderu aktywnego przypadku w ui2 + id
przestrzeni obliczeń; (b) czysty helper mapujący `StudyCase|null` → model
znacznika (testowalny fixture'ami); (c) wpięcie + CSS tokenowy; (d) testy:
helper (NONE/FRESH/OUTDATED/null), render + klik realną ścieżką („nieaktualne"
→ obliczenia; „aktualne" bez akcji); (e) pełna regresja dotkniętego obszaru
+ bramki §2; (f) commit(y) BEZ push; raport (SHA, worktree, liczby testów,
decyzje reconu).

### K5 (dyrektywa #8) — Runda wizualna po scaleniu [FABLE]

Po scaleniu K1+K4 (i dalej K2/K3): zrzuty ŻYWEJ aplikacji przez
`creator-harness` + Playwright (oba motywy: pulpit z kaflem przyłączenia,
„Co wymaga uwagi", ekran jakości z akcjami kontekstowymi, pasek świeżości),
aktualizacja stałej strony oceny (ten sam plik → ten sam URL Artifact).

## §4. Kolejność i scalanie

```
K1 (wykonawca-1, worktree) ─┐
                            ├─→ Fable: weryfikacja → cherry-pick → regresja pełna → push → V12K-101/102
K4 (wykonawca-2, worktree) ─┘
K2 (Fable osobiście, backend+UI end-to-end)           → V12K-103
K3 (wykonawca-3, po K1 — dotyka tych samych adapterów) → V12K-104
K5 (Fable, runda wizualna + strona oceny)              → zamknięcie programu
```

## §5. Stan kolejki (żywy — aktualizuje Fable)

- K1: **SCALONE** (V12K-101) — wykonawca-1, zweryfikowane niezależnie, cherry-pick 2026-07-22
- K4: **SCALONE** (V12K-102) — wykonawca-2, zweryfikowane niezależnie, cherry-pick 2026-07-22
- K2: **SCALONE** (V12K-103) — Fable osobiście, backend+UI end-to-end, 2026-07-22
- K3: ZLECONE (wykonawca-3, worktree) — 2026-07-22
- K5: W KOLEJCE (po K2/K3)

GAP-y z raportów wykonawców (zarejestrowane, nie ciche):
- K1-G1: deep-link „Dobór kompensacji" bez pre-selekcji węzła (`wynikiTab` niesie
  tylko id zakładki) — rozszerzenie payloadu deep-linku = osobna karta.
- K1-G2: wiersze gałęzi rozpływu bez werdyktu obciążalności (kontrakt
  `PowerFlowBranchResult` nie niesie obciążalności) — dostawa werdyktu wymaga
  karty interpretacyjnej (backend/analiza); rodzaj `obciazalnosc-galezi`
  wpięty i czeka na werdykt.
- K4-G1: ostrzeżenia `act(...)` w `ui2/__tests__/integracja.test.tsx`
  (pre-existing, zmierzone 9=9) — naprawa w orkiestratorze AppRoot, osobna karta.
