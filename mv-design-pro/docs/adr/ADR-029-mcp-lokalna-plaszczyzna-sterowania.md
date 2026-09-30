# ADR-029: MCP jako lokalna płaszczyzna sterowania nad serwisami aplikacyjnymi (OD-13)

**Status:** ACCEPTED (2026-09-30, decyzja doradcy z delegacją właściciela O-59 — rejestr O-63/O-71 w `../plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §2.3; konflikt OD-13 vs K-16 rozstrzygnięty wpisem V12K-346)
**Data:** 2026-09-30
**Dokumenty źródłowe:** `../plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` §7 OD-13; `../plan/MISJA_DOMKNIECIA_PRODUKTU_2026-09.md` §15; decyzja właściciela 2026-08-05 w `../plan/PLAN_PRZEBUDOWY_10X_2026-07.md` (pkt 2: „NIE — nie wychodzimy poza localhost”)

## Kontekst
Misja domknięcia §15 wymaga MCP (Model Context Protocol) „z uprawnieniami” jako płaszczyzny sterowania agenta nad projektem. Decyzja właściciela 2026-08-05 (`PLAN_PRZEBUDOWY_10X_2026-07.md`: „System pozostaje narzędziem jednostanowiskowym; zakres F1.1 (auth/perymetr) NIE wchodzi do realizacji”) wyklucza ekspozycję sieciową, konta i role. MAPA §7 (OD-13) nazwała to konfliktem dwóch decyzji właściciela. Pomiar 2026-09-30: `grep -rln '\bmcp\b' backend/src` = 0 — żadnego serwera MCP ani APIRoutera dla MCP w repo nie ma.

## Decyzja
Opcja A: MCP jako **lokalna płaszczyzna sterowania** (stdio/localhost, bez uwierzytelniania sieciowego) nad **tymi samymi serwisami aplikacyjnymi co REST**: operacje domenowe z walidatorem ENM, dziennik, rewizje/checkout, scenariusze (ADR-016), stan efektywny (ADR-017), biegi kanoniczne, gotowość. Zakresy narzędzi: `read` / `propose` / `apply`; `apply` wyłącznie przez dziennik z CAS na rewizji (rewizja bazowa == HEAD, inaczej odmowa nazwana; rollback jako operacja dziennika). Zero fizyki, zero mutacji poza operacjami domenowymi.

Korekty względem MAPA §7:
1. **OD-27 NIE jest otwarta** — właściciel 2026-08-05 rozstrzygnął „nie wychodzimy poza localhost”; tożsamość = jedno stanowisko lokalne; pole autora typowane `Autor{rodzaj: uzytkownik|agent, id}` z `id` stałym „local” dla użytkownika — bez kont, bez ról, bez pytania do właściciela (K-13 zamknięta tą samą decyzją, V12K-345; ADR-028 w zakresie `ModelRevision` bez zmian).
2. **Spójność z K-16** (montowanie tras wyłącznie z konsumentem): narzędzia MCP NIE są `APIRouter`ami (nic do montowania), więc `scripts/router_mount_guard.py` i reguła K-16 pozostają bez klasy wyjątku; konsumentem narzędzia MCP jest ścieżka użytkownika wykonywana przez agenta w jego imieniu (misja §15), pilnowana per narzędzie nowym guardem `mcp_tool_consumer` (narzędzie → serwis aplikacyjny + test równoważności z REST), nie klasą wyjątku.

## Konsekwencje
- Karta W12-MCP (fala 5, po ADR-016, ADR-017 i W5-C): (1) `read` + `propose` (propozycja = `OperatingScenario`/komendy z deltą i dowodem, bez zapisu bazy); (2) `apply` po W5-C z CAS; guard importów `mcp/**` (bez `solvers/**`, bez zapisu do store poza dziennikiem).
- Ukończenie: test klasy narzędzie × zakres (`apply` niedostępne w sesji `read`; `propose` nie zmienia hasha bazy); test równoważności: te same wywołania MCP i REST → identyczne hashe rewizji i biegów; `router_mount_guard` i jego self-test bez zmian; `mcp_tool_consumer_guard` z testem czysty/naruszający.
- MAPA: zależność W12 i W9 od „decyzji OD-13” zdjęta — OD-13 rozstrzygnięta tym ADR; `KARTY_OTWARTE_2026-09.md` (przesłanka karty wykonawcy biegów: narzędzie jednostanowiskowe) bez zmian.

## Alternatywy odrzucone
- MCP z tożsamością użytkownika (konta, role, token sieciowy): sprzeczne z decyzją 2026-08-05 i bez konsumenta.
- Klasa wyjątku „API integracyjne twin” w `router_mount_guard`: trasa bez konsumenta jest fantomem (K-16, V12K-346).
- Osobna warstwa serwisów dla MCP obok REST: druga prawda operacji domenowych.
