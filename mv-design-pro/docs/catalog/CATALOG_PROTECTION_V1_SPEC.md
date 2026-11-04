# CATALOG_PROTECTION_V1_SPEC

## Zakres
- `ZABEZPIECZENIE`: urządzenia ochronne
- `KRZYWA_ZABEZPIECZENIA`: krzywe czasowo-pradowe
- `SZABLON_NASTAW`: szablony nastaw

## Stan danych
- Urządzenia: 19 rekordów (5 profili bez marki, 4 analityczne e²TANGO legacy — 400, 600, 800, 1000, 10 modeli rodziny e²TANGO z kart producenta: 100, 150, 200, 250, 400, 450, 600, 800, 1000, 1200)
- Krzywe: 8 rekordów
- Szablony: 5 rekordów

## Status danych
- Urządzenia ochrony: `ANALITYCZNY_V1` (historyczne), `REFERENCYJNY_V1` (5 profili bez marki oraz 10 modeli e²TANGO z kart producenta o ograniczonym zakresie weryfikacji)
- Krzywe: `REFERENCYJNY_V1`
- Szablony: `REFERENCYJNY_V1`

## Weryfikacja
- ABB: rekordy częściowo zweryfikowane
- Elektrometal e2TANGO: 4 rekordy historyczne nieweryfikowane; 10 modeli e²TANGO częściowo zweryfikowanych co do modelu, wejść pomiarowych, kart rozszerzeń i funkcji w ofercie rodziny (karty K-34.1.9, K-40.1.8, K-32.2.12, K-42.1.8, K-33.2.2, K-43.1.7, K-3.2.25)
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

## Rodzina Elektrometal e²TANGO (2026-11-04)
- `EM_E2TANGO_<model>` (10 modeli pola SN/nN) są osobnymi, wybieralnymi typami rodziny w katalogu MV, opartymi na kartach producenta (numery i odnośniki zapisane w `source_reference`).
- Numer modelu **nie** jest prądem znamionowym urządzenia. Wejście pomiarowe prądowe 1 A / 5 A jest konfigurowalne, a jego wybór musi odpowiadać CT obwodu wtórnego.
- `analytical_library_ref=None` do czasu udokumentowania funkcji i zakresów nastaw wybranego wariantu. Istnienie dawnego wpisu analitycznego 450 nie uzasadnia automatycznego podpięcia.
- Nie zmieniać `_V0` ani nie dopisywać ochron 67N/87T/50/51 i gotowych nastaw bez faktycznego wyposażenia i konfiguracji konkretnej instancji.
- Poza katalogiem urządzeń zabezpieczeniowych pola SN (świadomie): detektor zwarć e²TANGO-50, zespoły WN e²TANGO-2000 (ODL/TRR/STP/ARN/LRR), automatyka SZR/PPZ i peryferia (e²ECHO, e²TANGO-FER, czujniki, panele) — nie są typem przekaźnika pola SN.
- Skasowane (karta KATALOG-PRZEJECIE-PR, 2026-11-04): fikcyjne rekordy analityczne `EM_ETANGO_1250_V0`, `EM_ETANGO_1600_V0`, `EM_ETANGO_2000_V0` i ich szablony nastaw (`template_etango_1250_oc`, `template_etango_1600_ef`, `template_etango_2000_oc`) — producent nie ma sterowników pola SN o tych numerach, a e²TANGO-2000 jest zespołem WN. Scena harnessu LOM wskazuje realny `EM_E2TANGO_1200` (karta K-3.2.25: 81U/81O/81R).
- Rozbieżności znalezione w samych kartach producenta (np. położenie karty TRR w K-3.2.25, karta ARC dla 250 w K-42.1.8) są opisane w `verification_note` pozycji.
