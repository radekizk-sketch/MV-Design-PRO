# Kontrakt koordynacyjny: oznaczenie zabezpieczeń na SLD × przebudowa interfejsu

**Data:** 2026-07-15
**Strony:** wątek SLD CAD/SCADA (`claude/sld-schema-cad-scada-rqvz73`, ten dokument powstał tam)
× wątek przebudowy interfejsu (`claude/power-network-design-ui-ir91mv`, Program UI/UX 2026-07).
**Zlecenie właściciela:** wdrożyć oznaczenie przekaźnika zabezpieczeniowego z wyłącznikiem wg
schematu referencyjnego (konwencja ABB: wyłącznik = kwadrat „52", przekaźnik = okrąg „50/51",
tor wyzwalania = linia przerywana), zaprojektowane GLOBALNIE z całym systemem; oba wątki mają
się skoordynować.

## 1. Konwencja wiążąca (jedno źródło)

`docs/sld/SLD_CAD_SPEC_V3.md` **§17** (Poprawka A2, 2026-07-15) — konwencja graficzna,
źródła danych (zero zgadywania: `Bay.protection_codes`, `ProtectionAssignment.breaker_ref`,
`Measurement.purpose`), geometria, LOD, wyrocznia `protection_marking_probe`.
Wątek UI NIE definiuje własnej konwencji rysunkowej — konsumuje §17.

## 2. Punkty styku wymagające działania wątku UI

| # | Temat | Oczekiwane działanie wątku UI |
|---|-------|-------------------------------|
| 1 | Słownik IA | Dodać do słownika nowej IA: „przekaźnik zabezpieczeniowy", „tor wyzwalania", numery urządzeń ANSI/IEEE C37.2 („52" = wyłącznik, „50/51" = zabezpieczenie nadprądowe bezzwłoczne/zwłoczne, „M" = miernik). Numery C37.2 są NOTACJĄ, nie kodenames — nie podlegają `no_codenames_guard`. |
| 2 | Inspektor / property-grid | Nowa powłoka prezentuje `ProtectionAssignment` (device_type, breaker_ref, ct_ref/vt_ref, settings[].function_type/threshold_a/time_delay_s/curve_type) przy selekcji pola z `protection_ref`. |
| 3 | Tokeny stylu | Warstwa adnotacji zabezpieczeń w SLD osadzonym w powłoce W-110 stylowana tokenami `--mvd-*` (kolor linii wyzwalania, wypełnienie okręgu) — SLD v3 wystawi zmienne CSS zamiast twardych kolorów dla TEJ warstwy przy integracji z powłoką. Do uzgodnienia nazwy tokenów (propozycja: `--mvd-sld-protection-stroke`, `--mvd-sld-protection-trip-line`). |
| 4 | Toolbox/paleta | Jeżeli nowa IA ma paletę elementów SLD: przekaźnik NIE jest elementem toru mocy (nie da się go „dorysować" na torze) — jest pochodną danych `ProtectionAssignment`; edycja przez formularz zabezpieczeń, nie przez drag na kanwę. |

## 3. KOLIZJA REJESTRU KONFLIKTÓW — do rozstrzygnięcia przy scaleniu (WAŻNE)

Oba wątki niezależnie nadały identyfikator **V12K-026** różnym konfliktom:

- `claude/sld-schema-cad-scada-rqvz73` (WCZEŚNIEJSZY commit): V12K-026 = polityka LOD v3 vs
  v2 `LodPolicy` (RESOLVED). Zajęte także V12K-027…V12K-031.
- `claude/power-network-design-ui-ir91mv`: V12K-026 = słownik nowej IA vs
  `ui_terminology_guard` (RESOLVED przez decyzję architekta systemu).

**Propozycja rozstrzygnięcia (do potwierdzenia przez wątek UI):**
1. Wpis wątku UI otrzymuje przy scaleniu numer **V12K-040** (treść bez zmian, tylko numer).
2. Rezerwacja zakresów do końca obu programów: wątek SLD = V12K-026…V12K-039;
   wątek UI = V12K-040…V12K-059. Kolejne wątki biorą następne pełne dziesiątki.
3. Wątek, który scala się PÓŹNIEJ, wykonuje renumerację swoich wpisów kolidujących.

Do czasu potwierdzenia: NIE nadawać nowych numerów z cudzego zakresu.

## 4. Kolejność wdrożenia po stronie SLD

Implementacja §17 = faza **F9.9** planu `docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md`
(po domknięciu F9.7). Zależność DOMAIN: brak — dane (`protection_codes`,
`ProtectionAssignment`) istnieją w ENM od dawna; wysuwność wyłącznika (chevrony) ODŁOŻONA
do przyszłej rundy DOMAIN (brak pola w modelu — zero zgadywania).

## 5. Kanał zwrotny

Wątek UI potwierdza/koryguje pkt 2-3 wpisem w tym pliku (sekcja „Potwierdzenia" niżej)
na swojej gałęzi lub przez właściciela. Brak sprzeciwu przy scaleniu = akceptacja propozycji 3.

## Potwierdzenia

- [ ] Wątek UI: słownik (pkt 2.1)
- [ ] Wątek UI: inspektor (pkt 2.2)
- [ ] Wątek UI: tokeny (pkt 2.3)
- [ ] Wątek UI: renumeracja V12K (pkt 3)
