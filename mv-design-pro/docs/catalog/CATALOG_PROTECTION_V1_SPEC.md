# CATALOG_PROTECTION_V1_SPEC

## Zakres
- `ZABEZPIECZENIE`: urządzenia ochronne
- `KRZYWA_ZABEZPIECZENIA`: krzywe czasowo-pradowe
- `SZABLON_NASTAW`: szablony nastaw

## Stan danych
- Urządzenia: 14 rekordów (5 profili bez marki, 7 analitycznych e²TANGO legacy, 2 częściowo zweryfikowane rodziny 250/450)
- Krzywe: 8 rekordów
- Szablony: 8 rekordów

## Status danych
- Urządzenia ochrony: `ANALITYCZNY_V1` (historyczne), `REFERENCYJNY_V1` (5 profili bez marki oraz 2 rodziny producenta o ograniczonym zakresie weryfikacji)
- Krzywe: `REFERENCYJNY_V1`
- Szablony: `REFERENCYJNY_V1`

## Weryfikacja
- ABB: rekordy częściowo zweryfikowane
- Elektrometal e2TANGO: 7 rekordów historycznych nieweryfikowanych; e²TANGO-250 i -450 częściowo zweryfikowane co do istnienia modelu i wejść pomiarowych
- Krzywe i szablony: rekordy referencyjne, bez deklaracji pełnej weryfikacji produkcyjnej

## Kontrakt
Każdy rekord ma obowiązkowo:
- `verification_status`
- `source_reference`
- `catalog_status`
- `contract_version`
- `verification_note`

## Rozdział semantyczny
- urządzenie ochrony nie jest krzywą
- krzywa nie jest szablonem
- szablon wskazuje `device_type_ref` i `curve_ref`
- dane analityczne nie są przedstawiane jako produkcyjnie zweryfikowane

## Zasada użycia
- Katalog ochrony służy do doboru, mapowania i prezentacji zakresów.
- Brak pełnej weryfikacji ma być jawnie widoczny w danych i interfejsie.

## Nowa generacja Elektrometal (30.10.2026)
- `EM_E2TANGO_250` i `EM_E2TANGO_450` są osobnymi, wybieralnymi typami rodziny w katalogu MV, opartymi na kartach producenta (numery i odnośniki zapisane w `source_reference`).
- Numer modelu **nie** jest prądem znamionowym urządzenia. Wejście pomiarowe prądowe 1 A / 5 A jest konfigurowalne, a jego wybór musi odpowiadać CT obwodu wtórnego.
- `analytical_library_ref=None` do czasu udokumentowania funkcji i zakresów nastaw wybranego wariantu. Istnienie dawnego wpisu analitycznego 450 nie uzasadnia automatycznego podpięcia.
- Nie zmieniać `_V0` ani nie dopisywać ochron 67N/87T/50/51 i gotowych nastaw bez faktycznego wyposażenia i konfiguracji konkretnej instancji.
