# CATALOG_PROTECTION_V1_SPEC

## Zakres
- `ZABEZPIECZENIE`: urządzenia ochronne
- `KRZYWA_ZABEZPIECZENIA`: krzywe czasowo-pradowe
- `SZABLON_NASTAW`: szablony nastaw

## Stan danych
- Urządzenia: 22 rekordy (5 profili bez marki, 7 analitycznych e²TANGO legacy, 10 częściowo zweryfikowanych modeli e²TANGO SN)
- Krzywe: 8 rekordów
- Szablony: 8 rekordów

## Status danych
- Urządzenia ochrony: `ANALITYCZNY_V1` (historyczne), `REFERENCYJNY_V1` (5 profili bez marki oraz 10 modeli producenta o ograniczonym zakresie weryfikacji)
- Krzywe: `REFERENCYJNY_V1`
- Szablony: `REFERENCYJNY_V1`

## Weryfikacja
- ABB: rekordy częściowo zweryfikowane
- Elektrometal e2TANGO: 7 rekordów V0 historycznych nieweryfikowanych; 10 modeli producenta z potwierdzonym istnieniem i źródłem. Dla 250/450 dodatkowo potwierdzone wejścia 1/5 A, inne parametry tylko wg podanych źródeł.
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

## Pełna rodzina — audyt 31.10.2026
- Indeks **17 pozycji źródłowych** w `network_model/catalog/data/e2tango_rodzina_2026.json` (odczyt: `elektrometal_etango_family.py`), bez tworzenia fikcyjnych SKU: 11 urządzeń SN/nN (w tym detektor 50), 5 odmian WN e²TANGO-2000, 1 aplikacja SZR/PPZ.
- **10 realnych typów SN** dostępnych w kanonicznym katalogu: 100/150/200/250/400/450/600/800/1000/1200; 50 to detektor, 2000 to WN, SZR/PPZ to automatyka — wszystkie trzy kategorie wyłączone z wybieralnych przekaźników SN.
- API indeksu: `GET /api/catalog/elektrometal-etango-family`. Każdy wpis posiada źródło, zakres i jawny brak potwierdzenia nastaw konkretnej sztuki.
- Rozwinięcie źródeł producenta, funkcji, ograniczeń i niespójności istniejących modeli analitycznych: [E2TANGO_PELNA_RODZINA_AUDYT_2026_10_31.md](E2TANGO_PELNA_RODZINA_AUDYT_2026_10_31.md).
- Brak potwierdzenia funkcji konkretnej instancji nie powoduje usuwania modelu z katalogu, ale zabrania automatycznego uznawania funkcji za aktywną i automatycznej oceny nastaw.
