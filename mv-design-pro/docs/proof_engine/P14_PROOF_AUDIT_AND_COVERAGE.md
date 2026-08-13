# P14 — Proof Audit & Coverage (warstwa audytu)

**STATUS: CANONICAL & BINDING**  
**Reference:** SYSTEM_SPEC.md, ARCHITECTURE.md, PLANS.md

---

## 1. Definicja P14 (META-only, BINDING)

P14 definiuje **kanoniczny audyt kompletności i pokrycia Proof Packów**.
Jest to **warstwa meta (doc-only)**: nie wykonuje obliczeń, nie zmienia solverów
ani Proof Engine. P14 jest źródłem prawdy dla stanu pokrycia P11/P15/P17/P18
oraz mapowania braków względem oczekiwań PF/benchmark-grade.

---

## 2. Inwarianty (POST-HOC, no solver changes, determinism)

1. **POST-HOC** — audyt P14 jest wykonywany po fakcie na danych wynikowych.
2. **No solver changes** — P14 nie zmienia solverów ani Result API.
3. **Determinism** — identyczne wejścia i referencje → identyczny raport audytu.
4. **Doc-only** — brak kodu, brak heurystyk, brak interpretacji norm.

---

## 3. Coverage Matrix (BINDING)

| Wielkość / Obiekt | Jednostka | Źródło danych | Proof Pack | Status | Uwagi |
|---|---|---|---|---|---|
| SC3F: napięcie Thevenina $$U_{th}$$ | $$\\text{kV}$$ | SolverResult + Trace | P11 | FULL | Obowiązkowe mapowanie trace/result. |
| SC3F: impedancja Thevenina $$Z_{th}$$ | $$\\Omega$$ | SolverResult + Trace | P11 | FULL | Obowiązkowe mapowanie trace/result. |
| SC3F: prąd zwarciowy początkowy $$I_{k}^{\\prime\\prime}$$ | $$\\text{kA}$$ | SolverResult + Trace | P11 | FULL | Wymagane pełne kroki dowodu. |
| SC3F: moc zwarciowa $$S_{k}^{\\prime\\prime}$$ | $$\\text{MVA}$$ | SolverResult + Trace | P11 | FULL | Wymagane pełne kroki dowodu. |
| SC3F: prąd dynamiczny $$i_{p}$$ | $$\\text{kA}$$ | SolverResult + Trace | P11 | PARTIAL | Wymagany w P11, audyt zależny od kompletności trace. |
| VDROP: spadek napięcia $$\\Delta U$$ | $$\\%$$ | SolverResult + Trace | P11 | FULL | Składowe $$R \\cdot P$$ oraz $$X \\cdot Q$$ w trace. |
| P15: moc pozorna $$S$$ | $$\\text{kVA}$$ | SolverResult + Trace | P15 | PARTIAL | Brak pełnego Proof Pack; wartości z PF. |
| P15: prąd roboczy $$I$$ | $$\\text{A}$$ | SolverResult + Trace | P15 | PARTIAL | Brak pełnego Proof Pack; wartości z PF. |
| P15: procent prądu znamionowego $$\\%I_{n}$$ | $$\\%$$ | Catalog + SolverResult | P15 | PARTIAL | Tylko gdy $$I_{n}$$ dostępne w katalogu. |
| P15: procent mocy znamionowej $$\\%S_{n}$$ | $$\\%$$ | Catalog + SolverResult | P15 | PARTIAL | Tylko gdy $$S_{n}$$ dostępne w katalogu. |
| P15: porównanie A/B/$$\\Delta$$ | - | UserInput + SolverResult | P15 | PARTIAL | Wymaga porównań Case; brak pełnego dowodu. |
| P17: energia strat profilu $$E_{loss}$$ | $$\\text{kWh}$$ | SolverResult + Trace | P17 | FULL | Profil dyskretny (suma kroków). |
| P17: wariant stały $$E_{loss}$$ | $$\\text{kWh}$$ | UserInput + SolverResult | P17 | FULL | Stała moc strat i czas trwania. |
| P18: breaking $$I_{k}^{\\prime\\prime}$$ vs $$I_{cu}$$ | $$\\text{kA}$$ | SolverResult + Catalog | P18 | PARTIAL | Porównanie bez klasyfikacji normowej PASS/FAIL. |
| P18: dynamic $$i_{p}$$ vs $$I_{dyn}$$ | $$\\text{kA}$$ | SolverResult + Catalog | P18 | PARTIAL | Dane katalogowe wymagane. |
| P18: thermal $$I^{2} t$$ vs $$I_{th}$$ | $$\\text{A}^{2}\\text{s}$$ | SolverResult + Catalog | P18 | PARTIAL | Brak pełnych krzywych czasowo-prądowych. |
| P18: selectivity OK/NOT_EVALUATED | - | UserInput + Catalog | P18 | NOT COVERED | Bez pełnych krzywych selektywności. |

---

## 4. Status pokrycia (FULL / PARTIAL / NOT COVERED)

- **FULL** — istnieje kompletny Proof Pack z pełnym mapowaniem trace/result.
- **PARTIAL** — istnieją wyniki i/lub porównania, brak pełnego dowodu.
- **NOT COVERED** — brak danych lub brak podstaw do oceny w Proof Pack.

Podsumowanie statusu względem PF/benchmark-grade:
- **P11** — FULL (SC3F, VDROP). 
- **P15** — PARTIAL (wyniki dostępne, brak kompletnego dowodu).
- **P17** — FULL (profil dyskretny + wariant stały).
- **P18** — PARTIAL (porównania dostępne, selektywność bez krzywych → NOT COVERED).

---

## 5. GAPS (jawne braki, BINDING)

- **P14-GAP-001** — brak earthing/doziemień (P19).  
  Wpływ: brak audytu doziemień SN i powiązanych ograniczeń ochrony.  
  Planowany pack/faza: P19.  
  Status: PLANNED.

- **P14-GAP-002** — selektywność bez pełnych krzywych czasowo-prądowych.  
  Wpływ: selektywność oznaczana jako NOT_EVALUATED.  
  Planowany pack/faza: P18 rozszerzenie po dostarczeniu krzywych.  
  Status: PLANNED.

- **P14-GAP-003** — brak klasyfikacji normowej PASS/FAIL.  
  Wpływ: użytkownik otrzymuje porównania liczbowe bez normatywnej kwalifikacji.  
  Planowany pack/faza: P20 completion (normative layer).  
  Status: OUT OF SCOPE.

---

## 6. Reguła prezentacji w UI/Inspector

Jeżeli brak dowodu dla danej wielkości, UI/Inspector **musi** prezentować status:
**NOT COMPUTED**. Brak danych nie może być prezentowany jako wartość domyślna
ani ukryty brak.

---

## 7. Mapping do benchmark/benchmark (terminologia, bez claimów)

| MV-DESIGN-PRO (Proof) | benchmark / benchmark (termin) | Oczekiwanie audytowe |
|---|---|---|
| Proof Pack P11 — SC3F/VDROP | Short-Circuit / Voltage Drop | Jawne mapowanie wartości i jednostek. |
| Proof Pack P15 — prądy robocze i przeciążenia | Load Flow Results / Loading | Porównanie do danych katalogowych. |
| Proof Pack P17 — energia strat | Energy/Losses | Profil dyskretny lub wariant stały. |
| Proof Pack P18 — ochrona i selektywność | Protection / Selectivity | Porównania liczbowe bez normatywnego PASS/FAIL. |

---

**END OF P14**

