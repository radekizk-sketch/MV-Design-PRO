# Audyt E — protection_ref → koordynacja I-t (2026-07-20)

Status: CZĘŚCIOWO WDROŻONE (ogniwo serializacji krzywej I-t domknięte;
marginesy koordynacji i TMS krzywych odwrotnych — karty do dalszych przyrostów).

Zakres: powiązanie przypisanego zabezpieczenia nadprądowego (`protection_ref` /
przekaźnik IEC 60255) z realną krzywą czasowo-prądową (I-t) i koordynacją
czasową między stopniami.

---

## 1. Rekonesans (z kodu, stan 2026-07-20)

### Gdzie żyje `protection_ref`
- Model domenowy: `enm/models.py` — `ProtectionAssignment` (pole `breaker_ref`,
  `ct_ref`, `settings: list[ProtectionSetting]`) oraz `Bay.protection_ref`.
- `ProtectionSetting` niesie: `function_type` (overcurrent_50/51, earth_fault_50N/51N,
  directional_67/67N), `threshold_a`, `time_delay_s`,
  `curve_type` (DT, IEC_SI, IEC_VI, IEC_EI, IEC_LI), `is_directional`.
  **TMS (mnożnik czasowy) NIE jest przechowywany.**
- Read model: `application/protection_read_model.py` →
  `build_protection_read_model()`; endpoint `GET /api/cases/{case_id}/enm/protection-view`
  (`api/enm.py`).

### Solver krzywej I-t (IEC 60255) — istnieje
- `protection/curves/iec_curves.py` — pełny solver IEC 60255-151:2009
  (`t = TMS·A/(M^B−1) + C`), typy SI/VI/EI/LTI/DT, generacja punktów krzywej.
  DT w pełni wyznaczone przez `definite_time_s`; krzywe odwrotne wymagają TMS.
- `protection/curves/curve_calculator.py` — ujednolicony fasada (IEC + IEEE),
  `calculate_trip_time`, `calculate_curve_points`, marginesy koordynacji.

### Koordynacja — istnieje, ale odseparowana od `protection_ref`
- `application/analyses/protection/coordination/analyzer.py` —
  `OvercurrentCoordinationAnalyzer`: czułość, przeciążalność, **selektywność
  (marginesy czasowe między stopniami/urządzeniami)**, krzywe TCC, znaczniki
  prądów zwarciowych. Wejście: `devices`, `fault_currents` (z SC), `operating_currents`
  (z PF). WHITE BOX (pełny trace).
- API: `api/protection_coordination.py` — endpointy `run`/`tcc`/`checks/*`.
  Wejście przyjmowane WYŁĄCZNIE jako payload żądania (`RunCoordinationRequest`) —
  **brak mostu z ENM `ProtectionAssignment`**.

### Frontend (konsument)
- `frontend/src/ui/protection-curves/TimeCurrentChart.tsx` — wykres log-log I-t,
  konsumuje `ProtectionCurve[]` (punkty z backendu). ZERO fizyki (tylko render).
- `frontend/src/ui/inspector/ProtectionSection.tsx` — sekcja read-only nastaw
  zabezpieczeń (obecnie fixture / placeholder).

---

## 2. Zidentyfikowana luka (łańcuch)

```
protection_ref (ProtectionAssignment)
  → protection_read_model: funkcje z curve_type + threshold_a + time_delay_s
    → [BRAK] punkty krzywej I-t z solvera IEC 60255
      → frontend TimeCurrentChart (istnieje, czeka na punkty)
```

Read model wystawiał nastawy (próg, zwłoka, typ krzywej), ale **nie serializował
punktów krzywej I-t**. Solver IEC 60255 istniał, lecz nie był wywoływany dla
przypisanych zabezpieczeń przebiegu. Wykres TCC istniał, lecz nie miał danych
z toru `protection_ref`. Ogniwo pękało dokładnie na serializacji.

---

## 3. Co zaimplementowano w tym przyroście (addytywnie)

Plik: `application/protection_read_model.py` — helper `_build_it_curve(setting)`
i addytywne pola w każdej funkcji `settings_summary.functions[]`:

- `it_curve` (obiekt lub `null`):
  `{ standard: "IEC_60255", curve_kind: "DEFINITE"|"INVERSE", curve_code,
     curve_label_pl, pickup_a, time_multiplier, points: [{i_a, t_s}, …] }`.
- `it_curve_missing_data` (lista, tylko gdy niepusta) — jawny brak danych.

Reguły (zero fabrykacji, wartości wyłącznie z solvera):
- **DT / brak curve_type** (charakterystyka niezależna): pełna, płaska krzywa I-t
  z solvera (`definite_time_s = time_delay_s`). Dwa punkty krańcowe w pełni
  opisują charakterystykę płaską.
- **Krzywe odwrotne (IEC_SI/VI/EI/LI)**: wymagają TMS, którego model ENM nie
  przechowuje → `it_curve = null`, `it_curve_missing_data = ["time_multiplier"]`.
  Mnożnik czasowy NIE jest zgadywany.
- Brak progu (`threshold_a`) lub zwłoki (DT) → jawny wpis w `it_curve_missing_data`.

Testy: `tests/enm/test_enm_protection_view_api.py::test_protection_view_serializes_it_curve_from_iec60255_solver`
(DT → punkty t_s = 0,05 s z solvera; IEC_SI → brak TMS). Weryfikacja end-to-end
przez realny endpoint (`TestClient` GET protection-view).

Bramki: pytest (3 pass w pliku, 30 pass w szerszym zakresie protection),
ruff + black (czyste na dotkniętych plikach), mypy czyste na dodanym kodzie,
`utf8_mojibake_guard`, `docs_guard`, `protection_no_heuristics_guard` — PASS.

Granice: kontrakty FROZEN solverów nietknięte (read model to warstwa aplikacji,
nie Result API). Determinizm zachowany (stały zakres prądu, stała liczba punktów,
brak losowości/znaczników czasu w krzywej).

---

## 4. Pozostałe luki (kolejne przyrosty — nie improwizować)

### E-2. Marginesy koordynacji między stopniami/urządzeniami z `protection_ref`
Powód nietractowalności w tym przyroście: obliczenie realnych marginesów czasowych
(Δt = t_nadrzędne − t_podrzędne) wymaga **prądu zwarciowego z solvera SC (IEC 60909)**
oraz **decyzji produktowej o kolejności topologicznej urządzeń** (który przekaźnik
jest nadrzędny/podrzędny). `OvercurrentCoordinationAnalyzer` już to liczy, lecz jest
zasilany osobnym payloadem, nie ENM.

Plan wdrożenia:
1. Adapter `ProtectionAssignment[] → devices` (mapowanie nastaw na
   `ProtectionDevice`/`OvercurrentStageSettings`).
2. Zasilenie `fault_currents`/`operating_currents` z wyników SC/PF przebiegu
   (run-scoped), z jawną eligibility gdy brak wyników.
3. Ustalenie kolejności urządzeń z topologii ENM (upstream/downstream względem
   źródła) — wymaga rozstrzygnięcia produktowego.
4. Endpoint/rozszerzenie zwracające `selectivity_checks` powiązane z `device_id`
   z ENM.

Kryteria odbioru: dla przebiegu z ≥2 przypisanymi zabezpieczeniami w szeregu i
dostępnymi wynikami SC — API zwraca marginesy czasowe (Δt, wymagany CTI, werdykt)
per para urządzeń; wartości identyczne z `OvercurrentCoordinationAnalyzer`;
determinizm i WHITE BOX trace zachowane.

### E-3. TMS dla krzywych odwrotnych w torze `protection_ref` — WDROŻONE (2026-07-21)
Powód (luka): `ProtectionSetting` nie przechowywał mnożnika czasowego (TMS),
więc `_build_it_curve` dla charakterystyk odwrotnych (IEC SI/VI/EI/LTI) zawsze
zwracał `it_curve = null` + `it_curve_missing_data = ["time_multiplier"]` —
krzywe odwrotne nie były liczone przez solver ani renderowane w inspektorze.

Wdrożenie (addytywne, FROZEN-safe):
- Model ENM `enm/models.py` — `ProtectionSetting` rozszerzony **addytywnie** o
  `time_multiplier: float | None = None` (TMS). Pole opcjonalne z defaultem
  `None`: dokumenty ENM bez TMS walidują się bez zmian. Determinizm hashy ENM
  (`input_hash`/`semantic_hash`) niezmieniony — zweryfikowane pełną regresją
  `tests/enm/` + `tests/e2e/` (809 passed), zgodnie z ustalonym wzorcem
  addytywnych pól opcjonalnych (por. `TapChanger`, `Transformer.tap_changer`).
- Read model `application/protection_read_model.py` — `_build_it_curve`:
  dla gałęzi INVERSE, gdy `setting.time_multiplier` jest podane i dodatnie →
  krzywa liczona solverem IEC 60255 z tym TMS (gęste, logarytmiczne próbkowanie
  `_IT_CURVE_INVERSE_NUM_POINTS = 64`), a `it_curve.time_multiplier` = realny TMS;
  gdy TMS brak → nadal jawny `it_curve_missing_data = ["time_multiplier"]`
  (ZERO fabrykacji mnożnika). Wartości `t_s` WYŁĄCZNIE z solvera.
- Typ frontendu `types/enm.ts` — `ProtectionSetting` rozszerzony addytywnie o
  `time_multiplier?: number | null` (parytet kontraktu; ZERO fizyki w UI).

Decyzja UI (bez fabrykacji): w UI **nie ma** edytora nastaw ENM
`ProtectionSetting` — nastawy pochodzą z fixture/backendu (`protection-view` jest
read-only; `ProtectionSection.tsx` tylko wyświetla `curve_type`). Osobny
`protection-coordination/ProtectionSettingsEditor.tsx` operuje na własnym modelu
koordynacji (`curve_settings.time_multiplier`) i NIE zapisuje do ENM. Tor
prezentacyjny krzywej odwrotnej był już gotowy z E-4: `ProtectionFunctionItCurve`
modeluje `curve_kind: 'INVERSE'` i `time_multiplier`, a `itCurveAdapter` przenosi
TMS z backendu — po E-3 panel `ItCurvePanel` renderuje realne krzywe odwrotne bez
zmian w rendererze. Kontrolki TMS w UI nie tworzono „na siłę" (brak dostawcy
zapisu do ENM = brak phantomu).

Testy (realna ścieżka):
- Backend `tests/enm/test_enm_protection_view_api.py` —
  `test_protection_view_inverse_it_curve_with_tms_from_solver`: pełny tor
  HTTP → read model → solver dla funkcji 51 (IEC_SI) z TMS = 0,2 zwraca
  `it_curve` z punktami (curve_kind INVERSE, monotonicznie opadający czas,
  `time_multiplier == 0.2`, bez `it_curve_missing_data`); dotychczasowy przypadek
  bez TMS nadal daje `["time_multiplier"]`.
- Frontend `ui/protection-curves/__tests__/ItCurvePanel.test.tsx` — render
  natywny krzywej INVERSE (SI) z TMS: wykres + podsumowanie, oraz adapter
  przenoszący TMS i typ krzywej.

Kryteria odbioru (spełnione): funkcja z `curve_type = IEC_*` i ustawionym TMS
zwraca pełną krzywą odwrotną I-t z solvera; brak TMS nadal daje jawny
`it_curve_missing_data`.

### E-4. Wpięcie krzywej I-t z protection-view do wykresu w inspektorze — WDROŻONE (2026-07-21)
Solver i serializacja (E-1) gotowe; ogniwo prezentacyjne domknięte w wątku
Programu UI/UX.

Wdrożenie (frontend, obszar zabezpieczeń):
- Model widoku `ProtectionFunctionSummary` (`ui/protection/settings-model.ts`)
  rozszerzony **addytywnie** o `it_curve` (`ProtectionFunctionItCurve`, punkty
  `{ i_a, t_s }`) oraz `it_curve_missing_data: string[]` — czysty widok danych
  z backendu, ZERO fizyki.
- Adapter `ui/protection-curves/itCurveAdapter.ts`:
  `itCurveToProtectionCurve()` przenosi punkty `{ i_a, t_s }` → `CurvePoint`
  (`{ current_a, current_multiple, time_s }`) bez interpolacji i bez obliczeń
  czasu; `itCurveMissingReasonsPl()` mapuje kody braku danych (`time_multiplier`,
  `pickup_current`, `definite_time`, `it_curve_points`) na przyczyny po polsku.
- Komponent `ui/protection-curves/ItCurvePanel.tsx` — panel „Krzywa I-t":
  gdy `it_curve` z punktami → mini-wykres `TimeCurrentChart` (log-log) +
  podsumowanie (etykieta · liczba punktów · Ip); gdy `it_curve === null` →
  uczciwy stan zerowy z listą przyczyn (np. „Brak mnożnika czasowego (TMS) —
  krzywa odwrotna niedostępna" dla `["time_multiplier"]`).
- `ui/inspector/ProtectionSection.tsx` — panel wpięty w wiersz funkcji
  (`FunctionSummaryRow`); renderowany tylko gdy backend dostarczył `it_curve`
  LUB jawnie zgłosił brak danych.

Testy: `ui/protection-curves/__tests__/ItCurvePanel.test.tsx` — realna ścieżka
renderu funkcji z krzywą DEFINITE (punkty na wykresie + podsumowanie) oraz z
`it_curve = null` + `["time_multiplier"]` (uczciwy stan braku), plus mapowanie
punktów i przyczyn w adapterze.

Dług resztkowy (poza granicą wątku, nie blokuje E-4): inspektorowy hook
`useProtectionAssignment` zwraca dziś pustą listę (endpoint
`GET /api/projects/{id}/protection-assignments` w publicznej warstwie API jeszcze
nieudostępniony). Panel jest wpięty i przetestowany na realnym kształcie danych;
zacznie renderować krzywe automatycznie po podłączeniu hooka do
`protection-view` / endpointu przypisań (karta w wątku Programu UI/UX).

### E-5. Ożywienie inspektora zabezpieczeń realnym `protection-view` — WDROŻONE (2026-07-21)
Domknięcie długu resztkowego z E-4: inspektor zabezpieczeń (w tym krzywa I-t)
renderuje się z realnego read modelu zamiast zwracać pustą listę.

Źródło danych: istniejący endpoint `GET /api/cases/{caseId}/enm/protection-view`
(backend `application/protection_read_model.build_protection_read_model`) —
dedykowany endpoint `.../protection-assignments` okazał się zbędny, read model
`protection-view` już serializuje `assignments[]` z `settings_summary.functions[].it_curve`.

Wdrożenie (frontend, obszar `ui/protection*` + `ui/inspector`):
- `ui/protection/protection-view.ts` — klient HTTP (`fetchProtectionView`) +
  adapter `assignmentsForElement(response, elementId)` mapujący `assignments[]`
  read modelu na `ElementProtectionAssignment[]` (przepisanie kształtu, ZERO
  obliczeń; filtr po `element_id`).
- `ui/protection/useProtectionView.ts` — hook pobierający widok dla aktywnego
  case'u (`useAppStateStore.activeCaseId`), z cache kluczowanym przez
  `(caseId, revision snapshotu)` i deduplikacją zapytań (wzorzec
  `field/useFieldReadModel`).
- `ui/protection/useProtectionAssignment.ts` — zamiast pustej tablicy filtruje
  realny widok po `elementId`; przekazuje `isLoading`/`error` z hooka.
- `ui/inspector/ProtectionSection.tsx` — usunięto notkę „Dane demonstracyjne
  (fixture)"; dodano uczciwe stany: ładowanie, błąd oraz „Brak przypisanych
  zabezpieczeń dla tego elementu" (sekcja chowa się, gdy brak danych i brak
  sygnału ładowania/błędu).

Testy: `ui/inspector/__tests__/ProtectionSection.realData.test.tsx` — realna
ścieżka (fetch mockowany na granicy API): element z zabezpieczeniem renderuje
funkcje + krzywą I-t z solvera; natywny (userEvent) klik w nagłówek zwija/rozwija
panel; element bez zabezpieczenia → uczciwy stan pusty (brak sekcji).

Dług resztkowy (bez zmian, poza granicą wątku): bulk hook
`useProtectionAssignments` (nakładka SLD, sygnatura `projectId`/`diagramId`)
nadal czeka na dedykowany endpoint zbiorczy — nie dotykany (granica: `ui/sld/**`).

---

## 5. Referencje
- `application/protection_read_model.py` (`_build_it_curve`)
- `protection/curves/iec_curves.py`, `protection/curves/curve_calculator.py`
- `application/analyses/protection/coordination/analyzer.py`
- `api/enm.py` (endpoint protection-view), `api/protection_coordination.py`
- `frontend/src/ui/protection-curves/TimeCurrentChart.tsx`
