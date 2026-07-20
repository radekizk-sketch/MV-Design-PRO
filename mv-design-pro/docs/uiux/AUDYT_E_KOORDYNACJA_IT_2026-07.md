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

### E-3. TMS dla krzywych odwrotnych w torze `protection_ref`
Powód: `ProtectionSetting` nie ma pola TMS; ustawienie go wymaga rozszerzenia
modelu ENM oraz UI kreatora/eksperta (wątek Programu UI/UX — kolizja plików).

Plan: addytywne pole `time_multiplier: float | None = None` w `ProtectionSetting`
(migracja addytywna, `exclude_none`), materializacja z katalogu przekaźników,
kontrolka w kreatorze pola, a następnie rozszerzenie `_build_it_curve` o gałąź
INVERSE (solver już gotowy). Do skoordynowania między wątkami (model ENM + kreator).

Kryteria odbioru: funkcja z `curve_type = IEC_*` i ustawionym TMS zwraca pełną
krzywą odwrotną I-t z solvera; brak TMS nadal daje jawny `it_curve_missing_data`.

### E-4. Wpięcie krzywej I-t z protection-view do wykresu w inspektorze
Powód: `ProtectionSection.tsx` używa danych fixture; realne wpięcie należy do
wątku Programu UI/UX (granice plików). Solver i serializacja (E-1) gotowe —
`TimeCurrentChart` konsumuje `points` bez zmian.

Kryteria odbioru: inspektor renderuje krzywą I-t z pola `it_curve` przebiegu
(ZERO fizyki w UI), a przy `it_curve_missing_data` pokazuje uczciwy stan zerowy
z przyczyną.

---

## 5. Referencje
- `application/protection_read_model.py` (`_build_it_curve`)
- `protection/curves/iec_curves.py`, `protection/curves/curve_calculator.py`
- `application/analyses/protection/coordination/analyzer.py`
- `api/enm.py` (endpoint protection-view), `api/protection_coordination.py`
- `frontend/src/ui/protection-curves/TimeCurrentChart.tsx`
