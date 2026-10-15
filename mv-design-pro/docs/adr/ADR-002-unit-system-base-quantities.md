# ADR-002: UnitSystem i BaseQuantities

## Status
Accepted — **EXTENDED by K-05 (2026-09-30, O-61/O-63, V12K-343):** rejestr jednostek inżynierskich (kV, MVA, Ω, A, kA, s, pu — sufiksy `_kv/_mva/_ohm`) zadeklarowany RAZ w istniejącym `backend/src/domain/units.py` (nie nowy moduł); `Quantity(value, unit)` z `UnitDimension` wyłącznie na granicy (OpenAPI `x-unit`, jeden formatter ui2, ten sam dla PDF/DOCX/LaTeX); `BaseQuantities` (0 importerów poza `domain/`) albo staje się jedynym konwerterem pu na granicy, albo jest kasowana w karcie JEDNOSTKI-GRANICA — bez martwego kodu. Opcja B (zmiana sygnatur `ShortCircuitResult`/`PowerFlowResult`) odrzucona.

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

