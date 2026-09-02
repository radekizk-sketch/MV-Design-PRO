# ADR-013: Terminale i węzły łączności (Terminal / ConnectivityNode)

**Status:** PROPOSED (program Digital Twin 2026-09; do decyzji właściciela)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §6

## Kontekst
`Port`/`PortRef`/`ConnectionNode` w ENM są jawnie „nie fizycznymi węzłami" i nie są egzekwowane (A1-03); własność portu testowana tylko w dwóch instancjach (A10-07); gramatyka pola opiera się na szablonie konwencji, nie na portach (A7-15).

## Decyzja
Każde urządzenie przewodzące ma stałą liczbę terminali (`Terminal{terminal_id, sequence, phases: PhaseCode, connectivity_node_id}`); terminal należy do dokładnie jednego urządzenia i do co najwyżej jednego `ConnectivityNode`. Łączność zmienia się wyłącznie komendami domenowymi (`connect_terminal`, `disconnect_terminal`), które utrzymują inwariant. `ConnectivityNode` to byt łączności (nie fizyki); `TopologicalNode` jest wyprowadzany (ADR-014). Gramatyka pola i pełny tor prądu na SLD wynikają z terminali, nie z szablonu.

## Konsekwencje
- Test klasy: „dla każdego terminala liczba właścicieli == 1; dla każdego CN zbiór terminali spójny" na całym rejestrze sieci.
- Dwustronna sprzeczność modelu (gałąź z jednym końcem „w powietrzu") staje się stanem jawnym (terminal bez CN), a nie brakiem klucza w słowniku.

## Alternatywy odrzucone
- Terminale tylko dla łączników (hybryda): zostawia dwie semantyki krawędzi.
