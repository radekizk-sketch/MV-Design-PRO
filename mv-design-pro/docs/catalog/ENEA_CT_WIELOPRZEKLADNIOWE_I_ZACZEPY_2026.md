# MV-DESIGN-PRO — przekładniki CT wieloprzekładniowe i wybór aktywnego zaczepu

Stan implementacji danych katalogowych: 30.10.2026
Źródło: ENEA Operator, **Układy pomiarowe energii elektrycznej**, wersja 05.2022-2,
obowiązuje od 02.04.2024, załączniki 4, 5/A–5/D, s. 24–29/36:
https://www.operator.enea.pl/media/698/uklady-pomiarowe-energii-elektrycznej-obowiazuje-od-02042024pdf.pdf

## 1. Korekta katalogu po audycie

Starszy katalog rozdzielał pozycję 200–400/5 A na profile 200/5 i 400/5.
Ten zapis nie odzwierciedla tabeli ENEA. Dla analogicznej pozycji 50–100/5 A
również wymagany jest **jeden model o dwóch zakresach**.

Dodano do `get_default_mv_catalog().ct_types`:
- **13 kanonicznych profili SN:** 4 z zał. 5/A (200–400), 5 z 5/B
  (50–100 i 200–400, w tym słup odbiorcy–wytwórcy), 3 z 5/C
  (200–400 toroidalne) i 1 z 5/D (200–400 toroidalne sieciowe).
- **3 profile nN:** 200/5, 400/5 i 800/5 A wg załącznika 4 ENEA.
  Klasa 0,2S, Sn=5 VA, FS≤5, ext.≥120%, Ith=60·Ipn, Um=0,72 kV.

**Dane wewnętrzne przekładnika SN**:
- `ratio_primary_a` = mniejsza przekładnia (np. 200 A) — **nominalna baza
  katalogowa, NIE aktywny zaczep**;
- `primary_taps_a=[200.0, 400.0]` — jedyna zweryfikowana z tabeli ENEA
  lista dwóch dostępnych zakresów;
- `ratio_secondary_a=5.0`;
- `core_count` i `secondary_cores` — niezależne od liczby zaczepów;
- w `secondary_cores` dane rdzenia rozliczeniowego 0,2S FS5,
  VA i wymagana Ith odnoszą się do **mniejszej przekładni**;
- nieznane klasy innych rdzeni, ALF, Rct i obciążalność przy drugim
  zakresie nie są sztucznie wypełniane;
- `um_kv=0.72` dla toroidalnych przekładników 5/C–D odnosi się do
  izolacji toroidu (sieć 24 kV), a `um_kv=24.0` do aparatu wsporczego.

## 2. Wymaganie integracyjne dla Opusa — bez przebudowy jego pracy

Dane katalogu opisują **MOŻLIWE ZACZEPY TYPU**, nie aktualną nastawę
egzemplarza. Opus sam rozwija wybór aktywnego zaczepu w inspektorze pola.
Niniejsza gałąź NIE wprowadza konkurencyjnego selektora, zmian ENM ani
renderera SLD.

Kontrakt konsumowania:
1. Inspektor pobiera `CTType.primary_taps_a` wybranego identyfikatora,
   np. `[200.0,400.0]` — nie wyprowadza zaczepów z liczby rdzeni.
2. Po wyborze przez projektanta aktywny zaczep **należy do instancji
   aparatu w projekcie**, nie do `CTType`.
3. SLD pokazuje pełną tabliczkę `200–400/5 A`, podkreślając tylko
   aktywną wartość 200 lub 400 — zgodnie z rozwiązaniem Opusa.
4. Dla 200/5 A iloraz wynosi 40, a dla 400/5 A wynosi 80.
   Nastawy EAZ i obwody wtórne korzystają z faktycznie wybranego zaczepu.
5. Przy braku jawnego wyboru nie wolno traktować mniejszego pola
   `ratio_primary_a` jako potwierdzonego zaczepu roboczego.

**Uwaga:** potwierdzonej przez producenta metody fizycznego przełączenia
nie wolno wyprowadzać z samego standardu ENEA. Możliwe są mostki
pierwotne, zaczepy wtórne lub różne połączenia uzwojeń;
wymaga to karty konkretnego modelu.

## 3. KPB Intra CTS 25 — potwierdzona zdolność techniczna, nie SKU

[Producent KPB Intra, CTS 25](https://kpbintra.cz/en/produkty/pristrojovy-transformator-proudu-podperny-7/)
potwierdza możliwość zmiany przekładni po stronie pierwotnej
(przez dwa mostki ze śrubami M8) i wtórnej, a także zakres
prądów pierwotnych 5–2500 A i wtórne 1 A / 5 A.

Rekord **rodziny producenta**, widoczny w katalogu producentów,
zawiera `primary_reconnection_supported=true`,
`secondary_reconnection_supported=true`,
`primary_reconnection_method=TWO_M8_BRIDGES` oraz
`specific_primary_tap_values_verified=false`.

**Nie oznacza to**, że zamawialny CTS 25 zawsze ma zakres 200–400/5 A.
Jest to właściwość rodziny, nie zweryfikowana karta jednej konfiguracji.

## 4. Zachowanie zgodności starych projektów

Historyczne profile ENEA 200/5, 400/5, 50/5 i 100/5 A pozostały z
TYMI SAMYMI ID. Ich nazwy i `verification_note` otrzymały informację
`LEGACY`, aby do nowych projektów wybierać odpowiednie kanoniczne
profile wieloprzekładniowe. Nie wykonujemy automatycznej migracji
aktywnych nastaw ani zmiany topologii istniejących projektów.

## 5. Testy / Ubuntu

```bash
cd mv-design-pro
bash scripts/catalog_audit_ubuntu.sh
PYTHONPATH=backend/src:backend pytest -q \
    backend/tests/network_model/catalog/test_enea_ct_multirange_catalog.py
```

Sprawdzane: 13 + 3 profile, unikalność ID, poprawność rdzeni i izolacji,
przeniesienie `primary_taps_a` przez `CTType.from_dict().to_dict()`,
zachowanie starszych ID, zgodność nazwy z wymaganiem ENEA,
brak niepotwierdzonej konfiguracji 200–400/5 jako fikcyjnego wyrobu KPB.

Weryfikacja CI i przegląd źródeł są warunkiem scalania.
