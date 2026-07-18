# AUDYT + PROJEKT: KREATOR „DODAJ ŹRÓDŁO ZASILANIA (GPZ)" — 2026-07 (WIĄŻĄCY)

**Status:** BINDING (projekt do wykonania) · **Autor:** Fable (zarządca) · **Data:** 2026-07-18
**Podstawa:** dyrektywa właściciela 2026-07-18 — „za mało intuicyjny i za mało profesjonalny,
chaotyczne rozmieszczenie, nie wiadomo co po co i co dalej; przeprojektuj od zera i dodaj
więcej opcji — zawsze max opcje bez spłycania i skracania; weź audyt szerokiego grona
ekspertów". Kontrakt operacji: `enm/domain_operations.py::add_grid_source_sn`.
Standard bazowy: `KREATORY_STANDARD_2026-07.md`. Rejestr: V12K-043.

## 0. Diagnoza odrzuconej wersji (v1, panel prawy)

| # | Wada | Skutek |
|---|------|--------|
| D1 | Kreator wciśnięty w wąski panel prawy (~320 px) — wszystko w jednej kolumnie | Chaos, brak hierarchii, nie da się skanować |
| D2 | Spłycenie: usunięto tryb WN/110 kV, tryb Sk3/impedancja, ręczny ekwiwalent, konfigurację per-sekcja, dobór aparatu w prostym wariancie | „Za mało opcji"; profesjonalista nie ma dostępu do parametrów, które backend REALNIE przyjmuje |
| D3 | Brak jawnego toru „co po co i co dalej" (jednostronicowa płachta) | Nie wiadomo, na jakim etapie się jest |
| D4 | Podsumowanie i kontrola na dole długiej płachty, oderwane od wejść | Feedback nie przy danych |

## 1. Panel ekspertów (audyt wielosoczewkowy)

**E1 — Projektant sieci WN/SN (PowerFactory/ETAP).** GPZ to węzeł 110/SN. Komplet
danych: strona WN (Sk″ na szynie 110 kV lub ekwiwalent SN, R/X, składowa zerowa),
transformatory 110/SN (liczba, katalog, Sn, uk, grupa połączeń, przełącznik zaczepów),
rozdzielnia SN (sekcje, sprzęgło, system szyn), uziemienie punktu neutralnego.
Wniosek: potrzebne DWA tryby zasilania (katalog / ręczny ekwiwalent) i DWIE strony
odniesienia (SN / 110 kV) — obecne w backendzie, muszą być w UI.

**E2 — Zwarciowiec IEC 60909.** Parametry: Sk″ (3-faz), R/X, tryb (moc zwarciowa /
impedancja R+jX), składowa zerowa (R0/X0/Z0/Z1), współczynniki napięcia c (cmax/cmin),
czas cieplny tk, czas wyłączenia tb, częstotliwość. Wynik (Sk″/Ik″3f/Ik″1f/κ/ip/Ith/
Z1/Z0) liczy backend — UI tylko prezentuje. cmax/cmin/częstotliwość są dziś dekoracją —
albo edytowalne z realnym skutkiem, albo jawnie „stałe IEC" (nie udawany select).

**E3 — Inżynier zabezpieczeń.** Typ uziemienia (izolowane/rezystorowe/Petersen/
bezpośrednie) determinuje prąd doziemny i zabezpieczenia 51G/67N; parametry R/X
uziemienia; aparat pola liniowego (wyłącznik/odłącznik/rozłącznik) z katalogu.

**E4 — Projektant rozdzielni SN.** Sekcje szyn (1–4), sprzęgło, system szyn
(pojedynczy sekcjonowany / podwójny), a PER SEKCJA: nazwa, nazwa szyny, liczba i nazwy
pól liniowych. Backend przyjmuje `gpz_section_entries` z per-sekcyjnym składem — UI musi
to pozwolić edytować (nie tylko globalny licznik).

**E5 — Katalogi / Reference Engine.** Katalog-first: pozycja z katalogu źródeł SN wnosi
napięcie/Sk″/RX; aparat z katalogu aparatury SN. Tryb ręczny tylko świadomie (ekspercki).

**E6 — Przyłączenia / OZE.** GPZ to korzeń sieci; następny krok = magistrala/pola/OZE.
Wielo-GPZ wymaga unikalnego `source_id`/`solution_ref` (backend to egzekwuje).

**E7 — UX/IA.** Kreator złożonego obiektu = **pełna szerokość + kroki**, nie płachta w
panelu. Każdy krok: cel, pola pogrupowane, walidacja przy polu, podsumowanie na żywo w
stałej kolumnie bocznej (nie na końcu). Jawny „następny krok / wstecz / zapisz".

## 2. Decyzja projektowa (WIĄŻĄCA)

1. **Pełna szerokość, nie panel.** Operacja `add_grid_source_sn` otwiera się jako
   powierzchnia warsztatu (`openMode: 'expand_workspace'`), region główny — kreator
   zajmuje główny obszar, nie pasek 320 px.
2. **Układ dwukolumnowy:** lewa/centralna kolumna = kroki + pola; prawa, STAŁA kolumna =
   „Podsumowanie obliczone" (backend, na żywo) + „Kontrola GPZ" (gotowość) — feedback
   zawsze widoczny obok wejść.
3. **Kroki (tor pracy jawny):**
   - **K1 Identyfikacja** — nazwa, oznaczenie (auto), `source_id` (multi-GPZ), OSD/operator, lokalizacja, napięcie SN.
   - **K2 Źródło i strona WN** — tryb (katalog / ręczny ekwiwalent); strona (SN / 110 kV); Sk″ (SN lub 110 kV) / tryb impedancja R+jX; R/X; napięcie WN; składowa zerowa (R0/X0/Z0Z1).
   - **K3 Transformatory 110/SN** — liczba (1–4); katalog; Sn; uk; grupa połączeń; przełącznik zaczepów (zakres/krok); (pola jawne tylko w trybie eksperckim jeśli backend przyjmuje).
   - **K4 Rozdzielnia SN** — liczba sekcji (1–4); sprzęgło; system szyn; uziemienie punktu neutralnego (typ + R/X).
   - **K5 Sekcje i pola** — PER SEKCJA: nazwa, nazwa szyny, liczba i nazwy pól liniowych; aparat pola (rodzaj + katalog).
   - **K6 Parametry normowe** — norma (IEC 60909:2016), częstotliwość, cmax/cmin, tk, tb, tryb min/max — jawnie stałe vs edytowalne (bez udawanych selectów).
   - **K7 Podsumowanie i zapis** — pełne podsumowanie backendu + kontrola gotowości + zapis.
4. **Tryb zaawansowania** (Podstawowy/Rozszerzony/Ekspercki, `AdvancementMode`): tryb
   ręczny/impedancja i pola jawne widoczne od „Ekspercki"; Podstawowy = katalog-first.
5. **Zero fabrykacji** (FLOW §0.6): każda opcja mapuje na realne pole payloadu
   `add_grid_source_sn`; opcja bez pokrycia w backendzie NIE powstaje (albo rozszerzamy
   backend osobną kartą). Wynik liczbowy tylko z `fetchGridSourcePreview` (IEC 60909).
6. **Framework:** budowa na `ui2/kreatory/rama` (rozszerzenie o układ dwukolumnowy i
   nawigację kroków wstecz/dalej); tokeny `--mvd-*`, oba motywy.

## 3. Zakres opcji (kompletny — z kontraktu backendu)

`source_name` · `source_id`/`solution_ref` (multi-GPZ) · `voltage_kv` (SN) ·
`catalog_binding`/`catalog_ref` (ZRODLO_SN) · `manual_equivalent` {voltage_kv, sk3_mva,
rx_ratio, short_circuit_model, short_circuit_mode (SHORT_CIRCUIT_POWER/IMPEDANCE),
short_circuit_input_side (SN/HV_110), sn_voltage_kv, voltage_hv_kv, sk3_hv_mva, ik3_ka,
r_ohm, x_ohm, r0_ohm, x0_ohm, z0_z1_ratio} · `grounding` {type, r_ohm, x_ohm} ·
`zero_sequence` {enabled, r0_ohm, x0_ohm, z0_z1_ratio} · `sections_count` (1–4) ·
`transformer_count` (1–4) · `line_fields_per_section` · `gpz_sections[]` {order, name,
bus_name, line_field_name, line_field_names[], line_fields_count} ·
`gpz_line_field_apparatus` {apparatus_kind, catalog_binding} · `pozycja_widokowa`.

## 4. Realizacja
Zadanie zarządcy (opcja max, od zera). Rozszerzenie frameworka + przebudowa
`KreatorZrodloZasilania` na 7-krokowy konfigurator pełnoekranowy z kompletem opcji;
przywrócenie w `zrodloModel` gałęzi ręczny/impedancja/HV-110 i per-sekcyjnego składu
(spłyconych w v1). Weryfikacja E2E + zrzuty pełnej szerokości w obu motywach.
