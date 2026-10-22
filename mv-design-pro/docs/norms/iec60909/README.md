# IEC 60909-0 — pakiet źródłowy dla MV-DESIGN PRO

## Cel
Pakiet nadaje się do przekazania wykonawcy integracji jako **wejście normowo-projektowe**, nie jako pełny tekst IEC lub gotowa zgodność 2026.

## Zawartość
1. [Rejestr wydań i statusów](standard_profiles.json) — odczytywany maszynowo JSON, identyfikatory edycji, statusy, blokady.
2. [Mapa źródeł i obliczeń](NORMATIVE_EVIDENCE_2016_2026.md) — źródła pierwotne i wtórne, mapa paragrafów, zakres, źródła do dalszej walidacji.
3. [Korekta SOP](STD_IEC60909_2026_AUDYT_TWIERDZEN.md) — błędy krytyczne szkicu 2026 i twierdzenia nieudokumentowane.
4. [Kontrakt selektora](SELECTOR_IMPLEMENTATION_CONTRACT.md) — UI, StudyCase, algorytm, statusy, walidacja, White-Box, EAZ, raporty.
5. [Zestaw sprawdzeń](ACCEPTANCE_MATRIX.md) — scenariusze i niezależne testy fizyczne.

## Granice zastosowania
Wydanie 2016: istniejący solver wymaga walidacji, nie jest automatycznie zgodny. Wydanie 2026: do czasu weryfikacji oryginału i niezależnych przypadków referencyjnych **blokada produkcyjnych obliczeń deklarowanych jako IEC 60909-0:2026**.

Status polskiej adopcji PN-EN sprawdzić osobno w PKN; nie wolno dopisywać oznaczenia krajowego wyłącznie dlatego, że IEC lub EN już opublikowano.

Szkic wewnętrznego dokumentu SOP z normatywnym `k_CIS=1.2`, automatycznym `C0` dla każdego 1F i bezwarunkowym `cmax=1.05` dla nN jest odrzucony jako podstawa implementacji.

### Wdrożenie
Zgodnie z `AGENTS.md` i `docs/v12xx/KANON_V12_XX.md` najpierw ocenić konflikty, potem implementować w istniejących modułach, a nie w nowym równoległym silniku. Wprowadzanie nowego API ShortCircuitResult bez przeglądu wersji jest zakazane.

## Audyt drugiego stopnia

[Raport RED TEAM II — błędy fizyki i dowodów](RED_TEAM_FIZYKA_I_ZRODLA_2026_10_22.md). Stwierdzono problemy z definicją Ib, bilansem KCL, częstotliwością, uziemieniem numerycznym i obsługą tolerancji nN. PR pozostaje dokumentacyjny i nie potwierdza zgodności z IEC 2026.

PKN potwierdza PN-EN 60909-0:2016-09: https://sklep.pkn.pl/pn-en-60909-0-2016-09e.html. Wykaz PKN potwierdza EN IEC 60909-0:2026, nie stanowi potwierdzenia wydania PN-EN IEC 60909-0:2026.
