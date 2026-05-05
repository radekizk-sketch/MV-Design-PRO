# ADR-002: UnitSystem i BaseQuantities

## Status
Accepted

## Context
System wymaga spĂłjnego i deterministycznego systemu jednostek, aby utrzymać jakoĹ›ć
obliczeĹ„ na poziomie DIgSILENT benchmark. Obliczenia muszą mieć jawne bazy
(Ubase, Sbase, Zbase, Ibase) oraz przewidywalne konwersje w caĹ‚ym Ĺ‚aĹ„cuchu analitycznym.
JednoczeĹ›nie nie wolno mieszać logiki jednostek z solverami ani UI.

## Decision
Wprowadzamy centralny model `BaseQuantities` i `UnitSystem` w warstwie domenowej.
- `BaseQuantities` przechowuje Ubase (kV) i Sbase (MVA) oraz wyprowadza Zbase (Î©) i Ibase (kA).
- `UnitSystem` zapewnia jawne konwersje dla napięć, mocy, prądĂłw i impedancji.
- Konwersje pozostają deterministyczne i nie wprowadzają zaleĹĽnoĹ›ci solverĂłw od I/O.

## Consequences
- Wszystkie nowe moduĹ‚y aplikacyjne i analityczne uĹĽywają `UnitSystem` jako ĹşrĂłdĹ‚a prawdy.
- DeterministycznoĹ›ć jest zachowana przez staĹ‚e definicje baz i jawne formuĹ‚y.
- Zmiany baz w przyszĹ‚oĹ›ci wymagają osobnego ADR i testĂłw kontraktowych.

