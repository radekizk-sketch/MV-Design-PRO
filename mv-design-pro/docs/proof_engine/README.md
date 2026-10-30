# Proof Engine — Pakiet Kanoniczny

**STATUS: CANONICAL & BINDING**
**Reference:** SYSTEM_SPEC.md, ARCHITECTURE.md

---

## Przeznaczenie

Ten pakiet zawiera **kanoniczne źródła wiedzy** dla systemu dowodów matematycznych (Mathematical Proof Engine, MPE) w MV-DESIGN-PRO.

**Wszystkie agenty (Claude, Codex, inne LLM) MUSZĄ traktować zawartość tego pakietu jako BINDING REFERENCE.**

---

## Zawartość pakietu

| Dokument | Opis | Priorytet |
|----------|------|-----------|
| `P11_OVERVIEW.md` | Definicja TraceArtifact, inwarianty, przypięcie do Project/Case/Run | **BINDING** |
| `P11_1a_MVP_SC3F_AND_VDROP.md` | MVP: SC3F IEC60909 + spadki napięć (VDROP) | **BINDING** |
| `P11_1b_REGULATION_Q_U.md` | Dowód regulatora Q(U), cosφ(P) | REFERENCE |
| `P11_1c_SC_ASYMMETRICAL.md` | Składowe symetryczne, zwarcia niesymetryczne | REFERENCE |
| `P11_1d_PROOF_UI_EXPORT.md` | Proof Inspector UI, eksport LaTeX/PDF/DOCX | REFERENCE |
| `P14_PROOF_AUDIT_AND_COVERAGE.md` | Warstwa audytu pokrycia i Coverage Matrix Proof Packów | **BINDING** |
| `P15_LOAD_CURRENTS_OVERLOAD.md` | P15: Prądy robocze i przeciążenia | **BINDING** |
| `P17_LOSSES_ENERGY_PROFILE.md` | P17: Energia strat (profil czasowy) | **BINDING** |
| `P18_PROTECTION_PROOF.md` | P18: Zabezpieczenia nadprądowe i selektywność | SKASOWANY (karta AB-1a Pakiet L, 2026-09-23 — 0 wołających; wskrzeszenie pilnuje `legacy_public_path_guard`) |
| `P19_EARTHING_GROUND_FAULT_SN.md` | P19: Doziemienia / uziemienia SN | SKASOWANY (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, commit 5, 2026-10-30 — 0 producentów, dubel dowodu bezpieczeństwa uziomu V12.6; wskrzeszenie pilnuje `legacy_public_path_guard`, wiersz ZU5) |
| `P20_NORMATIVE_COMPLETION.md` | P20: Normative Completion (PASS/FAIL) | **BINDING** |
| `P32_LOAD_FLOW_VOLTAGE_PROOF.md` | P32: Load Flow i spadki napięć | **BINDING** |
| `PROOF_SCHEMAS.md` | Kanoniczne schematy JSON (ProofDocument, ProofStep) | **BINDING** |
| `EQUATIONS_IEC60909_SC3F.md` | Rejestr równań SC3F z mapping keys | **BINDING** |
| `EQUATIONS_VDROP.md` | Rejestr równań VDROP z mapping keys | **BINDING** |

---

## Zasady użycia

### Dla agentów AI

1. **NIE INTERPRETUJ** — bierz dosłownie definicje, schematy JSON, równania LaTeX
2. **NIE MODYFIKUJ** solverów ani Result API IEC 60909
3. **UŻYWAJ mapping keys** literalnie przy implementacji
4. **ZACHOWAJ determinism** — identyczne wejścia → identyczne wyjścia

### Dla programistów

1. Proof Engine jest warstwą **interpretacji**, nie fizyki
2. Dane wejściowe: `WhiteBoxTrace` + `SolverResult`
3. Dane wyjściowe: `ProofDocument` (JSON + LaTeX)
4. Solver pozostaje niezmieniony — dowód jest generowany POST-HOC

---

## Terminologia (BINDING)

| Termin polski | Termin angielski | Definicja |
|---------------|------------------|-----------|
| Ślad obliczeń | Trace | Zapis kroków obliczeniowych z wartościami pośrednimi |
| Dowód matematyczny | Mathematical Proof | Formalna prezentacja: wzór → dane → podstawienie → wynik |
| Weryfikacja jednostek | Unit Check | Automatyczne sprawdzenie spójności wymiarowej |
| Krok dowodu | Proof Step | Pojedyncza operacja w łańcuchu dowodowym |
| Dokument dowodowy | Proof Document | Pełny artefakt dowodu dla danego uruchomienia |

---

## Powiązania z architekturą

```
┌─────────────────────────────────────────────────────────────┐
│                      SOLVER LAYER                            │
│  - IEC 60909 Short Circuit                                   │
│  - Newton-Raphson Power Flow                                 │
│  - WhiteBoxTrace (intermediate values)                       │
└─────────────────────────┬───────────────────────────────────┘
                          │ trace + result
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                 INTERPRETATION LAYER                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           PROOF ENGINE (P11)                         │    │
│  │  - ProofDocument generator                           │    │
│  │  - Equation Registry (SC3F, VDROP)                   │    │
│  │  - Unit verification                                 │    │
│  │  - LaTeX/JSON export                                 │    │
│  └─────────────────────────────────────────────────────┘    │
│  - BoundaryIdentifier (BoundaryNode)                                  │
│  - Thermal Analysis                                          │
│  - Voltage Analysis                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Inwarianty (BINDING)

1. **Solver nietknięty** — Proof Engine NIE modyfikuje solverów ani Result API
2. **Determinism** — ten sam `run_id` → identyczny `proof.json` i `proof.tex`
3. **Czysta interpretacja** — dowód jest generowany z gotowych danych trace/result
4. **Kompletność** — każdy krok dowodu ma: wzór, dane, podstawienie, wynik, weryfikację jednostek
5. **Traceability** — każdy wynik w dowodzie ma mapping key do źródła w trace/result
6. **LaTeX-only math** — WSZYSTKIE symbole matematyczne, jednostki i liczby WYŁĄCZNIE w blokach `$$...$$`
7. **Prąd dynamiczny OBOWIĄZKOWY** — obowiązkowy wynik obliczeń zwarciowych
8. **Prąd cieplny OBOWIĄZKOWY** — obowiązkowy wynik z pełnym obliczeniem współczynników

---

## Polityka LaTeX-only (BINDING)

$$
\boxed{
\begin{aligned}
&\textbf{REGUŁA: ZERO MATEMATYKI POZA BLOKAMI } \texttt{\$\$...\$\$} \\[8pt]
&\textbf{DOZWOLONE:} \\[4pt]
&\quad \text{Blokowy LaTeX: } \texttt{\$\$...formuła...\$\$} \\[4pt]
&\textbf{ZABRONIONE:} \\[4pt]
&\quad \text{Inline LaTeX: } \texttt{\$...\$} \\
&\quad \text{Symbole w tekście: } I_k'', \kappa, \Omega, \text{kV}, \text{kA} \\
&\quad \text{Liczby z jednostkami w tekście: } 15{,}0\,\text{kV}, 20\,\text{kA} \\[8pt]
&\textbf{BEZ WYJĄTKÓW — dotyczy również JSON/YAML w dokumentacji}
\end{aligned}
}
$$

---

## TODO — Proof Packs P14–P19 (FUTURE PACKS)

### P14 — Proof Audit & Coverage (DOC ONLY, META)

P14 definiuje **kanoniczną warstwę audytu** kompletności i pokrycia Proof Packów
oraz stanowi **prerequisite** dla P15–P19.

### TODO-P14-001 (PLANNED) — P14: Power Flow Proof Pack (audit wyników PF) [FUTURE PACK]
- Priority: MUST
- Inputs: TraceArtifact, PowerFlowResult
- Output: ProofPack P14 (ProofDocument: Audit rozpływu mocy)
- DoD:
  - [ ] Dowód bilansu węzła dla mocy czynnej i biernej z mapowaniem do TraceArtifact.

    $$
    \sum P = 0,\quad \sum Q = 0
    $$

  - [ ] Bilans gałęzi dla mocy czynnej i biernej uwzględnia straty oraz spadek napięcia.

    $$
    P_{in} \rightarrow P_{out} + P_{loss},\quad Q_{in} \rightarrow Q_{out} + \Delta U
    $$

  - [ ] Straty linii liczone jawnie z prądu i rezystancji.

    $$
    P_{loss} = I^{2} \cdot R
    $$

  - [ ] Porównanie counterfactual Case A vs Case B z raportem różnic.

    $$
    \Delta P,\ \Delta Q,\ \Delta U
    $$

### TODO-P16-001 (PLANNED) — P16: Losses & Energy Proof Pack [FUTURE PACK]
- Priority: MUST
- Inputs: TraceArtifact, PowerFlowResult, Catalog
- Output: ProofPack P16 (ProofDocument: Straty mocy i energii)
- DoD:
  - [ ] Straty linii wyprowadzone z prądu i rezystancji.

    $$
    P_{loss,line} = I^{2} \cdot R
    $$

  - [ ] Straty transformatora z danych katalogowych: suma P0 i Pk.

    $$
    P_{loss,trafo} = P_{0} + P_{k}
    $$

  - [ ] Energia strat z profilu obciążenia (integracja w czasie).

    $$
    E_{loss} = \int P_{loss} \, dt
    $$

### P17 — Losses Energy Profile Proof Pack (IMPLEMENTED)
- Priority: MUST
- Inputs: TraceArtifact, PowerFlowResult, Catalog
- Output: ProofPack P17 (ProofDocument: Energia strat — profil czasowy)
- DoD (DONE):
  - [x] Energia strat z profilu obciążenia w postaci sumy dyskretnej.
  - [x] Wariant stały dla stałej mocy strat i czasu trwania.
  - [x] Deterministyczny ProofDocument z pełną weryfikacją jednostek.

**END OF README**
