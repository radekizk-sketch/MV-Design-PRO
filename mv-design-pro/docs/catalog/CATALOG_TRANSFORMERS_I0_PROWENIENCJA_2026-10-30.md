# Transformator: komplet minimalnych danych i0 — 2026-10-30

## Dostarczone

Kanon: `backend/src/network_model/catalog/mv_transformer_catalog.py`.
Poprawiono 25 rekordów z nieznanym `i0_percent` (24 modele
normatywne olejowe 15/0,4 i 20/0,4 kV + 1 Siemens GEAFOL Neo).
Żaden identyfikator `id`, format katalogu, przekładnia, P0, Pk, uk,
czy przypisanie typów w projektach nie zostały zmienione.

Dla aplikacji i Opusa nie powstaje drugi katalog. Standardowy odczyt:
`get_all_transformer_types()` / `get_default_mv_catalog()` ->
`TransformerType.i0_percent`. Karta nadal odczytuje `source_reference`
i `verification_note`.

## Pochodzenie i0 [procent]

| Moc kVA | i0 olejowego | Źródło |
|---:|---:|---|
| 250 | 0,45 | BEZ 2025, str. 5 |
| 315 | 0,80 | EG System EG-TO-0315-24-P-K |
| 400 | 0,40 | BEZ 2025, str. 5 |
| 500 | 0,60 | EG System EG-TO-0500-17-P-K |
| 630 | 0,30 | BEZ 2025, str. 5 |
| 800 | 0,25 | BEZ 2025, str. 5 |
| 1000 | 0,20 | BEZ 2025, str. 5 |
| 1250 | 0,17 | BEZ 2025, str. 5 |
| 1600 | 0,15 | BEZ 2025, str. 5 |
| 2000 | 0,13 | BEZ 2025, str. 5 |
| 2500 | 0,13 | BEZ 2025, str. 5 |
| 3150 | 0,13 | BEZ 2025, str. 5 |

Każdą z 12 mocy stosuje się do modelu referencyjnego 15 kV oraz 20 kV
(24 modele razem). Źródła konkretnych danych:
- BEZ Transformátory, *Liquid-filled medium power transformers*, 2025,
  s. 5, tabela `Um <= 24(25) kV`, wiersz `No-load current`:
  https://www.bez.sk/wp-content/uploads/2025/04/BEZ_OIL_transformers_catalogue_05_2025_ENG.pdf
- EG System 315 kVA, 21/0,8 kV Dyn5:
  https://www.egsystem-sklep.pl/images/karty-katalogowe-trafo-olej-JAN25/EG-TO-0315-24-P-K-21-08_E2.pdf
- EG System 500 kVA, 15,75/0,42 kV Dyn5:
  https://www.egsystem-sklep.pl/images/karty-katalogowe-trafo-olej-JAN25/EG-TO-0500-17-P-K-1575-042_E2.pdf

**Zastrzeżenie techniczne:** rekordy `tier2-olej` pozostają
**REFERENCYJNY_V1 / REFERENCYJNY**. P0 i Pk to pułap Tier 2; uk pochodzi
z serii suchej GEAFOL; i0 z odrębnej serii olejowej BEZ/EG.
To wartości do modelowania typowego urządzenia, **nie tabliczka jednego
wyrobu**. Karty EG dla 315 i 500 kVA mają inną przekładnię/grupę
niż referencyjny Dyn11; i0 jest jawnym przeniesieniem reprezentatywnej
wartości tej mocy, a nie parametrem konkretnego modelu 15/0,4 lub 20/0,4.

Siemens GEAFOL Neo 4GY6364-1EC: karta podaje P0, Pk i uk, ale
**nie podaje i0**. Zamiast wymyślać wartość Neo, wstawiono
referencyjne `i0 = 0,5 %` z innej serii GEAFOL 24 kV (2000 kVA),
cytowanej już w stałej `GEAFOL_24KV_UK_I0_PROC`.
`verification_note` rozróżnia parametry potwierdzone kartą Neo
od tego pojedynczego parametru referencyjnego. Pochodzenie
jest jawne w polu `source_reference`.

## Kryterium

`backend/tests/network_model/catalog/test_katalog_proweniencja_kompletnosc.py`:
każdy typ transformatora ma dodatnie skończone
`rated_power_mva, voltage_hv_kv, voltage_lv_kv, uk_percent, pk_kw,
p0_kw, i0_percent`, niepustą grupę połączeń, i
`i0% * Sn[kVA] / 100 >= P0[kW]`.

**Dalsza zamiana wartości referencyjnych na znamionowe konkretnego
wyrobu** wymaga dokumentu producenta dla danego `id`. Nie wolno usuwać
oznaczenia pochodzenia ani podnosić statusu modelu normatywnego do
`ZWERYFIKOWANY` jedynie z powodu pełnych pól.
