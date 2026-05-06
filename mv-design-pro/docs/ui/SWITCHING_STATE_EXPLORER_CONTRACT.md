# SWITCHING STATE EXPLORER — Kontrakt UI (PF-grade)

**Wersja:** 1.0
**Status:** CANONICAL (BINDING)
**Typ fazy:** DOC-ONLY (bez modyfikacji kodu, solverĂłw, API, DB)
**Zakres:** PHASE 2.x.3
**Utworzono:** 2026-01-28

**Referencje (BINDING):**
- `SYSTEM_SPEC.md` — definicje NetworkModel, Switch, Case
- `ARCHITECTURE.md` — warstwa Application (NOT-A-SOLVER rule)
- `AGENTS.md` — governance, zasady normatywne
- `PLANS.md` — Phase 2.x.3
- `docs/ui/ui_canonical_parity.md` — tryby pracy, lifecycle
- `docs/ui/sld_rules.md` — integracja SLD
- `docs/ui/TOPOLOGY_TREE_CONTRACT.md` (jeĹ›li istnieje) — synchronizacja selekcji
- `docs/ui/RESULTS_BROWSER_CONTRACT.md` — integracja z wynikami
- `docs/ui/ELEMENT_INSPECTOR_CONTRACT.md` — integracja z inspektorem

---

## 1. Executive Summary

**Switching State Explorer** to narzędzie UI klasy **DIgSILENT benchmark / benchmark** dla eksploracji stanĂłw Ĺ‚ączeniowych aparatury i ich wpĹ‚ywu na topologię efektywną sieci.

**Zakres funkcjonalny:**
- Przeglądanie i edycja (na poziomie UI-kontraktu) stanĂłw aparatury OPEN/CLOSED
- Ocena spĂłjnoĹ›ci i Ĺ‚ącznoĹ›ci sieci (algorytmiczna identyfikacja wysp — Islands)
- Wizualizacja wpĹ‚ywu stanĂłw na topologię efektywną
- Integracja z SLD, Element Inspector, Results Browser, Topology Tree

**NOT-A-SOLVER rule:** Switching State Explorer **NIE wykonuje obliczeĹ„ fizycznych** (prądy, napięcia). Obliczenia pozostają w warstwie Solver. Explorer wykonuje wyĹ‚ącznie analizę topologiczną (graph traversal, connected components).

**MAX DATA, MAX CONTROL:** Brak uproszczeĹ„. Wszystkie aparaty widoczne, wszystkie stany dostępne. UĹĽytkownik decyduje o filtrowaniu.

---

## 2. Definicje terminĂłw (BINDING)

### 2.1 Switching Apparatus (Aparat Ĺ‚ączeniowy)

**Definicja:**
Element topologiczny bez impedancji (PF-rule), zmieniający efektywną topologię sieci poprzez stan OPEN/CLOSED.

**Typy aparatĂłw (zgodnie z NetworkModel):**
| Typ | Identyfikator | Opis | Impedancja |
|-----|---------------|------|-----------|
| **Breaker** | BREAKER | WyĹ‚ącznik mocy | ZERO (PF-rule) |
| **Disconnector** | DISCONNECTOR | OdĹ‚ącznik | ZERO (PF-rule) |
| **Load Switch** | LOAD_SWITCH | Ĺącznik obciąĹĽenia | ZERO (PF-rule) |
| **Fuse** | FUSE | Bezpiecznik | ZERO (PF-rule) |

**INVARIANT (PF-rule):** Aparat Ĺ‚ączeniowy **NIE MA** impedancji (R, X, B). Zmienia **wyĹ‚ącznie** topologię (węzĹ‚y poĹ‚ączone/rozĹ‚ączone).

---

### 2.2 Effective Topology (Topologia efektywna)

**Definicja:**
Graf sieci po uwzględnieniu:
- stanĂłw aparatĂłw Ĺ‚ączeniowych (OPEN → krawędĹş usunięta, CLOSED → krawędĹş obecna),
- flag `in_service` (False → element usunięty z grafu).

**ReguĹ‚y konstrukcji:**
1. Bazowy graf: wszystkie Bus + wszystkie Branch z `in_service = True`
2. Aparaty w stanie **CLOSED**: krawędĹş między `from_bus` i `to_bus` obecna (impedancja ZERO)
3. Aparaty w stanie **OPEN**: krawędĹş usunięta (Bus rozĹ‚ączone)
4. Elementy z `in_service = False`: caĹ‚kowicie usunięte z grafu

**MUST:** Effective Topology jest obliczana algorytmicznie (graph traversal) po kaĹĽdej zmianie stanu aparatu.

---

### 2.3 Island (Wyspa)

**Definicja:**
SpĂłjna skĹ‚adowa grafu efektywnego (connected component w sensie graph theory).

**WĹ‚aĹ›ciwoĹ›ci:**
- KaĹĽdy Bus naleĹĽy do dokĹ‚adnie jednej Island (lub jest izolowany — Island 1-elementowa)
- Bus w obrębie Island są poĹ‚ączone Ĺ›cieĹĽką topologiczną (istnieje path bez przejĹ›cia przez aparat OPEN)
- RĂłĹĽne Islands są rozĹ‚ączone (nie istnieje path między nimi)

**Identyfikacja (algorytmiczna):**
Connected components detection (BFS/DFS na grafie Effective Topology).

**NOT-A-SOLVER rule:** Island **NIE jest** wynikiem obliczeĹ„ elektrycznych. To wynik graph traversal.

---

### 2.4 Energized vs De-energized (interpretacja UI)

**Definicja (semantyka UI, NIE fizyka):**

| Stan | Definicja | Interpretacja (nie-binding) |
|------|-----------|----------------------------|
| **Energized** | Island zawiera co najmniej 1 Source z `in_service = True` | Wyspa "zasilona" (potencjalnie pod napięciem) |
| **De-energized** | Island **nie zawiera** ĹĽadnego Source | Wyspa "odĹ‚ączona od zasilania" |

**CRITICAL:** Status Energized/De-energized **NIE JEST** wynikiem obliczeĹ„ fizycznych (Power Flow, Short Circuit). To **interpretacja topologiczna**.

**FORBIDDEN:**
- UĹĽywanie wyniku Power Flow (napięcia U) do okreĹ›lenia statusu Energized (to byĹ‚oby SOLVER logic)
- Prezentowanie statusu Energized jako "gwarancji napięcia" (wymaga PF)

**ALLOWED:**
- Prezentowanie statusu Energized jako "flagi obecnoĹ›ci ĹşrĂłdĹ‚a w wyspie" (interpretacja topologiczna)
- Wizualne ostrzeĹĽenie: "Island de-energized (brak Source) — Power Flow moĹĽe nie zbiegać"

---

## 3. Funkcje UI (PF-grade)

### 3.1 Widok â€žSwitching Explorer" — pierwszy klasowy panel UI

**Cel:** Dedykowany panel dla eksploracji stanĂłw Ĺ‚ączeniowych i topologii efektywnej.

**Layout (rĂłwnorzędny z SLD, Results Browser, Topology Tree):**

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ SWITCHING STATE EXPLORER                                [X Close]       â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                         â”‚
â”‚ â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚ â”‚ FILTRY                                                            â”‚ â”‚
â”‚ â”‚  Typ aparatu:   [All â–Ľ] [BREAKER] [DISCONNECTOR] [LOAD_SWITCH]   â”‚ â”‚
â”‚ â”‚  Stan:          [All â–Ľ] [OPEN] [CLOSED]                          â”‚ â”‚
â”‚ â”‚  In Service:    [All â–Ľ] [True] [False]                           â”‚ â”‚
â”‚ â”‚  Feeder/Bay:    [All â–Ľ] [Feeder-01] [Bay-A] ...                  â”‚ â”‚
â”‚ â”‚  Island ID:     [All â–Ľ] [Island-1] [Island-2] ...                â”‚ â”‚
â”‚ â”‚  Szukaj (name): [_____________________] đź”Ť                        â”‚ â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚                                                                         â”‚
â”‚ â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚ â”‚ LISTA APARATĂ“W (250 elementĂłw, posortowane: Name ↑)              â”‚ â”‚
â”‚ â”śâ”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”¤ â”‚
â”‚ â”‚  ID â”‚ Name       â”‚ Type â”‚ State    â”‚ From Bus â”‚ To Bus   â”‚Island â”‚ â”‚
â”‚ â”śâ”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”¤ â”‚
â”‚ â”‚ 001 â”‚ CB-01      â”‚ BRK  â”‚ â—Ź CLOSED â”‚ Bus-01   â”‚ Bus-02   â”‚ Isl-1 â”‚ â”‚
â”‚ â”‚ 002 â”‚ DS-01      â”‚ DISC â”‚ â—‹ OPEN   â”‚ Bus-02   â”‚ Bus-03   â”‚ —     â”‚ â”‚
â”‚ â”‚ 003 â”‚ CB-02      â”‚ BRK  â”‚ â—Ź CLOSED â”‚ Bus-03   â”‚ Bus-04   â”‚ Isl-2 â”‚ â”‚
â”‚ â”‚ ... â”‚ ...        â”‚ ...  â”‚ ...      â”‚ ...      â”‚ ...      â”‚ ...   â”‚ â”‚
â”‚ â””â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚   [Toggle State] [Batch Operations â–Ľ] [Restore Normal State]         â”‚
â”‚                                                                         â”‚
â”‚ â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚ â”‚ TOPOLOGY CHECKS (pre-solver validation)                          â”‚ â”‚
â”‚ â”‚  âś“ Liczba Islands:       3                                        â”‚ â”‚
â”‚ â”‚  âš  Islands bez Source:   2 (Island-2, Island-3)                  â”‚ â”‚
â”‚ â”‚  âš  Busy odĹ‚ączone:       5 (Bus-10, Bus-11, Bus-12, ...)         â”‚ â”‚
â”‚ â”‚  âś“ Dangling elements:    0                                        â”‚ â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚                                                                         â”‚
â”‚ â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚ â”‚ OPCJE WIDOKU                                                      â”‚ â”‚
â”‚ â”‚  [ ] PokaĹĽ tylko aparaty OPEN                                     â”‚ â”‚
â”‚ â”‚  [ ] PokaĹĽ tylko aparaty out-of-service                           â”‚ â”‚
â”‚ â”‚  [x] PodĹ›wietl Islands na SLD                                     â”‚ â”‚
â”‚ â”‚  [x] Synchronizuj wybĂłr z SLD/Tree                                â”‚ â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚                                                                         â”‚
â”‚ [Print / Export â–Ľ] [Help]                                              â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

**Funkcje MUST:**
1. **Lista aparatĂłw**: wszystkie Switch z modelu, sortowalne, filtrowalne
2. **Szybkie wyszukiwanie**: po nazwie/ID (regex support)
3. **Toggle State**: przeĹ‚ączenie OPEN â†” CLOSED (z potwierdzeniem, jeĹ›li Result = FRESH)
4. **Batch Operations**: menu do grupowej zmiany stanĂłw (zaznaczenie wielu + akcja)
5. **Restore Normal State**: powrĂłt do stanu bazowego Case (Case.baseline_switching_state)
6. **Topology Checks**: sekcja walidacji (liczba Islands, Islands bez Source, dangling buses)
7. **Opcje widoku**: filtry szybkie (tylko OPEN, tylko out-of-service)
8. **Synchronizacja**: wybĂłr aparatu w Explorerze → podĹ›wietlenie na SLD + fokus w Element Inspector
9. **Print/Export**: wydruk listy aparatĂłw + Island summary (PDF/Excel)

---

### 3.2 Integracja z SLD (BINDING)

**Zasada (1:1 z SLD_UI_CONTRACT.md):** Stany aparatĂłw na SLD są **zawsze jednoznaczne** (symbol + kolor stanu).

#### 3.2.1 Symbolika aparatĂłw na SLD

| Stan | Symbol SLD | Kolor |
|------|-----------|-------|
| **CLOSED** | â”€â”€â—Źâ”€â”€ (symbol zamknięty) | Czarny (normalny) |
| **OPEN** | â”€â”€ â”€â”€ (symbol otwarty, przerwa) | Niebieski (stan otwarty) |
| **out-of-service** | â”„â”„ â”„â”„ (przerywany, szary) | Szary (wyĹ‚ączony z obliczeĹ„) |

**MUST:** PrzeĹ‚ączenie aparatu (OPEN â†” CLOSED) w Switching Explorer → natychmiastowa zmiana symbolu na SLD (bez odĹ›wieĹĽania strony).

---

#### 3.2.2 Natychmiastowa zmiana Effective Topology

**INVARIANT:** Zmiana stanu aparatu → przeliczenie Effective Topology → aktualizacja Islands → aktualizacja overlay SLD.

**Pipeline (synchroniczny, < 100 ms):**
```
User: Toggle CB-01 (CLOSED → OPEN)
      â”‚
      â–Ľ
NetworkModel.update(Switch.state = OPEN)
      â”‚
      â–Ľ
EffectiveTopologyCalculator.recalculate()  â† graph traversal (NOT solver)
      â”‚
      â–Ľ
IslandDetector.detect_islands()  â† connected components (NOT solver)
      â”‚
      â–Ľ
SLD.update_overlay(Islands)  â† podĹ›wietlenie wysp (kolorowanie tĹ‚a Bus)
      â”‚
      â–Ľ
TopologyChecks.refresh()  â† aktualizacja Topology Checks (liczba wysp)
```

**FORBIDDEN:**
- OpĂłĹşnione przeliczenie topologii (uĹĽytkownik musi kliknąć "Refresh")
- Oczekiwanie na uruchomienie solvera (PF, SC) do aktualizacji Islands
- Przechowywanie "starych" Islands po zmianie stanu aparatu

---

#### 3.2.3 Overlay Islands na SLD

**Cel:** Wizualizacja podziaĹ‚u sieci na wyspy (Islands) jako overlay SCADA, **NIE CAD**.

**MUST:** Overlay Islands dziaĹ‚a w trybie **SCADA** (zgodnie z SLD_RENDER_LAYERS_CONTRACT.md, jeĹ›li istnieje).

**Warianty wizualizacji (implementacja wybieralna):**

| Wariant | Opis | PrzykĹ‚ad |
|---------|------|----------|
| **Kolorowanie tĹ‚a Bus** | KaĹĽda Island = inny kolor tĹ‚a | Island-1: zielony, Island-2: niebieski, Island-3: ĹĽĂłĹ‚ty |
| **Obrys wyspy** | Linia obrysowa wokĂłĹ‚ Bus naleĹĽących do Island | Linia przerywana, gruboĹ›ć 2px |
| **Etykieta Island** | Etykieta tekstowa na SLD | "Island-1 (5 Bus, 1 Source)" |

**MUST:** Legenda kolorĂłw Islands widoczna w rogu SLD (lub w panelu Switching Explorer).

**PrzykĹ‚ad overlay (ASCII):**
```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ SLD (Effective Topology + Islands overlay)                  â”‚
â”‚                                                              â”‚
â”‚   â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—                         â”‚
â”‚   â•‘ Island-1 (zielony)            â•‘                         â”‚
â”‚   â•‘  Bus-01 â•â•â•â•â•¦â•â•â•â• Bus-02      â•‘                         â”‚
â”‚   â•‘             â•‘                 â•‘                         â”‚
â”‚   â•‘          [Source]             â•‘                         â”‚
â”‚   â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•©â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•ť                         â”‚
â”‚                 â•‘                                            â”‚
â”‚                 â•‘  CB-OPEN (aparat OPEN — granica wysp)     â”‚
â”‚                 â•‘                                            â”‚
â”‚   â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•©â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—                         â”‚
â”‚   â•‘ Island-2 (niebieski)          â•‘                         â”‚
â”‚   â•‘  Bus-03 â•â•â•â•â•¦â•â•â•â• Bus-04      â•‘                         â”‚
â”‚   â•‘             â•‘                 â•‘                         â”‚
â”‚   â•‘         (brak Source)         â•‘  â† ostrzeĹĽenie          â”‚
â”‚   â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•ť                       â”‚
â”‚                                                              â”‚
â”‚ Legenda:                                                     â”‚
â”‚  â–  Island-1 (Energized, 1 Source)                           â”‚
â”‚  â–  Island-2 (De-energized, 0 Source)                        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

---

### 3.3 Integracja z Results Browser (BINDING)

**Zasada (invalidation semantics):** Zmiana stanĂłw aparatĂłw **MAY** invalidate Results (jeĹ›li obowiązuje kontrakt invalidation).

#### 3.3.1 Invalidation Rule (zgodnie z ui_canonical_parity.md)

**MUST:** Po zmianie stanu aparatu (OPEN â†” CLOSED):
1. Status wynikĂłw Case przechodzi w stan **OUTDATED** (jeĹ›li wyniki istniaĹ‚y)
2. UĹĽytkownik widzi banner ostrzeĹĽenia:
   ```
   âš  Wyniki obliczeĹ„ są NIEAKTUALNE (zmieniono topologię).
      [Uruchom ponownie obliczenia] [Anuluj zmiany]
   ```
3. Results Browser pokazuje ikonę **OUTDATED** przy Case

**FORBIDDEN:**
- Cicha zmiana topologii bez sygnalizacji wpĹ‚ywu na wyniki
- Automatyczne uruchomienie solverĂłw po zmianie stanu aparatu (uĹĽytkownik decyduje)
- Usunięcie wynikĂłw bez ostrzeĹĽenia

---

#### 3.3.2 WidocznoĹ›ć wynikĂłw w Results Browser

**MUST:** Results Browser pokazuje:
- **Listę Case'Ăłw** z statusem wynikĂłw (NONE / FRESH / OUTDATED)
- **Filtr**: "PokaĹĽ tylko Case z FRESH results"
- **Akcja**: "Mark all Cases as OUTDATED" (po zmianie stanĂłw aparatĂłw)

**PrzykĹ‚ad (ASCII):**
```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ RESULTS BROWSER                                              â”‚
â”‚                                                              â”‚
â”‚ Case: SC-MAX                                                 â”‚
â”‚   Status: âš  OUTDATED (topologia zmieniona: 2026-01-28)      â”‚
â”‚   Last Run: 2026-01-27 14:30                                 â”‚
â”‚   [Re-run Calculation] [View Outdated Results]              â”‚
â”‚                                                              â”‚
â”‚ Case: SC-MIN                                                 â”‚
â”‚   Status: âś“ FRESH                                            â”‚
â”‚   Last Run: 2026-01-28 09:15                                 â”‚
â”‚   [View Results]                                             â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

---

### 3.4 Integracja z Topology Tree (jeĹ›li istnieje, zgodnie z Phase 2.x.2)

**Zasada (SINGLE GLOBAL FOCUS):** WybĂłr aparatu w Switching Explorer synchronizuje Topology Tree, SLD, Element Inspector.

#### 3.4.1 Synchronizacja selekcji (4-widokowa)

**MUST:**
1. Klik na aparacie w Switching Explorer → podĹ›wietlenie w Topology Tree (rozwinięcie Ĺ›cieĹĽki)
2. Klik na aparacie w Topology Tree → podĹ›wietlenie w Switching Explorer (scroll do wiersza)
3. Klik na aparacie na SLD → podĹ›wietlenie w Switching Explorer + Tree
4. Otwarcie Element Inspector (zakĹ‚adka Switch) → odczyt Global Focus

**PrzykĹ‚ad (ASCII — synchronizacja):**
```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ TOPOLOGY TREE            â”‚ SWITCHING EXPLORER                  â”‚
â”‚                          â”‚                                     â”‚
â”‚  Project-01              â”‚  ID   Name    Type  State           â”‚
â”‚   â””â”€ Station-A           â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€     â”‚
â”‚       â””â”€ VoltageLevel-15 â”‚  002  CB-02   BRK   â—Ź CLOSED  â†â”€â”€â” â”‚
â”‚           â”śâ”€ Bus-01      â”‚                                  â”‚ â”‚
â”‚           â”śâ”€ Bus-02      â”‚ [podĹ›wietlony wiersz]            â”‚ â”‚
â”‚           â”śâ”€ CB-01       â”‚                                  â”‚ â”‚
â”‚           â”śâ”€ CB-02  â†â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚           â””â”€ Line-01     â”‚                                     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
          â–˛                            â”‚
          â”‚                            â”‚
          â””â”€â”€â”€â”€â”€â”€â”€ Global Focus = CB-02 (synchronizacja)
```

---

#### 3.4.2 Stan aparatu w Topology Tree

**MUST:** Topology Tree pokazuje:
- Ikonę stanu aparatu: **â—Ź** (CLOSED) / **â—‹** (OPEN)
- PrzynaleĹĽnoĹ›ć do Island (opcjonalnie, jako tooltip)

**PrzykĹ‚ad (ASCII — Topology Tree):**
```
Topology Tree:
  Project-01
   â””â”€ Station-A
       â””â”€ VoltageLevel-15
           â”śâ”€ Bus-01 (Island-1)
           â”śâ”€ CB-01 â—Ź (CLOSED, Island-1)
           â”śâ”€ DS-01 â—‹ (OPEN, — boundary)
           â”śâ”€ Bus-02 (Island-2)
           â””â”€ CB-02 â—Ź (CLOSED, Island-2)
```

---

### 3.5 Integracja z Element Inspector (BINDING)

**Cel:** Element Inspector pokazuje szczegĂłĹ‚y aparatu (zakĹ‚adka "Switch").

#### 3.5.1 ZakĹ‚adki Element Inspector dla Switch

**MUST:** Element Inspector dla Switch zawiera zakĹ‚adki:

| ZakĹ‚adka | ZawartoĹ›ć |
|----------|-----------|
| **Overview** | ID, Name, Type, State, From Bus, To Bus, Island ID, In Service |
| **Parameters** | Parametry techniczne (jeĹ›li istnieją: rated_current, breaking_capacity) |
| **Switching History** | Historia zmian stanu (timestamp, user, OPEN → CLOSED) |
| **Topology Impact** | WpĹ‚yw na Islands (Before/After toggle) |
| **Results** | Brak (Switch nie ma wynikĂłw solverĂłw — to aparat bez impedancji) |

**PrzykĹ‚ad (ASCII — Element Inspector):**
```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ ELEMENT INSPECTOR: Switch CB-01                              â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [Overview] [Parameters] [Switching History] [Topology Impact]â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                              â”‚
â”‚ OVERVIEW                                                     â”‚
â”‚  ID:            CB-01                                        â”‚
â”‚  Name:          Circuit Breaker 01                           â”‚
â”‚  Type:          BREAKER                                      â”‚
â”‚  State:         â—Ź CLOSED                                     â”‚
â”‚  From Bus:      Bus-01 (15 kV)                               â”‚
â”‚  To Bus:        Bus-02 (15 kV)                               â”‚
â”‚  Island ID:     Island-1                                     â”‚
â”‚  In Service:    âś“ True                                       â”‚
â”‚                                                              â”‚
â”‚  [Toggle State: OPEN â†” CLOSED]                               â”‚
â”‚                                                              â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

---

#### 3.5.2 Akcja Toggle State w Element Inspector

**MUST:**
- Przycisk [Toggle State] w Element Inspector → zmiana stanu Switch
- Natychmiastowa aktualizacja Effective Topology + Islands
- Synchronizacja z Switching Explorer (wiersz zaktualizowany)
- Synchronizacja z SLD (symbol zaktualizowany)

**FORBIDDEN:**
- Toggle State bez ostrzeĹĽenia o invalidacji wynikĂłw (jeĹ›li Result = FRESH)
- Brak synchronizacji po Toggle

---

### 3.6 Walidacja topologii (pre-solver, NOT-A-SOLVER)

**Cel:** Switching Explorer musi pokazywać sekcję **Topology Checks** (pre-solver validation).

#### 3.6.1 Topology Checks — lista sprawdzeĹ„

**MUST:** Topology Checks zawiera:

| Check | Opis | Status |
|-------|------|--------|
| **Liczba Islands** | Liczba izolowanych wysp (connected components) | Informacyjny (liczba) |
| **Islands bez Source** | Lista Islands bez ĹĽadnego Source | âš  WARNING |
| **Busy odĹ‚ączone (dangling)** | Bus bez ĹĽadnego poĹ‚ączenia (degree = 0) | âš  WARNING |
| **Source odĹ‚ączony (dangling)** | Source na Bus bez poĹ‚ączeĹ„ | âš  WARNING |
| **Islands z wieloma Source** | Jedna Island z > 1 Source (potential conflict) | Informacyjny |

**PrzykĹ‚ad (ASCII — Topology Checks):**
```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ TOPOLOGY CHECKS (pre-solver validation)                     â”‚
â”‚                                                              â”‚
â”‚  âś“ Liczba Islands:         3                                â”‚
â”‚  âš  Islands bez Source:     Island-2, Island-3               â”‚
â”‚      (Power Flow moĹĽe nie zbiegać)                          â”‚
â”‚  âš  Busy odĹ‚ączone:         5 (Bus-10, Bus-11, Bus-12, ...) â”‚
â”‚  âś“ Dangling elements:      0                                â”‚
â”‚  â„ą Islands z > 1 Source:   Island-1 (2 Source)              â”‚
â”‚                                                              â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

**NOT-A-SOLVER rule:** Topology Checks **NIE wykonuje** obliczeĹ„ fizycznych. To wyĹ‚ącznie graph analysis (degree, connected components, Source presence).

---

#### 3.6.2 FORBIDDEN w Topology Checks

**ZABRONIONE:**
- Wykonywanie obliczeĹ„ prądĂłw, napięć w Topology Checks (to Solver Layer)
- Prezentowanie statusu "Energized" jako wyniku Power Flow (to interpretacja topologiczna, NIE wynik PF)
- Automatyczna "naprawa" topologii (przeĹ‚ączanie aparatĂłw bez zgody uĹĽytkownika)
- Ukrywanie ostrzeĹĽeĹ„ (wszystkie WARNING widoczne)

---

### 3.7 Tryby pracy Switching Explorer (MAX DANYCH, MAX KONTROLA)

**Zasada (benchmark-grade):** Brak uproszczeĹ„. Wszystkie aparaty widoczne, wszystkie opcje dostępne.

#### 3.7.1 Panele rozwijane i modale

**ALLOWED (opcjonalne rozszerzenia):**

| Panel/Modal | Opis | DostępnoĹ›ć |
|-------------|------|-----------|
| **Batch Switching** | Symulacja wielu przeĹ‚ączeĹ„ jako zestaw zmian (Apply All / Revert All) | Dropdown menu "Batch Operations" |
| **Switching Sequence** | KolejnoĹ›ć operacji Ĺ‚ączeniowych (opis, bez automatycznego wykonywania) | Modal "Define Sequence" |
| **Restore Normal State** | PowrĂłt do stanu bazowego Case (Case.baseline_switching_state) | Przycisk w Switching Explorer |

**MUST:** Wszystkie operacje grupowe wymagają **potwierdzenia** (confirmation dialog):
```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ POTWIERDZENIE                                                â”‚
â”‚                                                              â”‚
â”‚  Czy chcesz zastosować 12 zmian stanĂłw aparatĂłw?            â”‚
â”‚   - CB-01: CLOSED → OPEN                                    â”‚
â”‚   - CB-02: OPEN → CLOSED                                    â”‚
â”‚   - DS-01: CLOSED → OPEN                                    â”‚
â”‚   ...                                                        â”‚
â”‚                                                              â”‚
â”‚  âš  Uwaga: Ta operacja invaliduje wyniki obliczeĹ„.           â”‚
â”‚                                                              â”‚
â”‚  [Apply All] [Cancel]                                       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

---

#### 3.7.2 FORBIDDEN — uproszczenia

**ZABRONIONE:**
- "Basic Mode" (ukrywający aparaty out-of-service)
- Automatyczne filtrowanie aparatĂłw (uĹĽytkownik decyduje)
- Ukrywanie ostrzeĹĽeĹ„ "Islands bez Source" (dla uproszczenia UI)
- "Auto-repair topology" (automatyczne przeĹ‚ączanie aparatĂłw)

---

### 3.8 Wydruk / Raport (drukowany PDF)

**Zasada (Print-First Contract, zgodnie z SLD_UI_CONTRACT.md):** Ekran = PDF (bez utraty informacji).

#### 3.8.1 ZawartoĹ›ć wydruku

**MUST:** Wydruk Switching Explorer zawiera:

| Sekcja | ZawartoĹ›ć |
|--------|-----------|
| **NagĹ‚Ăłwek** | Project Name, Case Name, Snapshot Timestamp, User |
| **Lista aparatĂłw** | Tabela: ID, Name, Type, State, From Bus, To Bus, Island ID |
| **Island Summary** | Tabela: Island ID, Number of Bus, Number of Source, Energized (Yes/No) |
| **Topology Checks** | Lista ostrzeĹĽeĹ„ (Islands bez Source, dangling Bus) |
| **RĂłĹĽnice vs baseline** | Tabela aparatĂłw z rĂłĹĽnymi stanami względem Case.baseline_switching_state |

**PrzykĹ‚ad (ASCII — wydruk PDF, strona 1):**
```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                  SWITCHING STATE REPORT                      â”‚
â”‚                                                              â”‚
â”‚  Project:       MV-Network-Demo                              â”‚
â”‚  Case:          SC-MAX                                       â”‚
â”‚  Snapshot:      2026-01-28 14:30:00                          â”‚
â”‚  User:          Jan Kowalski                                 â”‚
â”‚  Generated:     2026-01-28 14:35:12                          â”‚
â”‚                                                              â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                              â”‚
â”‚  LISTA APARATĂ“W (250 elementĂłw)                              â”‚
â”‚                                                              â”‚
â”‚  ID    Name       Type  State    From Bus  To Bus   Island  â”‚
â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚  001   CB-01      BRK   â—Ź CLOSED Bus-01    Bus-02   Isl-1   â”‚
â”‚  002   DS-01      DISC  â—‹ OPEN   Bus-02    Bus-03   —       â”‚
â”‚  003   CB-02      BRK   â—Ź CLOSED Bus-03    Bus-04   Isl-2   â”‚
â”‚  ...   ...        ...   ...      ...       ...      ...     â”‚
â”‚                                                              â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                              â”‚
â”‚  ISLAND SUMMARY                                              â”‚
â”‚                                                              â”‚
â”‚  Island  Buses  Sources  Energized                           â”‚
â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€                    â”‚
â”‚  Isl-1     15      1       Yes                               â”‚
â”‚  Isl-2     10      0       No   â† âš  brak Source              â”‚
â”‚  Isl-3      5      0       No   â† âš  brak Source              â”‚
â”‚                                                              â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                              â”‚
â”‚  TOPOLOGY CHECKS                                             â”‚
â”‚                                                              â”‚
â”‚  âš  Islands bez Source: Isl-2, Isl-3                         â”‚
â”‚  âš  Busy odĹ‚ączone: 5 (Bus-10, Bus-11, Bus-12, ...)          â”‚
â”‚                                                              â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                              â”‚
â”‚  RĂ“Ĺ»NICE WZGLÄDEM BASELINE                                   â”‚
â”‚                                                              â”‚
â”‚  ID    Name       Baseline   Current   Change               â”‚
â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€              â”‚
â”‚  002   DS-01      CLOSED     OPEN      â—Ź → â—‹                â”‚
â”‚  007   CB-05      OPEN       CLOSED    â—‹ → â—Ź                â”‚
â”‚                                                              â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

---

## 4. Scenariusze uĹĽycia (Use Cases)

### 4.1 Scenariusz poprawny: Eksploracja stanĂłw aparatĂłw

**Aktorzy:** Operator, Designer, Analyst

**Cel:** Sprawdzenie aktualnych stanĂłw aparatĂłw i identyfikacja wysp.

**Kroki:**
1. UĹĽytkownik otwiera Switching Explorer (menu: Tools → Switching State Explorer)
2. Widzi listę wszystkich aparatĂłw z filtrami (Type, State, Feeder, Island)
3. Klika na aparat CB-01 → podĹ›wietlenie na SLD + fokus w Element Inspector
4. Widzi sekcję Topology Checks: 3 Islands, 2 bez Source
5. Widzi overlay Islands na SLD (kolorowanie tĹ‚a Bus)
6. Eksportuje raport do PDF (lista aparatĂłw + Island summary)

**Rezultat:** UĹĽytkownik ma peĹ‚ny wgląd w stany aparatĂłw i topologię efektywną.

---

### 4.2 Scenariusz poprawny: PrzeĹ‚ączenie aparatu i ocena wpĹ‚ywu

**Aktorzy:** Designer, Analyst

**Cel:** Zmiana stanu aparatu i ocena wpĹ‚ywu na Islands.

**Kroki:**
1. UĹĽytkownik otwiera Switching Explorer
2. Filtruje aparaty: Type = BREAKER, State = CLOSED
3. Wybiera CB-02 (CLOSED)
4. Klika [Toggle State] → CB-02 przechodzi w stan OPEN
5. System:
   - Przelicza Effective Topology (graph traversal)
   - Wykrywa nowe Islands (Island-1 rozdziela się na Island-1a i Island-1b)
   - Aktualizuje overlay na SLD (nowe kolory wysp)
   - Aktualizuje Topology Checks (liczba wysp: 3 → 4)
   - Pokazuje banner: âš  Wyniki obliczeĹ„ OUTDATED
6. UĹĽytkownik widzi w Element Inspector (zakĹ‚adka Topology Impact):
   ```
   Before: CB-02 CLOSED → Island-1 (15 Bus, 1 Source)
   After:  CB-02 OPEN   → Island-1a (8 Bus, 1 Source) + Island-1b (7 Bus, 0 Source)
   ```
7. UĹĽytkownik zapisuje zmianę lub cofa (Revert)

**Rezultat:** UĹĽytkownik oceniĹ‚ wpĹ‚yw zmiany stanu aparatu na topologię bez uruchamiania solverĂłw.

---

### 4.3 Scenariusz poprawny: Batch switching (operacje grupowe)

**Aktorzy:** Designer

**Cel:** Symulacja scenariusza operacyjnego (np. wyĹ‚ączenie feedera).

**Kroki:**
1. UĹĽytkownik otwiera Switching Explorer
2. Zaznacza aparaty (Ctrl+Click): CB-01, CB-02, DS-03 (wszystkie CLOSED)
3. Klika [Batch Operations â–Ľ] → [Open Selected Switches]
4. System pokazuje modal potwierdzenia:
   ```
   Czy otworzyć 3 aparaty?
     - CB-01: CLOSED → OPEN
     - CB-02: CLOSED → OPEN
     - DS-03: CLOSED → OPEN

   âš  Ta operacja invaliduje wyniki obliczeĹ„.

   [Apply] [Cancel]
   ```
5. UĹĽytkownik klika [Apply]
6. System:
   - Zmienia stany aparatĂłw
   - Przelicza Effective Topology
   - Aktualizuje Islands (1 → 4 wyspy)
   - Pokazuje banner OUTDATED

**Rezultat:** UĹĽytkownik wykonaĹ‚ operację grupową i oceniĹ‚ jej wpĹ‚yw.

---

### 4.4 Scenariusz poprawny: Restore Normal State (powrĂłt do bazowego)

**Aktorzy:** Operator, Designer

**Cel:** PrzywrĂłcenie stanu bazowego po eksperymentach.

**Kroki:**
1. UĹĽytkownik eksperymentowaĹ‚ ze stanami aparatĂłw (10 zmian)
2. Klika [Restore Normal State]
3. System pokazuje modal:
   ```
   Czy przywrĂłcić stan bazowy Case?

   Zmiany do cofnięcia:
     - CB-01: OPEN → CLOSED (baseline)
     - CB-02: CLOSED → OPEN (baseline)
     - ...

   [Restore] [Cancel]
   ```
4. UĹĽytkownik klika [Restore]
5. System przywraca Case.baseline_switching_state

**Rezultat:** Sieć wraca do stanu bazowego.

---

### 4.5 Scenariusz FORBIDDEN: Automatyczne uruchomienie solvera

**ZABRONIONE:**

**Kroki (NIE implementować):**
1. UĹĽytkownik przeĹ‚ącza aparat CB-01 (CLOSED → OPEN)
2. System automatycznie uruchamia Power Flow (bez zgody uĹĽytkownika)
3. UĹĽytkownik widzi nowe wyniki (nie wie, ĹĽe solver zostaĹ‚ uruchomiony)

**Dlaczego FORBIDDEN:**
- Naruszenie zasady "Explicit Calculate Step" (ui_canonical_parity.md)
- UĹĽytkownik traci kontrolę nad obliczeniami
- Ryzyko nieoczekiwanych wynikĂłw (np. solver nie zbiega)

**Poprawne podejĹ›cie:**
- System pokazuje banner: âš  Wyniki OUTDATED
- UĹĽytkownik decyduje, kiedy uruchomić solver

---

### 4.6 Scenariusz FORBIDDEN: Prezentacja "prądĂłw w aparacie"

**ZABRONIONE:**

**Kroki (NIE implementować):**
1. UĹĽytkownik otwiera Switching Explorer
2. Widzi kolumnę "Current [A]" w liĹ›cie aparatĂłw
3. System pokazuje prądy przepĹ‚ywające przez aparat (z wynikĂłw Power Flow)

**Dlaczego FORBIDDEN:**
- Aparat Ĺ‚ączeniowy **NIE MA** impedancji (PF-rule)
- "Prąd w aparacie" to interpretacja fizyczna (wymaga Power Flow)
- Switching Explorer to warstwa topologiczna (NOT-A-SOLVER)

**Poprawne podejĹ›cie:**
- "Prądy w aparacie" pokazywane w Results Browser (po uruchomieniu PF)
- Switching Explorer pokazuje **wyĹ‚ącznie** stan topologiczny (OPEN/CLOSED)

---

### 4.7 Scenariusz FORBIDDEN: "Auto-repair topology"

**ZABRONIONE:**

**Kroki (NIE implementować):**
1. System wykrywa Island bez Source (Island-2)
2. System automatycznie przeĹ‚ącza aparat DS-01 (OPEN → CLOSED) aby poĹ‚ączyć Islands
3. UĹĽytkownik widzi zmianę bez swojego dziaĹ‚ania

**Dlaczego FORBIDDEN:**
- Naruszenie zasady "user control" (ARCHITECTURE.md)
- Ryzyko nieoczekiwanych zmian topologii
- UĹĽytkownik traci pewnoĹ›ć, co zostaĹ‚o zmienione

**Poprawne podejĹ›cie:**
- System pokazuje ostrzeĹĽenie: âš  Island-2 bez Source
- System **SUGERUJE** akcję: "RozwaĹĽ zamknięcie DS-01 aby poĹ‚ączyć Islands"
- UĹĽytkownik decyduje, czy zastosować sugestię

---

## 5. PrzykĹ‚ady ASCII (Binding Illustrations)

### 5.1 PrzykĹ‚ad 1: Dwie wyspy (Islands) — ring otwarty

**Topologia:**
- Bus-01, Bus-02, Bus-03, Bus-04 (ring)
- Aparat CB-01 (Bus-01 â†” Bus-02): CLOSED
- Aparat CB-02 (Bus-02 â†” Bus-03): CLOSED
- Aparat CB-03 (Bus-03 â†” Bus-04): **OPEN** â† punkt otwarcia ringu
- Aparat CB-04 (Bus-04 â†” Bus-01): CLOSED
- Source-01 na Bus-01

**Effective Topology:**
```
       [Source-01]
           â”‚
         Bus-01
        â•±      â•˛
  CB-01 â—Ź      â—Ź CB-04
      â•±          â•˛
  Bus-02        Bus-04
      â”‚            â”‚
  CB-02 â—Ź      â—‹ CB-03 (OPEN — granica wysp)
      â”‚            â”‚
  Bus-03 â”€ â”€ â”€ â”€ Bus-04 (nie poĹ‚ączone topologicznie)

Islands:
  Island-1: {Bus-01, Bus-02, Bus-03, Bus-04} → wszystkie poĹ‚ączone (ring zamknięty przez CB-01, CB-02, CB-04)

Uwaga: CB-03 OPEN, ale Bus-04 jest poĹ‚ączony z Bus-01 przez CB-04 (ring zamknięty)
→ Tylko JEDNA wyspa (Island-1)
```

**CRITICAL INSIGHT:** Ring otwarty (jeden aparat OPEN) **NIE tworzy** dwĂłch wysp, jeĹ›li ring jest zamknięty przez inną Ĺ›cieĹĽkę. Islands zaleĹĽą od **wszystkich** Ĺ›cieĹĽek topologicznych.

---

### 5.2 PrzykĹ‚ad 2: Dwie wyspy (Islands) — feeder odĹ‚ączony

**Topologia:**
- Bus-01 (z Source-01)
- Bus-02 (poĹ‚ączony z Bus-01 przez CB-01: CLOSED)
- Bus-03 (poĹ‚ączony z Bus-02 przez DS-01: **OPEN** â† boundary)
- Bus-04 (poĹ‚ączony z Bus-03 przez CB-02: CLOSED)

**Effective Topology:**
```
  [Source-01]
      â”‚
    Bus-01
      â”‚
  CB-01 â—Ź (CLOSED)
      â”‚
    Bus-02
      â•‘
      â•‘  DS-01 â—‹ (OPEN — granica wysp)
      â•‘
    Bus-03
      â”‚
  CB-02 â—Ź (CLOSED)
      â”‚
    Bus-04

Islands:
  Island-1: {Bus-01, Bus-02} — Energized (zawiera Source-01)
  Island-2: {Bus-03, Bus-04} — De-energized (brak Source)
```

**Switching Explorer pokazuje:**
```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ TOPOLOGY CHECKS                                              â”‚
â”‚                                                              â”‚
â”‚  âś“ Liczba Islands:       2                                  â”‚
â”‚  âš  Islands bez Source:   Island-2 (Bus-03, Bus-04)          â”‚
â”‚                         Power Flow moĹĽe nie zbiegać!         â”‚
â”‚  âś“ Dangling elements:    0                                  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

**SLD Overlay (Islands):**
```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ SLD                                                          â”‚
â”‚                                                              â”‚
â”‚   â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—                                     â”‚
â”‚   â•‘ Island-1 (â–  zielony) — Energized                        â”‚
â”‚   â•‘   [Source-01]     â•‘                                     â”‚
â”‚   â•‘       â”‚           â•‘                                     â”‚
â”‚   â•‘     Bus-01        â•‘                                     â”‚
â”‚   â•‘       â”‚           â•‘                                     â”‚
â”‚   â•‘   CB-01 â—Ź         â•‘                                     â”‚
â”‚   â•‘       â”‚           â•‘                                     â”‚
â”‚   â•‘     Bus-02        â•‘                                     â”‚
â”‚   â•šâ•â•â•â•â•â•â•â•©â•â•â•â•â•â•â•â•â•â•â•â•ť                                     â”‚
â”‚           â•‘                                                  â”‚
â”‚        DS-01 â—‹ (OPEN — boundary, czerwona linia przerywana) â”‚
â”‚           â•‘                                                  â”‚
â”‚   â•”â•â•â•â•â•â•â•â•©â•â•â•â•â•â•â•â•â•â•â•â•—                                     â”‚
â”‚   â•‘ Island-2 (â–  niebieski) — De-energized âš                  â”‚
â”‚   â•‘     Bus-03        â•‘                                     â”‚
â”‚   â•‘       â”‚           â•‘                                     â”‚
â”‚   â•‘   CB-02 â—Ź         â•‘                                     â”‚
â”‚   â•‘       â”‚           â•‘                                     â”‚
â”‚   â•‘     Bus-04        â•‘                                     â”‚
â”‚   â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•ť                                     â”‚
â”‚                                                              â”‚
â”‚ Legenda:                                                     â”‚
â”‚  â–  Island-1 (Energized, 1 Source, 2 Bus)                    â”‚
â”‚  â–  Island-2 (De-energized, 0 Source, 2 Bus) â† ostrzeĹĽenie   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

---

### 5.3 PrzykĹ‚ad 3: Ring otwarty w dwĂłch miejscach → dwie wyspy

**Topologia:**
- Bus-01 (z Source-01)
- Bus-02, Bus-03, Bus-04 (ring)
- Aparat CB-01 (Bus-01 â†” Bus-02): CLOSED
- Aparat CB-02 (Bus-02 â†” Bus-03): **OPEN** â† pierwszy punkt otwarcia
- Aparat CB-03 (Bus-03 â†” Bus-04): **OPEN** â† drugi punkt otwarcia
- Aparat CB-04 (Bus-04 â†” Bus-01): CLOSED

**Effective Topology:**
```
  [Source-01]
      â”‚
    Bus-01
   â•±      â•˛
CB-01â—Ź   â—ŹCB-04
  â”‚        â”‚
Bus-02  Bus-04
  â•‘        â•‘
  â•‘CB-02â—‹â—‹CB-03 (oba OPEN)
  â•‘        â•‘
  Bus-03 (izolowany)

Islands:
  Island-1: {Bus-01, Bus-02, Bus-04} — Energized (zawiera Source-01)
  Island-2: {Bus-03} — De-energized (izolowany, brak Ĺ›cieĹĽki do Bus-01)
```

**Switching Explorer pokazuje:**
```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ TOPOLOGY CHECKS                                              â”‚
â”‚                                                              â”‚
â”‚  âś“ Liczba Islands:       2                                  â”‚
â”‚  âš  Islands bez Source:   Island-2 (Bus-03)                  â”‚
â”‚  âš  Bus izolowany:        Bus-03 (brak poĹ‚ączeĹ„ topologicznych)â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

---

## 6. Regr Compliance Checklist (Implementacja zgodna z kontraktem, jeĹ›li:)

**Implementacja zgodna z SWITCHING_STATE_EXPLORER_CONTRACT.md, jeĹ›li:**

- [ ] **Switching Explorer panel** zaimplementowany jako rĂłwnorzędny widok (z SLD, Results Browser, Topology Tree)
- [ ] **Lista aparatĂłw** pokazuje wszystkie Switch z filtrami (Type, State, In Service, Feeder, Island)
- [ ] **Szybkie wyszukiwanie** po nazwie/ID (regex support)
- [ ] **Toggle State** (OPEN â†” CLOSED) z natychmiastową aktualizacją Effective Topology + Islands
- [ ] **Effective Topology** przeliczana algorytmicznie (graph traversal, NOT solver) po kaĹĽdej zmianie stanu
- [ ] **Islands** wykrywane algorytmicznie (connected components, NOT solver)
- [ ] **SLD overlay Islands** (kolorowanie tĹ‚a Bus lub obrys wysp)
- [ ] **Topology Checks** pokazują: liczba Islands, Islands bez Source, dangling Bus (pre-solver validation)
- [ ] **Invalidation Rule**: zmiana stanu aparatu → Result status = OUTDATED (z bannerem ostrzeĹĽenia)
- [ ] **Synchronizacja 4-widokowa**: wybĂłr aparatu w Explorerze → podĹ›wietlenie SLD/Tree/Inspector
- [ ] **Element Inspector (Switch)**: zakĹ‚adki Overview, Parameters, Switching History, Topology Impact
- [ ] **Batch Operations**: grupowa zmiana stanĂłw (z potwierdzeniem)
- [ ] **Restore Normal State**: powrĂłt do Case.baseline_switching_state
- [ ] **Print/Export**: wydruk listy aparatĂłw + Island summary (PDF/Excel)
- [ ] **NOT-A-SOLVER rule**: Switching Explorer **NIE wykonuje** obliczeĹ„ fizycznych (prądy, napięcia)
- [ ] **FORBIDDEN: Auto-repair topology** — system **NIE przeĹ‚ącza** aparatĂłw bez zgody uĹĽytkownika
- [ ] **FORBIDDEN: Prezentacja "prądĂłw w aparacie"** — to wynik Power Flow, nie topologii
- [ ] **FORBIDDEN: Automatyczne uruchomienie solvera** po zmianie stanu aparatu

---

## 7. Terminologia i zgodnoĹ›ć z benchmark

### 7.1 Mapowanie terminĂłw benchmark → MV-DESIGN-PRO

| benchmark Term | MV-DESIGN-PRO Term | Opis |
|-------------------|--------------------|------|
| **Switch** | Switch | Aparat Ĺ‚ączeniowy (BREAKER, DISCONNECTOR, LOAD_SWITCH, FUSE) |
| **Topology** | Effective Topology | Graf sieci po uwzględnieniu stanĂłw aparatĂłw i `in_service` |
| **Island** | Island | SpĂłjna skĹ‚adowa grafu (connected component) |
| **Out of Service** | `in_service = False` | Element wyĹ‚ączony z obliczeĹ„ |
| **Pre-calculation Check** | Topology Checks | Walidacja topologii przed uruchomieniem solvera |
| **Study Case** | Case | Przypadek obliczeniowy (konfiguracja + opcjonalnie wyniki) |

---

### 7.2 ZgodnoĹ›ć z benchmark

| benchmark Feature | MV-DESIGN-PRO Equivalent | Status |
|--------------|--------------------------|--------|
| **Switching View** | Switching State Explorer | âś… FULL |
| **Island Detection** | Island Detector (graph traversal) | âś… FULL |
| **Topology Validator** | Topology Checks (pre-solver) | âś… FULL |
| **Switch Status Overlay (SLD)** | SLD overlay Islands + switch symbols | âś… FULL |
| **Batch Switching Operations** | Batch Operations (group toggle) | âś… FULL |

---

## 8. Change Log

| Data | Wersja | Zmiany |
|------|--------|--------|
| 2026-01-28 | 1.0 | Utworzenie SWITCHING_STATE_EXPLORER_CONTRACT.md (Phase 2.x.3, DOC-ONLY) |

---

**KONIEC DOKUMENTU**

**STATUS:** CANONICAL (BINDING) — kaĹĽda implementacja Switching State Explorer MUSI być zgodna z tym kontraktem.

