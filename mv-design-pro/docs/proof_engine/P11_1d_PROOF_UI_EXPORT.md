# P11.1d — Proof Inspector (Kanoniczny)

**STATUS: CANONICAL & BINDING**
**Version:** 2.0
**Reference:** P11_OVERVIEW.md, PROOF_SCHEMAS.md, SYSTEM_SPEC.md Â§ 19

---

## 0. Dokument referencyjny

Ten dokument definiuje **Proof Inspector** — kanoniczną warstwę prezentacyjno-dowodową systemu MV-DESIGN-PRO.

### 0.1 Pozycja w hierarchii systemu

$$
\boxed{
\begin{aligned}
&\textbf{SOLVER LAYER (FROZEN)} \\
&\quad \downarrow \quad \text{WhiteBoxTrace + SolverResult (READ-ONLY)} \\[6pt]
&\textbf{INTERPRETATION LAYER} \\
&\quad \downarrow \quad \text{TraceArtifact + ProofDocument} \\[6pt]
&\textbf{PRESENTATION LAYER} \\
&\quad \boxed{\textbf{PROOF INSPECTOR (P11.1d)}}
\end{aligned}
}
$$

### 0.2 Definicja komponentu

$$
\boxed{
\begin{aligned}
&\textbf{Proof Inspector} = \text{warstwa prezentacji dowodu matematycznego} \\[8pt]
&\text{JEST:} \\
&\quad \bullet \text{ Read-only viewer nad } \texttt{ProofDocument} \\
&\quad \bullet \text{ Eksporter do JSON / LaTeX / PDF / DOCX} \\
&\quad \bullet \text{ Narzędzie audytu (Ĺ›lad obliczeĹ„ — White Box)} \\[8pt]
&\text{NIE JEST:} \\
&\quad \bullet \text{ Solverem (brak fizyki)} \\
&\quad \bullet \text{ Analysis (brak interpretacji normowej)} \\
&\quad \bullet \text{ Edytorem (dowĂłd jest IMMUTABLE)}
\end{aligned}
}
$$

### 0.3 WejĹ›cia i wyjĹ›cia (BINDING)

| Kierunek | ĹąrĂłdĹ‚o / Cel | Opis |
|----------|--------------|------|
| **WejĹ›cie** | `ProofDocument` | Dokument dowodowy z generatora (JSON) |
| **WejĹ›cie** | `TraceArtifact` | Kontekst uruchomienia (run_id, case_id, snapshot_id) |
| **WyjĹ›cie** | WyĹ›wietlenie UI | Proof Inspector w przeglądarce |
| **WyjĹ›cie** | `proof.json` | Eksport 1:1 z ProofDocument |
| **WyjĹ›cie** | `proof.tex` | Eksport LaTeX (blokowy, $$ only) |
| **WyjĹ›cie** | `proof.pdf` | Dokument PDF (via LaTeX) |
| **WyjĹ›cie** | `proof.docx` | Dokument Microsoft Word |

---

## 1. Model mentalny (BINDING)

### 1.1 Relacja przepĹ‚ywu danych

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ 1. SOLVER EXECUTION                                                      â”‚
â”‚    Input: NetworkSnapshot + SolverConfig                                 â”‚
â”‚    Output: SolverResult + WhiteBoxTrace                                  â”‚
â”‚    (FROZEN — Proof Inspector NIE modyfikuje)                            â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                                 â”‚ (READ-ONLY)
                                 â–Ľ
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ 2. PROOF ENGINE (P11)                                                    â”‚
â”‚    - Tworzy TraceArtifact (immutable)                                   â”‚
â”‚    - Generuje ProofDocument (kroki + weryfikacja jednostek)             â”‚
â”‚    - Mapuje wartoĹ›ci z trace → symbole matematyczne                     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                                 â”‚ (READ-ONLY)
                                 â–Ľ
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ 3. PROOF INSPECTOR (P11.1d) — TEN DOKUMENT                              â”‚
â”‚    - Prezentuje ProofDocument uĹĽytkownikowi                             â”‚
â”‚    - Eksportuje do formatĂłw (JSON/LaTeX/PDF/DOCX)                       â”‚
â”‚    - ZERO LOGIKI OBLICZENIOWEJ                                          â”‚
â”‚    - ZERO INTERPRETACJI NORMOWEJ                                        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

### 1.2 Czym Proof Inspector NIE JEST (BINDING)

| NIE jest | Uzasadnienie | Gdzie ta funkcja? |
|----------|--------------|-------------------|
| Solverem | Nie wykonuje obliczeĹ„ fizycznych | Solver Layer |
| Analysis | Nie interpretuje wynikĂłw (brak limitĂłw, brak oceny) | Analysis Layer |
| Edytorem | DowĂłd jest IMMUTABLE po wygenerowaniu | — |
| Walidatorem | Nie sprawdza zgodnoĹ›ci z normami | Analysis Layer |
| Kalkulatorem | Nie przelicza wartoĹ›ci | Solver Layer |
| Formatowaczem danych | Nie modyfikuje struktury ProofDocument | — |

### 1.3 Zasada â€žZero Intelligence"

$$
\boxed{
\textbf{Proof Inspector wyĹ›wietla dokĹ‚adnie to, co otrzymaĹ‚ z ProofDocument.}
}
$$

- Brak dodatkowych obliczeĹ„
- Brak decyzji logicznych (if/else na podstawie wartoĹ›ci)
- Brak kolorowania â€ždobry/zĹ‚y"
- Brak interpretacji normowej
- Brak modyfikacji wartoĹ›ci

---

## 2. Struktura widoku dowodu (BINDING)

### 2.1 NagĹ‚Ăłwek dowodu (ProofHeader)

KaĹĽdy dowĂłd MUSI zawierać nagĹ‚Ăłwek z peĹ‚nymi metadanymi:

$$
\begin{array}{|l|l|l|}
\hline
\textbf{Pole} & \textbf{ĹąrĂłdĹ‚o} & \textbf{PrzykĹ‚ad} \\
\hline
\text{Typ analizy} & \texttt{proof\_type} & \text{Zwarcie trĂłjfazowe IEC 60909} \\
\text{Norma} & \texttt{standard\_ref} & \text{IEC 60909-0:2016} \\
\text{Projekt} & \texttt{project\_name} & \text{Projekt SN-01} \\
\text{Przypadek} & \texttt{case\_name} & \text{Zwarcie na szynie B2} \\
\text{Uruchomienie} & \texttt{run\_timestamp} & \text{2026-01-27T10:29:55Z} \\
\text{snapshot\_id} & \texttt{TraceArtifact} & \texttt{6ba7b810-9dad-...} \\
\text{run\_id} & \texttt{TraceArtifact} & \texttt{550e8400-e29b-...} \\
\text{Wersja solvera} & \texttt{solver\_version} & \text{1.2.0} \\
\text{Fingerprint} & \text{hash(ProofDocument)} & \texttt{sha256:abc123...} \\
\hline
\end{array}
$$

### 2.2 Lista krokĂłw (ProofStep) — sekwencja

KolejnoĹ›ć krokĂłw jest **ustalona przez Equation Registry** i **nie moĹĽe być zmieniana** przez UI.

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ SPIS KROKĂ“W (read-only, navigation)                             â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ 1. Napięcie z wspĂłĹ‚czynnikiem c                                 â”‚
â”‚ 2. Impedancja ĹşrĂłdĹ‚a                                            â”‚
â”‚ 3. Impedancja zastępcza Thevenina                               â”‚
â”‚ â–ş 4. Początkowy prąd zwarciowy I_k''                           â”‚
â”‚ 5. WspĂłĹ‚czynnik udaru Îş                                         â”‚
â”‚ 6. Prąd udarowy i_p                                             â”‚
â”‚ 7. Moc zwarciowa S_k''                                          â”‚
â”‚ 8. Prąd cieplny rĂłwnowaĹĽny I_th                                 â”‚
â”‚ 9. Prąd dynamiczny I_dyn                                        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

### 2.3 Struktura pojedynczego kroku (5 sekcji — MANDATORY)

KaĹĽdy krok dowodu MUSI zawierać dokĹ‚adnie **5 sekcji** w tej kolejnoĹ›ci:

$$
\boxed{
\textbf{KROK } n: \quad \underbrace{\text{WZĂ“R}}_{\text{1}} \to \underbrace{\text{DANE}}_{\text{2}} \to \underbrace{\text{PODSTAWIENIE}}_{\text{3}} \to \underbrace{\text{WYNIK}}_{\text{4}} \to \underbrace{\text{WERYFIKACJA JEDNOSTEK}}_{\text{5}}
}
$$

#### 2.3.1 Sekcja WZĂ“R (formula)

- RĂłwnanie matematyczne w notacji LaTeX
- WyĹ‚ącznie bloki `$$ ... $$` (brak inline)
- ID rĂłwnania z rejestru (np. `EQ_SC3F_004`)
- Odniesienie do normy (bez cytowania treĹ›ci)

```latex
$$
I_k'' = \frac{c \cdot U_n}{\sqrt{3} \cdot |Z_{th}|}
$$
```

#### 2.3.2 Sekcja DANE (input_values)

- Lista wartoĹ›ci wejĹ›ciowych z jednostkami
- Format: `symbol = wartoĹ›ć jednostka`
- ĹąrĂłdĹ‚o kaĹĽdej wartoĹ›ci (`source_key`)

| Symbol | WartoĹ›ć | Jednostka | ĹąrĂłdĹ‚o |
|--------|---------|-----------|--------|
| $c$ | 1.100 | — | `c_factor` |
| $U_n$ | 15.00 | kV | `u_n_kv` |
| $Z_{th}$ | 0.5000 + j2.000 | Î© | `z_thevenin_ohm` |
| $\|Z_{th}\|$ | 2.062 | Î© | (obliczone) |

#### 2.3.3 Sekcja PODSTAWIENIE (substitution)

- WzĂłr z podstawionymi wartoĹ›ciami liczbowymi
- LaTeX blokowy
- Wynik koĹ„cowy

```latex
$$
I_k'' = \frac{1.100 \cdot 15.00}{\sqrt{3} \cdot 2.062} = 4.620\,\text{kA}
$$
```

#### 2.3.4 Sekcja WYNIK (result)

- WartoĹ›ć koĹ„cowa z jednostką
- WyrĂłĹĽniona wizualnie
- Powiązanie z `mapping_key`

$$
\boxed{I_k'' = 4.620\,\text{kA}}
$$

#### 2.3.5 Sekcja WERYFIKACJA JEDNOSTEK (unit_check)

- Status: âś“ PASS / âś— FAIL
- ĹšcieĹĽka derywacji jednostek
- Jednostka oczekiwana vs obliczona

| Pole | WartoĹ›ć |
|------|---------|
| Status | âś“ PASS |
| Oczekiwana | kA |
| Obliczona | kA |
| Derywacja | kV / Î© = kA |

### 2.4 Podsumowanie liczbowe (ProofSummary)

Na koĹ„cu dowodu — tabela wynikĂłw **bez interpretacji normowej**:

$$
\begin{array}{|l|c|c|c|}
\hline
\textbf{WielkoĹ›ć} & \textbf{Symbol} & \textbf{WartoĹ›ć} & \textbf{Jednostka} \\
\hline
\text{Początkowy prąd zwarciowy} & I_k'' & 4.620 & \text{kA} \\
\text{Prąd udarowy (szczytowy)} & i_p & 11.76 & \text{kA} \\
\text{Moc zwarciowa} & S_k'' & 120.0 & \text{MVA} \\
\text{WspĂłĹ‚czynnik udaru} & \kappa & 1.80 & — \\
\text{Prąd cieplny rĂłwnowaĹĽny} & I_{th} & 5.23 & \text{kA} \\
\text{Prąd dynamiczny} & I_{dyn} & 11.76 & \text{kA} \\
\hline
\end{array}
$$

**UWAGA:** Brak granic normowych, brak oceny â€žspeĹ‚nia/nie speĹ‚nia", brak kolorowania.

---

## 3. Layout UI — Proof Inspector (benchmark-style)

### 3.1 Lokalizacja w aplikacji

```
Results (Wyniki)
  â””â”€â”€ [Wybrany Case]
        â””â”€â”€ [Wybrany Run]
              â”śâ”€â”€ Wyniki (tabela) â† Analysis Layer
              â”śâ”€â”€ Ĺšlad obliczeĹ„ (TraceArtifact) â† raw trace
              â””â”€â”€ DowĂłd matematyczny â† PROOF INSPECTOR (TEN DOKUMENT)
```

### 3.2 Layout gĹ‚Ăłwny (two-panel)

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ ĹšLAD OBLICZEĹ (White Box) — [Case Name] / [Run Timestamp]          [Ă—]  â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚ â”‚ SPIS KROKĂ“W       â”‚ â”‚                                             â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  KROK 4: Początkowy prąd zwarciowy          â”‚   â”‚
â”‚ â”‚ 1. Napięcie cÂ·U_n â”‚ â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€  â”‚   â”‚
â”‚ â”‚ 2. Z ĹşrĂłdĹ‚a       â”‚ â”‚                                             â”‚   â”‚
â”‚ â”‚ 3. Z Thevenina    â”‚ â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚   â”‚
â”‚ â”‚â–ş4. I_k''          â”‚ â”‚  â”‚ WZĂ“R                        [EQ_SC3F_004] â”‚   â”‚
â”‚ â”‚ 5. Îş              â”‚ â”‚  â”‚                                     â”‚    â”‚   â”‚
â”‚ â”‚ 6. i_p            â”‚ â”‚  â”‚       c Â· U_n                       â”‚    â”‚   â”‚
â”‚ â”‚ 7. S_k''          â”‚ â”‚  â”‚ I_k'' = â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€               â”‚    â”‚   â”‚
â”‚ â”‚ 8. I_th           â”‚ â”‚  â”‚        âš3 Â· |Z_th|                  â”‚    â”‚   â”‚
â”‚ â”‚ 9. I_dyn          â”‚ â”‚  â”‚                                     â”‚    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”‚ IEC 60909-0:2016 eq. (29)           â”‚    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚                                             â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”‚ DANE                                â”‚    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”‚ c = 1.100 (—)                       â”‚    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”‚ U_n = 15.00 kV                      â”‚    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”‚ Z_th = 0.5000 + j2.000 Î©           â”‚    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”‚ |Z_th| = 2.062 Î©                    â”‚    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚                                             â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”‚ PODSTAWIENIE                        â”‚    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”‚         1.100 Â· 15.00               â”‚    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”‚ I_k'' = â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€  = 4.620 kA â”‚    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”‚         âš3 Â· 2.062                  â”‚    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚                                             â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”‚ WYNIK                               â”‚    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”‚ â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”‚ â”‚   I_k'' = 4.620 kA            â”‚   â”‚    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚                                             â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”‚ WERYFIKACJA JEDNOSTEK          âś“   â”‚    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â”‚ kV / Î© = kA                         â”‚    â”‚   â”‚
â”‚ â”‚                   â”‚ â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚   â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [Eksportuj â–Ľ]  [â—„ Poprzedni]  [Następny â–ş]  [Podsumowanie]              â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

### 3.3 ReguĹ‚y nawigacji (BINDING)

| Element | Akcja | Blokady |
|---------|-------|---------|
| Spis krokĂłw (lewy panel) | Kliknięcie → przejĹ›cie do kroku | Brak sortowania |
| â—„ Poprzedni | Poprzedni krok w sekwencji | Niedostępny na kroku 1 |
| Następny â–ş | Następny krok w sekwencji | Niedostępny na ostatnim |
| Podsumowanie | Widok zbiorczy wynikĂłw | Zawsze dostępny |

### 3.4 SkrĂłty klawiszowe

| SkrĂłt | Akcja |
|-------|-------|
| `â†` / `→` | Poprzedni / następny krok |
| `Home` | Pierwszy krok |
| `End` | Podsumowanie |
| `Esc` | Zamknij Proof Inspector |
| `Ctrl+E` | OtwĂłrz menu eksportu |

---

## 4. Tryb READ-ONLY (BINDING)

### 4.1 Dozwolone akcje

| Akcja | Dozwolona | Uzasadnienie |
|-------|-----------|--------------|
| Przeglądanie krokĂłw | âś“ TAK | Prezentacja |
| Nawigacja między krokami | âś“ TAK | Nawigacja |
| Kopiowanie wartoĹ›ci | âś“ TAK | Audit |
| Eksport do pliku | âś“ TAK | Archiwizacja |
| Drukowanie | âś“ TAK | Dokumentacja |
| Zmiana języka (pl/en) | âś“ TAK | Lokalizacja |

### 4.2 Niedozwolone akcje (ABSOLUTNE)

| Akcja | Dozwolona | Uzasadnienie |
|-------|-----------|--------------|
| Edycja wartoĹ›ci | âś— NIE | DowĂłd jest IMMUTABLE |
| Dodawanie krokĂłw | âś— NIE | Struktura z generatora |
| Usuwanie krokĂłw | âś— NIE | Struktura z generatora |
| Zmiana kolejnoĹ›ci krokĂłw | âś— NIE | Sequence from Equation Registry |
| Ponowne obliczenie | âś— NIE | Wymaga nowego Run |
| Sortowanie listy krokĂłw | âś— NIE | Fixed order |
| Filtrowanie krokĂłw | âś— NIE | Complete proof required |

---

## 5. Eksport dowodu — kontrakty (BINDING)

### 5.1 Formaty eksportu

| Format | Rozszerzenie | Opis | Przeznaczenie |
|--------|--------------|------|---------------|
| **JSON** | `.json` | 1:1 z ProofDocument | Archiwizacja, API |
| **LaTeX** | `.tex` | Kod ĹşrĂłdĹ‚owy LaTeX | Kompilacja, edycja |
| **PDF** | `.pdf` | Dokument PDF (via LaTeX) | Druk, audyt |
| **DOCX** | `.docx` | Microsoft Word | Raportowanie |

### 5.2 Gwarancja determinizmu (BINDING)

$$
\boxed{
\textbf{Eksport jest deterministyczny:} \quad \text{identyczne wejĹ›cie} \Rightarrow \text{identyczny dokument}
}
$$

| Aspekt | Gwarancja |
|--------|-----------|
| KolejnoĹ›ć krokĂłw | Identyczna (z Equation Registry) |
| KolejnoĹ›ć pĂłl JSON | Sortowana alfabetycznie |
| Formatowanie liczb | 4 miejsca znaczące |
| Timestamp w dokumencie | Z ProofDocument, nie z momentu eksportu |
| Hash dokumentu | SHA-256 fingerprint |

### 5.3 Kontrakt JSON

```json
{
  "$schema": "proof-document.json",
  "document_id": "uuid",
  "artifact_id": "uuid",
  "created_at": "ISO8601",
  "proof_type": "SC3F_IEC60909",
  "title_pl": "DowĂłd obliczeĹ„ zwarciowych IEC 60909",
  "header": { /* ProofHeader */ },
  "steps": [ /* ProofStep[] */ ],
  "summary": { /* ProofSummary */ },
  "fingerprint": "sha256:..."
}
```

### 5.4 Kontrakt LaTeX

```latex
\documentclass[a4paper,11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage[polish]{babel}
\usepackage{amsmath,amssymb}
\usepackage{booktabs}

\title{DowĂłd obliczeĹ„ zwarciowych IEC 60909}
\author{MV-DESIGN-PRO v1.2.0}
\date{2026-01-27}

\begin{document}
\maketitle

\section*{NagĹ‚Ăłwek dowodu}
% ... header fields ...

\section*{Kroki dowodu}

\subsection*{Krok 1: Napięcie z wspĂłĹ‚czynnikiem c}
\textbf{RĂłwnanie:} (EQ\_SC3F\_001)
$$
U_{eq} = c \cdot U_n
$$

\textbf{Dane wejĹ›ciowe:}
\begin{itemize}
  \item $c = 1.100$ (—)
  \item $U_n = 15.00\,\text{kV}$
\end{itemize}

\textbf{Podstawienie:}
$$
U_{eq} = 1.100 \cdot 15.00 = 16.50\,\text{kV}
$$

\textbf{Wynik:}
$$
\boxed{U_{eq} = 16.50\,\text{kV}}
$$

\textbf{Weryfikacja jednostek:} $\checkmark$ kV

% ... remaining steps ...

\section*{Podsumowanie}
% ... summary table ...

\end{document}
```

### 5.5 Kontrakt PDF / DOCX

| Element | Wymaganie |
|---------|-----------|
| Format strony | A4, marginesy 2.5 cm |
| Czcionka | Times New Roman 11pt (tekst), LaTeX math |
| Numeracja stron | Dolna, Ĺ›rodkowa |
| Spis treĹ›ci | Automatyczny (dla PDF > 3 strony) |
| NagĹ‚Ăłwek strony | TytuĹ‚ dowodu + data |
| Stopka | Fingerprint + wersja systemu |

### 5.6 API eksportu

```
POST /api/proofs/{document_id}/export
Content-Type: application/json

Request:
{
  "format": "pdf",
  "options": {
    "includeHeader": true,
    "includeSteps": true,
    "includeSummary": true,
    "language": "pl",
    "paperSize": "a4"
  }
}

Response:
{
  "success": true,
  "fileUrl": "/api/exports/abc123.pdf",
  "fingerprint": "sha256:abc123...",
  "generatedAt": "2026-01-27T10:35:00Z"
}
```

---

## 6. UX — zgodnoĹ›ć z benchmark (BINDING)

### 6.1 Zasady interfejsu

| Zasada | Opis |
|--------|------|
| **Brak trybu edycji** | Wszystkie pola read-only |
| **Brak sortowania** | KolejnoĹ›ć krokĂłw ustalona |
| **Two-panel layout** | Lewa lista krokĂłw → prawa treĹ›ć |
| **Polish normative** | Nazewnictwo zgodne z normami PN-EN |
| **White Box label** | Jasne oznaczenie: â€žĹšlad obliczeĹ„ (White Box)" |
| **No interpretation** | Brak kolorowania, brak oceny |

### 6.2 Terminologia polska (BINDING)

| Angielski | Polski (normowy) |
|-----------|------------------|
| Proof Inspector | Przeglądarka dowodu |
| Trace | Ĺšlad obliczeĹ„ |
| Step | Krok |
| Formula | WzĂłr |
| Input | Dane wejĹ›ciowe |
| Substitution | Podstawienie |
| Result | Wynik |
| Unit Check | Weryfikacja jednostek |
| Summary | Podsumowanie |
| Export | Eksportuj |
| Fingerprint | Odcisk (hash) |

### 6.3 ZgodnoĹ›ć z DIgSILENT benchmark

| Aspekt benchmark | MV-DESIGN-PRO Equivalent |
|---------------------|--------------------------|
| Calculation Report | Proof Inspector |
| Result Browser | Results → Proof Inspector |
| Export to Word | Export DOCX |
| Export to PDF | Export PDF |
| White-box trace | TraceArtifact + ProofDocument |

---

## 7. Zakazy absolutne (BINDING)

### 7.1 Zakazy interpretacyjne

$$
\boxed{
\begin{aligned}
&\text{âťŚ Brak interpretacji norm (to NIE Analysis)} \\
&\text{âťŚ Brak kolorowania â€ždobry/zĹ‚y" (pass/fail)} \\
&\text{âťŚ Brak granic normowych w prezentacji} \\
&\text{âťŚ Brak oceny â€žspeĹ‚nia/nie speĹ‚nia"} \\
&\text{âťŚ Brak warningĂłw/errorĂłw na podstawie wartoĹ›ci}
\end{aligned}
}
$$

### 7.2 Zakazy matematyczne

$$
\boxed{
\begin{aligned}
&\text{âťŚ Brak skrĂłtĂłw matematycznych} \\
&\text{âťŚ Brak inline LaTeX (tylko bloki } \$\$...\$\$ \text{)} \\
&\text{âťŚ Brak uproszczonych wzorĂłw} \\
&\text{âťŚ Brak zaokrągleĹ„ poĹ›rednich} \\
&\text{âťŚ Brak pomijania krokĂłw}
\end{aligned}
}
$$

### 7.3 Zakazy systemowe

$$
\boxed{
\begin{aligned}
&\text{âťŚ Brak modyfikacji solverĂłw} \\
&\text{âťŚ Brak modyfikacji Result API} \\
&\text{âťŚ Brak modyfikacji TraceArtifact po utworzeniu} \\
&\text{âťŚ Brak modyfikacji ProofDocument po wygenerowaniu} \\
&\text{âťŚ Brak cache'owania z modyfikacją}
\end{aligned}
}
$$

---

## 8. Komponenty UI (specyfikacja implementacyjna)

### 8.1 ProofInspector (gĹ‚Ăłwny komponent)

```typescript
interface ProofInspectorProps {
  documentId: string;
  onClose: () => void;
}

interface ProofInspectorState {
  document: ProofDocument | null;
  loading: boolean;
  error: string | null;
  currentStepIndex: number;  // 0-based
  viewMode: "step" | "summary";
}
```

### 8.2 ProofHeader (nagĹ‚Ăłwek)

```typescript
interface ProofHeaderViewProps {
  header: ProofHeader;
  proofType: string;
  fingerprint: string;
}
```

### 8.3 StepView (widok kroku)

```typescript
interface StepViewProps {
  step: ProofStep;
  stepNumber: number;
  totalSteps: number;
}

// Renderuje 5 sekcji: WZĂ“R, DANE, PODSTAWIENIE, WYNIK, WERYFIKACJA
```

### 8.4 SummaryView (podsumowanie)

```typescript
interface SummaryViewProps {
  summary: ProofSummary;
  header: ProofHeader;
}
```

### 8.5 ExportMenu (menu eksportu)

```typescript
interface ExportMenuProps {
  documentId: string;
  onExportStart: () => void;
  onExportComplete: (result: ExportResponse) => void;
  onExportError: (error: string) => void;
}

type ExportFormat = "json" | "latex" | "pdf" | "docx";
```

---

## 9. DostępnoĹ›ć (a11y)

### 9.1 Wymagania WCAG AA

| Wymaganie | Implementacja |
|-----------|---------------|
| Nawigacja klawiaturą | PeĹ‚na obsĹ‚uga bez myszy |
| Screen reader | ARIA labels dla wszystkich sekcji |
| Kontrast | Min 4.5:1 (WCAG AA) |
| Focus visible | WyraĹşny fokus na elementach |
| Skip links | PrzejĹ›cie do treĹ›ci gĹ‚Ăłwnej |

### 9.2 ARIA labels

```html
<main role="main" aria-label="Przeglądarka dowodu matematycznego">
  <nav role="navigation" aria-label="Spis krokĂłw dowodu">
    <ol>
      <li aria-current="step">Krok 4: Początkowy prąd zwarciowy</li>
    </ol>
  </nav>

  <article role="article" aria-label="Krok dowodu 4 z 9">
    <section aria-labelledby="formula-heading">
      <h2 id="formula-heading">WzĂłr</h2>
      <math aria-label="I k prim prim rĂłwna się c razy U n dzielone przez pierwiastek z 3 razy moduĹ‚ Z th">
        <!-- MathML or LaTeX -->
      </math>
    </section>

    <section aria-labelledby="data-heading">
      <h2 id="data-heading">Dane wejĹ›ciowe</h2>
      <!-- ... -->
    </section>

    <!-- ... remaining sections ... -->
  </article>
</main>
```

---

## 10. Testy determinizmu (BINDING)

### 10.1 Test identycznoĹ›ci eksportu

```python
def test_export_determinism():
    """
    Ten sam ProofDocument → identyczny eksport.
    """
    document = create_test_proof_document()

    export_1 = export_to_json(document)
    export_2 = export_to_json(document)

    assert export_1 == export_2
    assert sha256(export_1) == sha256(export_2)
```

### 10.2 Test kolejnoĹ›ci krokĂłw

```python
def test_step_order_immutable():
    """
    KolejnoĹ›ć krokĂłw jest ustalona i nie moĹĽe być zmieniona.
    """
    document = create_test_proof_document()

    step_ids_1 = [s.step_id for s in document.steps]
    step_ids_2 = [s.step_id for s in document.steps]

    assert step_ids_1 == step_ids_2
    assert step_ids_1 == SC3F_CANONICAL_STEP_ORDER
```

### 10.3 Test fingerprint

```python
def test_fingerprint_stable():
    """
    Fingerprint jest stabilny dla tego samego dokumentu.
    """
    document = create_test_proof_document()

    fp_1 = compute_fingerprint(document)
    fp_2 = compute_fingerprint(document)

    assert fp_1 == fp_2
```

---

## 11. Definition of Done (DoD)

### 11.1 P11.1d — DoD

| Kryterium | Status |
|-----------|--------|
| Model mentalny (read-only, presentation-only) | SPEC âś“ |
| Relacja Solver → ProofDocument → Inspector | SPEC âś“ |
| Struktura kroku (5 sekcji mandatory) | SPEC âś“ |
| Layout UI (two-panel, PF-style) | SPEC âś“ |
| Nawigacja (sekwencyjna, bez sortowania) | SPEC âś“ |
| Tryb read-only (dozwolone/niedozwolone akcje) | SPEC âś“ |
| Kontrakty eksportu (JSON/LaTeX/PDF/DOCX) | SPEC âś“ |
| Gwarancja determinizmu | SPEC âś“ |
| Zakazy absolutne (interpretacja, inline, modyfikacja) | SPEC âś“ |
| ZgodnoĹ›ć z benchmark | SPEC âś“ |
| DostępnoĹ›ć (WCAG AA) | SPEC âś“ |
| Testy determinizmu | SPEC âś“ |

---

## TODO — Proof Packs P14–P19 (FUTURE PACKS)

### TODO-P14-001 (PLANNED) — P14: Power Flow Proof Pack (audit wynikĂłw PF) [FUTURE PACK]
- Priority: MUST
- Inputs: TraceArtifact, PowerFlowResult
- Output: ProofPack P14 (ProofDocument: Audit rozpĹ‚ywu mocy)
- DoD:
  - [ ] DowĂłd bilansu węzĹ‚a dla mocy czynnej i biernej z mapowaniem do TraceArtifact.

    $$
    \sum P = 0,\quad \sum Q = 0
    $$

  - [ ] Bilans gaĹ‚ęzi dla mocy czynnej i biernej uwzględnia straty oraz spadek napięcia.

    $$
    P_{in} \rightarrow P_{out} + P_{loss},\quad Q_{in} \rightarrow Q_{out} + \Delta U
    $$

  - [ ] Straty linii liczone jawnie z prądu i rezystancji.

    $$
    P_{loss} = I^{2} \cdot R
    $$

  - [ ] PorĂłwnanie counterfactual Case A vs Case B z raportem rĂłĹĽnic.

    $$
    \Delta P,\ \Delta Q,\ \Delta U
    $$

### TODO-P15-001 (PLANNED) — P15: Load Currents & Overload Proof Pack [FUTURE PACK]
- Priority: MUST
- Inputs: TraceArtifact, PowerFlowResult, Catalog
- Output: ProofPack P15 (ProofDocument: Prądy robocze i przeciąĹĽenia)
- DoD:
  - [ ] Prądy obciąĹĽenia linii/kabli wyprowadzone z mocy pozornej.

    $$
    I = \frac{S}{\sqrt{3} \cdot U}
    $$

  - [ ] PorĂłwnanie do prądu znamionowego z marginesem procentowym i statusem PASS/FAIL.
  - [ ] Transformator: relacja obciąĹĽenia do mocy znamionowej i overload %.

    $$
    \frac{S}{S_n}
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

  - [ ] Energia strat z profilu obciąĹĽenia (integracja w czasie).

    $$
    E_{loss} = \int P_{loss} \, dt
    $$

### TODO-P19-001 (PLANNED) — P19: Earthing / Ground Fault Proof Pack (SN) [FUTURE PACK]
- Priority: MUST
- Inputs: TraceArtifact, Catalog
- Output: ProofPack P19 (ProofDocument: Doziemienia / uziemienia SN)
- DoD:
  - [ ] JeĹ›li SN: prądy doziemne z uwzględnieniem impedancji uziemienia i rozdziaĹ‚u prądu.
  - [ ] Tryb uproszczonych napięć dotykowych z wyraĹşnymi zastrzeĹĽeniami.
  - [ ] Terminologia w ProofDocument: 1F-Z, 2F, 2F-Z oraz BoundaryNode – węzeĹ‚ przyĹ‚ączenia.

**END OF P11.1d CANONICAL**

