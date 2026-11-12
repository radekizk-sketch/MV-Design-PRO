# IEC 60909-0:2016 — indeks zweryfikowanego źródła dla Opusa (MV-DESIGN-PRO)

**Status:** dokumentacja referencyjna, **bez zmian kodu, solvera, SLD ani PLANS.md**. Nie jest nowym planem wykonawczym. Decyzje implementacyjne są w istniejących kartach programu.

## Dostęp i ograniczenia licencyjne

Właściciel przekazał w rozmowie ChatGPT plik `60909 2016.pdf` (82 strony, skan, PN-EN 60909-0:2016-09E). Na okładce i stronach normy widnieje znak licencji wielostanowiskowej wystawionej na ENEA Operator Sp. z o.o. **Plik źródłowy NIE jest dodany do PR.** Ten PR nie nadaje sublicencji ani uprawnień do rozpowszechniania pełnej normy.

Aby Opus mógł samodzielnie porównać treść normy z kodem, uprawniona osoba musi udostępnić mu egzemplarz w środowisku, w którym istnieje do tego uprawnienie (np. załączyć w jego sesji, o ile pozwala na to licencja). Nie zakładać, że plik z rozmowy ChatGPT jest dostępny automatycznie w Claude Code ani pod ścieżką `/tmp/claude-0/...`.

**Metadane zweryfikowanego załącznika:** 82 strony PDF; skan bez warstwy tekstowej; SHA-256 `76557bba63396e4340fb23deec563eb1fc9fbcc5dff4aef38aacba8b2e903193`. Przed użyciem innej kopii porównać wydanie i paginację.

## Co potwierdzono bezpośrednio w załączniku

- **IEC 60909-0:2016, pkt 6.9, drukowana s. 35 / PDF s. 43:** jednostki z przekształtnikami pełnej mocy (w tym PV i odpowiednie FW) modeluje się odpowiednimi źródłami prądowymi; parametr wkładu zależy od rodzaju zwarcia i danych wytwórcy. Zapis o nieskończonej impedancji składowej zerowej dotyczy **jednostki z przekształtnikiem pełnej mocy**, a NIE dowolnego zewnętrznego równoważnika SN.
- **IEC 60909-0:2016, pkt 7.2.1, drukowana s. 43 / PDF s. 51:** wzory (33) i (34). Wzór (34) dla *maksymalnego początkowego prądu symetrycznego zwarcia trójfazowego* z udziałem jednostek z przekształtnikiem pełnej mocy uwzględnia człon sieciowy i wkłady przekształtników wyznaczane z modułów elementów macierzy impedancyjnej `Z_ij` oraz prądów źródeł `I_skPFj`.
- Weryfikacja wzoru (34) musi odróżniać wkład źródła, wynik całkowity w miejscu zwarcia i rzeczywiste prądy poszczególnych gałęzi. **Nie należy automatycznie stosować tego wzoru do DFIG, wszystkich zwarć niesymetrycznych lub przypadków minimalnych.**

Szczegółowy indeks: [INDEKS_PUNKTOW_I_STRON.md](INDEKS_PUNKTOW_I_STRON.md). Kontrakt zadań i testów: [KONTRAKT_OPUS_OZE_60909.md](KONTRAKT_OPUS_OZE_60909.md).

## Zasady wykorzystania

1. Najpierw zweryfikować stan istniejącego solvera i jego danych wejściowych; nie tworzyć nowego rdzenia ani równoległej metody obliczeń.
2. W każdej tezie przypisać: konkretny punkt wydania 2016, lokalizację w kodzie oraz test/dowód; nie korzystać z samych streszczeń.
3. Nie stwierdzać zgodności z edycją IEC 60909-0:2026 bez porównania jej rzeczywistego tekstu.
4. Nie dodawać chronionego tekstu, zrzutów stron ani oryginalnego PDF do publicznych zasobów, komentarzy PR czy kodu źródłowego bez właściwej licencji.
