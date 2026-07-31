# ADR-002: UnitSystem i BaseQuantities

## Status
Accepted

## Context
System wymaga spójnego i deterministycznego systemu jednostek, aby utrzymać jakość
obliczeń na poziomie DIgSILENT benchmark. Obliczenia muszą mieć jawne bazy
(Ubase, Sbase, Zbase, Ibase) oraz przewidywalne konwersje w całym łańcuchu analitycznym.
Jednocześnie nie wolno mieszać logiki jednostek z solverami ani UI.

## Decision
Wprowadzamy centralny model `BaseQuantities` i `UnitSystem` w warstwie domenowej.
- `BaseQuantities` przechowuje Ubase (kV) i Sbase (MVA) oraz wyprowadza Zbase (Ω) i Ibase (kA).
- `UnitSystem` zapewnia jawne konwersje dla napięć, mocy, prądów i impedancji.
- Konwersje pozostają deterministyczne i nie wprowadzają zależności solverów od I/O.

## Consequences
- Wszystkie nowe moduły aplikacyjne i analityczne używają `UnitSystem` jako źródła prawdy.
- Deterministyczność jest zachowana przez stałe definicje baz i jawne formuły.
- Zmiany baz w przyszłości wymagają osobnego ADR i testów kontraktowych.

