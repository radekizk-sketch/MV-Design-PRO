# P14 — Proof Audit & Coverage (warstwa audytu)

**STATUS: CANONICAL & BINDING**  
**Reference:** SYSTEM_SPEC.md, ARCHITECTURE.md, PLANS.md

---

## 1. Definicja P14 (META-only, BINDING)

P14 definiuje **kanoniczny audyt kompletnoĹ›ci i pokrycia Proof PackĂłw**.
Jest to **warstwa meta (doc-only)**: nie wykonuje obliczeĹ„, nie zmienia solverĂłw
ani Proof Engine. P14 jest ĹşrĂłdĹ‚em prawdy dla stanu pokrycia P11/P15/P17/P18
oraz mapowania brakĂłw względem oczekiwaĹ„ PF/benchmark-grade.

---

## 2. Inwarianty (POST-HOC, no solver changes, determinism)

1. **POST-HOC** — audyt P14 jest wykonywany po fakcie na danych wynikowych.
2. **No solver changes** — P14 nie zmienia solverĂłw ani Result API.
3. **Determinism** — identyczne wejĹ›cia i referencje → identyczny raport audytu.
4. **Doc-only** — brak kodu, brak heurystyk, brak interpretacji norm.

---

## 3. Coverage Matrix (BINDING)

| WielkoĹ›ć / Obiekt | Jednostka | ĹąrĂłdĹ‚o danych | Proof Pack | Status | Uwagi |
|---|---|---|---|---|---|
| SC3F: napięcie Thevenina $$U_{th}$$ | $$\\text{kV}$$ | SolverResult + Trace | P11 | FULL | Obowiązkowe mapowanie trace/result. |
| SC3F: impedancja Thevenina $$Z_{th}$$ | $$\\Omega$$ | SolverResult + Trace | P11 | FULL | Obowiązkowe mapowanie trace/result. |
| SC3F: prąd zwarciowy początkowy $$I_{k}^{\\prime\\prime}$$ | $$\\text{kA}$$ | SolverResult + Trace | P11 | FULL | Wymagane peĹ‚ne kroki dowodu. |
| SC3F: moc zwarciowa $$S_{k}^{\\prime\\prime}$$ | $$\\text{MVA}$$ | SolverResult + Trace | P11 | FULL | Wymagane peĹ‚ne kroki dowodu. |
| SC3F: prąd dynamiczny $$i_{p}$$ | $$\\text{kA}$$ | SolverResult + Trace | P11 | PARTIAL | Wymagany w P11, audyt zaleĹĽny od kompletnoĹ›ci trace. |
| VDROP: spadek napięcia $$\\Delta U$$ | $$\\%$$ | SolverResult + Trace | P11 | FULL | SkĹ‚adowe $$R \\cdot P$$ oraz $$X \\cdot Q$$ w trace. |
| P15: moc pozorna $$S$$ | $$\\text{kVA}$$ | SolverResult + Trace | P15 | PARTIAL | Brak peĹ‚nego Proof Pack; wartoĹ›ci z PF. |
| P15: prąd roboczy $$I$$ | $$\\text{A}$$ | SolverResult + Trace | P15 | PARTIAL | Brak peĹ‚nego Proof Pack; wartoĹ›ci z PF. |
| P15: procent prądu znamionowego $$\\%I_{n}$$ | $$\\%$$ | Catalog + SolverResult | P15 | PARTIAL | Tylko gdy $$I_{n}$$ dostępne w katalogu. |
| P15: procent mocy znamionowej $$\\%S_{n}$$ | $$\\%$$ | Catalog + SolverResult | P15 | PARTIAL | Tylko gdy $$S_{n}$$ dostępne w katalogu. |
| P15: porĂłwnanie A/B/$$\\Delta$$ | - | UserInput + SolverResult | P15 | PARTIAL | Wymaga porĂłwnaĹ„ Case; brak peĹ‚nego dowodu. |
| P17: energia strat profilu $$E_{loss}$$ | $$\\text{kWh}$$ | SolverResult + Trace | P17 | FULL | Profil dyskretny (suma krokĂłw). |
| P17: wariant staĹ‚y $$E_{loss}$$ | $$\\text{kWh}$$ | UserInput + SolverResult | P17 | FULL | StaĹ‚a moc strat i czas trwania. |
| P18: breaking $$I_{k}^{\\prime\\prime}$$ vs $$I_{cu}$$ | $$\\text{kA}$$ | SolverResult + Catalog | P18 | PARTIAL | PorĂłwnanie bez klasyfikacji normowej PASS/FAIL. |
| P18: dynamic $$i_{p}$$ vs $$I_{dyn}$$ | $$\\text{kA}$$ | SolverResult + Catalog | P18 | PARTIAL | Dane katalogowe wymagane. |
| P18: thermal $$I^{2} t$$ vs $$I_{th}$$ | $$\\text{A}^{2}\\text{s}$$ | SolverResult + Catalog | P18 | PARTIAL | Brak peĹ‚nych krzywych czasowo-prądowych. |
| P18: selectivity OK/NOT_EVALUATED | - | UserInput + Catalog | P18 | NOT COVERED | Bez peĹ‚nych krzywych selektywnoĹ›ci. |

---

## 4. Status pokrycia (FULL / PARTIAL / NOT COVERED)

- **FULL** — istnieje kompletny Proof Pack z peĹ‚nym mapowaniem trace/result.
- **PARTIAL** — istnieją wyniki i/lub porĂłwnania, brak peĹ‚nego dowodu.
- **NOT COVERED** — brak danych lub brak podstaw do oceny w Proof Pack.

Podsumowanie statusu względem PF/benchmark-grade:
- **P11** — FULL (SC3F, VDROP). 
- **P15** — PARTIAL (wyniki dostępne, brak kompletnego dowodu).
- **P17** — FULL (profil dyskretny + wariant staĹ‚y).
- **P18** — PARTIAL (porĂłwnania dostępne, selektywnoĹ›ć bez krzywych → NOT COVERED).

---

## 5. GAPS (jawne braki, BINDING)

- **P14-GAP-001** — brak earthing/doziemieĹ„ (P19).  
  WpĹ‚yw: brak audytu doziemieĹ„ SN i powiązanych ograniczeĹ„ ochrony.  
  Planowany pack/faza: P19.  
  Status: PLANNED.

- **P14-GAP-002** — selektywnoĹ›ć bez peĹ‚nych krzywych czasowo-prądowych.  
  WpĹ‚yw: selektywnoĹ›ć oznaczana jako NOT_EVALUATED.  
  Planowany pack/faza: P18 rozszerzenie po dostarczeniu krzywych.  
  Status: PLANNED.

- **P14-GAP-003** — brak klasyfikacji normowej PASS/FAIL.  
  WpĹ‚yw: uĹĽytkownik otrzymuje porĂłwnania liczbowe bez normatywnej kwalifikacji.  
  Planowany pack/faza: P20 completion (normative layer).  
  Status: OUT OF SCOPE.

---

## 6. ReguĹ‚a prezentacji w UI/Inspector

JeĹĽeli brak dowodu dla danej wielkoĹ›ci, UI/Inspector **musi** prezentować status:
**NOT COMPUTED**. Brak danych nie moĹĽe być prezentowany jako wartoĹ›ć domyĹ›lna
ani ukryty brak.

---

## 7. Mapping do benchmark/benchmark (terminologia, bez claimĂłw)

| MV-DESIGN-PRO (Proof) | benchmark / benchmark (termin) | Oczekiwanie audytowe |
|---|---|---|
| Proof Pack P11 — SC3F/VDROP | Short-Circuit / Voltage Drop | Jawne mapowanie wartoĹ›ci i jednostek. |
| Proof Pack P15 — prądy robocze i przeciąĹĽenia | Load Flow Results / Loading | PorĂłwnanie do danych katalogowych. |
| Proof Pack P17 — energia strat | Energy/Losses | Profil dyskretny lub wariant staĹ‚y. |
| Proof Pack P18 — ochrona i selektywnoĹ›ć | Protection / Selectivity | PorĂłwnania liczbowe bez normatywnego PASS/FAIL. |

---

**END OF P14**

