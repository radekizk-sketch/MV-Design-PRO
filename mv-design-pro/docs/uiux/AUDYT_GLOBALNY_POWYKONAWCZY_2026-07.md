# AUDYT GLOBALNY POWYKONAWCZY — powiązania między modułami i warstwami (2026-07-20)

**Status:** BINDING (audyt wielosoczewkowy zespołu ekspertów; dyrektywa właściciela
2026-07-20: „wymagany audyt powykonawczy zespołu ekspertów, wnieś konstruktywne uwagi
czego brakuje, co nie zostało powiązane między modułami i warstwami systemu — audyt
globalny przez wszystkie funkcje systemu, najpierw uwagi potem poprawki").
**Metoda:** rekonesans kodu (nie z pamięci) — łańcuchy dostawca→konsument przez warstwy
Solver / Analiza / Aplikacja / Domena / API / UI / Raporty.
**Rejestr:** V12K-059.

Soczewki eksperckie: projektant sieci · zwarciowiec · zabezpieczenia · rozdzielnie /
Reference Engine · przyłączenia / OZE · BHP (arc flash) · UX/IA · integralność dokumentacji.

---

## 0. Zasada oceny (dyrektywa właściciela)

„Buduj ogniwo łańcucha, nie wyspę". Defekt = (a) **wyspa**: zdolność backendu bez punktu
wejścia (dispatch/API/UI/raport); (b) **phantom**: kontrolka UI bez pola/operacji backendu;
(c) **zerwane ogniwo**: dane utrwalone, ale nie konsumowane przez warstwę, która ich
potrzebuje. Audyt szuka wszystkich trzech.

---

## 1. Znaleziska (uwagi) — wg wagi

### A. [KRYTYCZNE] Arc Flash — kompletna wyspa (zdolność bez żadnego punktu wejścia)

**Dowód:** moduł `backend/src/analysis/arc_flash/**` implementuje pełny model IEEE 1584-2018
(builder, tablice współczynników, White Box, PPE, proweniencja open-source). Sprawdzenie
użyć **każdego** symbolu publicznego (`ArcFlashBuilder`, `ArcFlashInput`, `ArcFlashResult`,
`ArcFlashView`, `compute_arc_flash_id`, `ArcFlashContext`, …) poza własnym modułem: **0**.
Brak w `analysis_dispatch`, brak endpointu API (`oze_analysis_runs`, `quality_analysis_runs`,
`v126_academic` — arc flash nieobecny), brak konsumenta w raportach, brak UI.

**Skutek (BHP + projekt):** projektant nie ma dostępu do energii incydentu łuku ani kategorii
PPE — mimo że fizyka jest gotowa i przetestowana. Inwentarz funkcji (`INWENTARZ_FUNKCJI_2026-07`)
deklaruje Arc Flash jako dostarczoną analizę → **rozjazd dokumentacja vs kod**.

**Brakujące ogniwo:** builder → (nowy) provider w warstwie application → endpoint run/result
→ widok UI wyników + sekcja raportu. Wejście: bus/pole SN + I_bf ze zwarcia (już liczone),
czas wyłączenia z koordynacji zabezpieczeń (już liczony) → energia + PPE.

### B. [WYSOKIE] Pole SN → materializacja zabezpieczeń niedomknięta (asymetria stacja vs pole)

**Dowód:** `add_sn_bay` po G-POLE-R utrwala `bay_template_ref`/`switchgear_family_ref`/
`manufacturer_ref`/`protection_ref` na `field_spec` (dane związane). ALE operacja **nie
wyprowadza `protection_ref` z wybranego szablonu producenta** — kreator `KreatorPolaSn` nie
ma pickera zabezpieczenia i nie mapuje `bay_template` → zabezpieczenie. Tymczasem ścieżka
stacji `api/station_templates.py:95-103` **robi to**: bierze `sn_bay_protection_options`
z szablonu i ustawia `protection_relay_ref`.

**Konsumenci `protection_ref`, którzy widzą pustkę:** `protection_read_model.py:325`,
`analyses/ochrona_lom.py:484` (analiza LoM), SLD v2 glify zabezpieczeń
(`GpzCanonicalRenderer`, `MiniBlockRmuRenderer`, `enmToCanonicalGpzAdapter:300`).

**Skutek:** projektant wybiera kompletny szablon pola producenta (który W PACZCE ma opcje
zabezpieczeń), a pole zostaje bez zabezpieczenia w koordynacji, analizie LoM i na schemacie.
G-POLE-R domknął warstwę DANYCH, nie domknął warstwy MATERIALIZACJI zabezpieczenia.

**Brakujące ogniwo:** przy wyborze `bay_template` → wyprowadź `protection_ref` z opcji
zabezpieczeń szablonu (reużycie logiki `station_templates`), z możliwością nadpisania.

### C. [WYSOKIE] Kreator OZE (`add_converter_source`) wciąż legacy — regulacja poza kanonem FLOW

**Dowód:** `operationFormRegistry.tsx:56` → `add_converter_source: AddConverterSourceForm`
(legacy, 1365 w.). G-OZE-PF (V12K-052) domknął **fizykę** PF regulacji falownika (Q_U/cosφ/
P(f) → PQSpec), ale UI wystawiające **tryb regulacji** nigdy nie zostało zmigrowane do
kontraktu ekranu prowadzącego (ui2/kreatory). Audyt V12K-051 zaprojektował `KreatorZrodlaOze`
(kroki 1–5), ale build nie powstał.

**Skutek:** najgłębszy łańcuch DER (inverter PF, NC RfG, RMS stability, machine SC,
grid_strength, reactive_adequacy) ma domkniętą fizykę, ale wejście UX jest poza standardem —
ryzyko phantomów (kontrolki bez mapy) i braku krzywych NC RfG w UI.

### D. [ŚREDNIE] 11 operacji poza kanonem kreatorów ui2 (spójność IA/UX)

**Dowód:** aktywni dostawcy legacy w `operationFormRegistry`: `AddConverterSourceForm`,
`AddDispatchableSourceForm`, `AddMeasurementForm`, `AddNnOutgoingFieldForm`, `AddRelayForm`,
`AssignCatalogForm`, `InsertBranchPoleForm`, `InsertStationForm`, `InsertZksnForm`,
`StartBranchForm`, `UpdateElementParametersForm`. Zmigrowane do ui2 (9): kompensator, lacznik,
magistrala, odbior, pierscien, pole, transformator, zrodlo (grid source), + GPZ.

**Skutek:** część operacji ma cel jednym zdaniem / listę gotowości / następny krok, część
nie. Niejednorodny FLOW projektanta. Program przebudowy ~45% (9/20).

### E. [ŚREDNIE — do weryfikacji] `protection_ref` pola nie wpływa na kanoniczną koordynację

**Dowód:** `protection_ref` z `field_spec` czytany jest w read-modelu, SLD i analizie LoM,
ale NIE znaleziono konsumpcji w `mapping.py` / `solver_input/` / `protection_curves_it`
(koordynacja I-t). Do potwierdzenia: czy zabezpieczenie polowe wybrane w kreatorze wchodzi
do kanonicznej koordynacji I-t, czy służy tylko prezentacji/LoM.

**Brakujące ogniwo (jeśli potwierdzone):** `protection_ref` → nastawy przekaźnika → krzywa
I-t → koordynacja z sąsiednimi polami.

### F. [NISKIE] Rozjazd inwentarz vs kod

Inwentarz funkcji deklaruje analizy jako dostarczone; audyt wykazał co najmniej Arc Flash
jako wyspę. Wymagana rewizja `INWENTARZ_FUNKCJI_2026-07` (kolumna „status wpięcia": dispatch
/ API / UI / raport), aby deklaracja = rzeczywistość.

---

## 2. Co JEST dobrze powiązane (potwierdzone łańcuchy)

- **SC maszynowy DER** (V12K-054/055): mapping źródeł SC → compute_machine_contributions →
  pakiet SC3F + endpoint. Domknięte.
- **OLTC** (V12K-045/046/049): model TapChanger → pętla LF → sweep/profil/optymalizacja →
  raport PF → run API opt-in. Domknięte (glif SLD = wątek SLD).
- **Kompensacja SN** (G-KOMP): op + preview solver + kreator ui2. Domknięte.
- **Odbiór nN cosφ** (V12K-050): op wyprowadza Q z tabliczki → PF. Domknięte.
- **grid_strength / reactive_adequacy / sanity_bounds**: analiza → endpoint (`oze_analysis_runs`,
  `quality_analysis_runs`) → UI. Wpięte.
- **SSCI / harmonics / stabilność napięciowa** i pozostałe V12.6: przez `V126AcademicSolver`
  + run/result/proof/trace API. Wpięte.

---

## 3. Plan poprawek (kolejność wartości — opcja MAX, end-to-end)

Wg dyrektywy „najpierw uwagi potem poprawki" + Zero-Debt (brak cichego odkładania):

1. **B — materializacja zabezpieczeń pola z szablonu producenta** (domyka bieżący wątek
   G-POLE-R; najkrótsza droga do zamknięcia ogniwa; reużycie logiki station_templates).
2. **A — wpięcie Arc Flash end-to-end** (provider → run/result API → UI wyników → sekcja
   raportu; BHP-krytyczne; fizyka gotowa).
3. **C — migracja kreatora OZE do ui2** (`KreatorZrodlaOze` wg projektu V12K-051, z krzywymi
   NC RfG).
4. **D — pozostałe legacy → ui2** (kolejne karty programu kreatorów).
5. **E — weryfikacja + (jeśli trzeba) wpięcie protection_ref do koordynacji I-t.**
6. **F — rewizja inwentarza (status wpięcia per analiza).**

Pozycje 3–6 rejestrowane jako karty (nie odkładane cicho).

### Status realizacji

- **B — ZREALIZOWANA W PEŁNI (2026-07-20, rozbudowa na żądanie właściciela).**
  `_resolve_bay_template_protection_codes` (reużycie resolvera Reference Engine) →
  `add_sn_bay` zapisuje `protection_codes` na field_spec → `field_read_model` projektuje na
  `Bay.protection_codes` → glify SLD v2 (już konsumują `bay.protectionCodes`). Kolejność
  zero-fabrykacja: `template.protection_requirements` (dane producenckie, pierwszeństwo) →
  kanoniczna tablica per rola `BAY_PROTECTION_CODES_BY_ROLE` (PTPiREE/IRiESD + IEC 60255).
  - **B2 (per-rola) — ZREALIZOWANA (nie karta).** Kanon dla WSZYSTKICH ról: IN `51/50/51N`,
    OUT/FEEDER `51/50/51N/67N`, TR (reużycie `TRANSFORMER_BAY_PROTECTION_CODES`), COUPLER
    `51/50`, OZE (reużycie interfejsu NC RfG `OZE_INTERFACE_BAY_PROTECTION_CODES`),
    MEASUREMENT = puste (uczciwy brak — pole pomiarowe nie wyzwala). Deterministyczne stringi,
    lustro istniejącego mechanizmu TR. Uzupełnienie `protection_requirements` w paczkach
    producenckich nadpisuje kanon per rola bez zmiany kodu. Testy: 7/7 sn_bay (IN pominięty
    w asercjach — pokryty przez tablicę + OUT/OZE/TR/MEASUREMENT jawnie).
- **A — ZREALIZOWANA (2026-07-20).** Wyspa Arc Flash (IEEE 1584-2018) wpięta end-to-end:
  `application/analyses/arc_flash_view.py::build_arc_flash_view` (mapowanie SC run → ArcFlashInput,
  ZERO fizyki) → `POST /api/quality/arc-flash` → sekcja UI `SekcjaArcFlash` w oknie „Jakość
  wyników" (formularz parametrów projektowych → przelicz → tabela energii/AFB/PPE + szczegół z
  proweniencją + ślad WHITE BOX w trybie eksperckim). Ik″/napięcie z przebiegu zwarciowego;
  parametry projektowe (odległość robocza, odstęp elektrod, czas wyłączenia, konfiguracja
  elektrod, obudowa) z żądania — brak wejścia ⇒ uczciwe „dane niekompletne" (bez zmyślania).
  Testy: backend 6 (API), frontend 5 (sekcja, realna ścieżka).
  - **A2 (raport) — KARTA:** sekcja Arc Flash w raporcie PDF/DOCX (generacja raportu to osobny
    podsystem; analiza jest w pełni używalna w UI bez niej).
- **C — KARTA:** migracja kreatora OZE do ui2.
- **D — KARTA:** pozostałe legacy → ui2.
- **E — KARTA:** weryfikacja + ewentualne wpięcie protection_ref do koordynacji I-t.
- **F — KARTA:** rewizja inwentarza (status wpięcia per analiza).
