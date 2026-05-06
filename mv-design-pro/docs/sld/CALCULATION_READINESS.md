# Gotowość obliczeń — kontrakt kanoniczny

**Status:** kanon BINDING — implementacja w PR-9
**Wersja:** v1.0

---

## 1. Cel

Każdy obiekt domenowy i cały projekt mają jawnie wyliczony status gotowości dla 9 typów obliczeń. UI nigdy nie odpala obliczeń bez gotowości i nigdy nie pokazuje fałszywych wyników.

---

## 2. Lista typów obliczeń (BINDING)

| # | Typ | Backend solver | Stan w repo |
|---|---|---|---|
| 1 | Rozpływ mocy | `network_model/solvers/power_flow_newton.py` (NR), `power_flow_gauss_seidel.py`, `power_flow_fast_decoupled.py` | gotowy |
| 2 | Spadki / wzrosty napięcia | wynika z power flow + `analysis/voltage_profile/` | gotowy |
| 3 | Zwarcia | `network_model/solvers/short_circuit_iec60909.py` | gotowy |
| 4 | Asymetria | częściowo (zerowa składowa) | częściowy — wymaga doprecyzowania |
| 5 | Obciążalność | `analysis/coverage_score/`, `analysis/sensitivity/` | gotowy |
| 6 | Stabilność | brak | **brak modułu** |
| 7 | FRT / LVRT / HVRT | brak | **brak modułu** |
| 8 | Zgodność przyłączeniowa NC RfG | brak | **brak modułu** |
| 9 | Raport (OSD / techniczny) | `analysis/reporting/` | gotowy |

---

## 3. Status gotowości

```ts
export type ReadinessStatus =
  | 'ready'               // wszystkie dane, można uruchomić obliczenie
  | 'partial'             // część danych, możliwy wynik częściowy
  | 'blocked'             // krytyczne braki, brak możliwości obliczenia
  | 'no_module'           // brak modułu obliczeniowego w repo
  | 'not_applicable';     // dla danego obiektu obliczenie nie ma sensu
```

Per obiekt + per typ obliczenia.

---

## 4. Zawartość gotowości (per obiekt × typ)

```ts
export interface CalculationReadiness {
  status: ReadinessStatus;
  missingFields: ReadonlyArray<MissingField>;
  blockingObjects: ReadonlyArray<ObjectRef>;
  fixActions: ReadonlyArray<FixAction>;
  /** Dla obiektu: link do karty inspektora i lokalizacji na SLD. */
  ui: {
    cardRef?: string;
    sldRef?: string;
  };
}

export interface MissingField {
  field: string;             // 'fault_current_contribution.value'
  label: string;             // 'Krotność prądu zwarciowego falownika'
  required: boolean;
}

export interface FixAction {
  id: string;
  label: string;             // 'Uzupełnij dane PV-01: krotność I_k falownika'
  target: ObjectRef;
  card?: string;             // np. 'pv.inverter'
}
```

---

## 5. Wymagania danych per typ obliczenia (skrót)

### 5.1 Rozpływ mocy
- topologia kompletna,
- źródło zwarciowe GPZ,
- impedancje kabli/linii,
- transformatory (Sn, uk, Pk),
- P/Q odbiorów,
- P/Q i tryb regulacji DER,
- układ pracy sieci.

### 5.2 Napięcia
- jak rozpływ +
- regulator napięcia DER (Q(U), cos φ),
- punkty regulacji,
- zaczepy transformatorów.

### 5.3 Zwarcia
- źródło zwarciowe GPZ (S_k", X_k/R_k),
- impedancje kabli/linii,
- transformatory (uk, P0),
- contributions DER (PV, BESS, FW) + sposób modelowania,
- typ uziemienia punktu neutralnego,
- profile normatywne (IEC 60909).

### 5.4 Asymetria
- dane fazowe linii / kabli,
- układ połączeń transformatorów,
- obciążenia fazowe,
- modele transformacji składowych (R0, X0).

### 5.5 Obciążalność
- jak rozpływ + parametry cieplne / dynamiczne aparatów.

### 5.6 Stabilność
- modele dynamiczne źródeł / DER,
- regulatory,
- ograniczniki,
- czasy / opóźnienia,
- warunki początkowe,
- scenariusze zakłóceń.

→ `status = 'no_module'` w repo (brak solvera).

### 5.7 FRT / LVRT / HVRT
- krzywe profilu,
- punkt przyłączenia,
- model źródła / magazynu,
- odpowiedź Q / Iq,
- odzysk P.

→ `status = 'no_module'`.

### 5.8 Zgodność przyłączeniowa NC RfG
- typ modułu wytwórczego (A/B/C/D),
- moc, napięcie, punkt przyłączenia,
- profil operatora,
- wymagania techniczne,
- dane testowe / symulacyjne.

→ `status = 'no_module'`.

### 5.9 Raport (OSD / techniczny)
- kompletność danych publicznych,
- brak technicznych snake_case w UI,
- status wyniku.

---

## 6. Warstwa backend (PR-9)

Plik: `backend/src/application/calculation_readiness/`.

```python
class CalculationReadinessService:
    def evaluate_object(self, obj: AnyDomainObject, calc_type: CalculationType) -> CalculationReadiness:
        ...

    def evaluate_project(self, project: Project, calc_type: CalculationType) -> ProjectReadiness:
        ...

    def list_blocking_objects(self, project: Project, calc_type: CalculationType) -> list[ObjectRef]:
        ...

    def get_fix_actions(self, project: Project, calc_type: CalculationType) -> list[FixAction]:
        ...
```

---

## 7. Warstwa frontend (PR-9)

- `ui/network-build/CalculationReadinessPanel.tsx` — sekcja w lewym panelu.
- `ui/inspector/ReadinessTab.tsx` — zakładka „Gotowość obliczeń" w inspectorze.
- Klik braku → `ui/sld/SldFixActionsPanel.tsx` (istnieje) podświetla obiekt na SLD i otwiera kartę.

---

## 8. Reguły UI (BINDING)

1. **NIE wolno** odpalić solvera, jeśli `status` ≠ `'ready'` i `'partial'` (`partial` z explicit confirm).
2. **NIE wolno** pokazać wyników, których nie ma. Brak modułu = `⊘ brak modułu obliczeniowego`.
3. Status w lewym panelu pokazuje **najgorszy** status z 9 typów.
4. Klik statusu otwiera listę braków + linki do obiektów.
5. Klik fix-action otwiera kartę inspectora + sekcję wymagającą uzupełnienia.
6. Status `not_applicable` jest pokazywany jako `n.d.`, nigdy jako `0.00`.

---

**Koniec dokumentu.**
