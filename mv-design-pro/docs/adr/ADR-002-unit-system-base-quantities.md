# ADR-002: UnitSystem i BaseQuantities

## Status
Accepted

## Context
System wymaga spĂłjnego i deterministycznego systemu jednostek, aby utrzymaÄ‡ jakoĹ›Ä‡
obliczeĹ„ na poziomie DIgSILENT benchmark. Obliczenia muszÄ… mieÄ‡ jawne bazy
(Ubase, Sbase, Zbase, Ibase) oraz przewidywalne konwersje w caĹ‚ym Ĺ‚aĹ„cuchu analitycznym.
JednoczeĹ›nie nie wolno mieszaÄ‡ logiki jednostek z solverami ani UI.

## Decision
Wprowadzamy centralny model `BaseQuantities` i `UnitSystem` w warstwie domenowej.
- `BaseQuantities` przechowuje Ubase (kV) i Sbase (MVA) oraz wyprowadza Zbase (Î©) i Ibase (kA).
- `UnitSystem` zapewnia jawne konwersje dla napiÄ™Ä‡, mocy, prÄ…dĂłw i impedancji.
- Konwersje pozostajÄ… deterministyczne i nie wprowadzajÄ… zaleĹĽnoĹ›ci solverĂłw od I/O.

## Consequences
- Wszystkie nowe moduĹ‚y aplikacyjne i analityczne uĹĽywajÄ… `UnitSystem` jako ĹşrĂłdĹ‚a prawdy.
- DeterministycznoĹ›Ä‡ jest zachowana przez staĹ‚e definicje baz i jawne formuĹ‚y.
- Zmiany baz w przyszĹ‚oĹ›ci wymagajÄ… osobnego ADR i testĂłw kontraktowych.

