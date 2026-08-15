# P11.1d — Proof Inspector (Kanoniczny)

**STATUS: CANONICAL & BINDING**
**Version:** 2.0
**Reference:** P11_OVERVIEW.md, PROOF_SCHEMAS.md, SYSTEM_SPEC.md § 19

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
&\quad \bullet \text{ Narzędzie audytu (ślad obliczeń — White Box)} \\[8pt]
&\text{NIE JEST:} \\
&\quad \bullet \text{ Solverem (brak fizyki)} \\
&\quad \bullet \text{ Analysis (brak interpretacji normowej)} \\
&\quad \bullet \text{ Edytorem (dowód jest IMMUTABLE)}
\end{aligned}
}
$$

### 0.3 Wejścia i wyjścia (BINDING)

| Kierunek | Źródło / Cel | Opis |
|----------|--------------|------|
| **Wejście** | `ProofDocument` | Dokument dowodowy z generatora (JSON) |
| **Wejście** | `TraceArtifact` | Kontekst uruchomienia (run_id, case_id, snapshot_id) |
| **Wyjście** | Wyświetlenie UI | Proof Inspector w przeglądarce |
| **Wyjście** | `proof.json` | Eksport 1:1 z ProofDocument |
| **Wyjście** | `proof.tex` | Eksport LaTeX (blokowy, $$ only) |
| **Wyjście** | `proof.pdf` | Dokument PDF (via LaTeX) |
| **Wyjście** | `proof.docx` | Dokument Microsoft Word |

---

## 1. Model mentalny (BINDING)

### 1.1 Relacja przepływu danych

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. SOLVER EXECUTION                                                      │
│    Input: NetworkSnapshot + SolverConfig                                 │
│    Output: SolverResult + WhiteBoxTrace                                  │
│    (FROZEN — Proof Inspector NIE modyfikuje)                            │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ (READ-ONLY)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. PROOF ENGINE (P11)                                                    │
│    - Tworzy TraceArtifact (immutable)                                   │
│    - Generuje ProofDocument (kroki + weryfikacja jednostek)             │
│    - Mapuje wartości z trace → symbole matematyczne                     │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ (READ-ONLY)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. PROOF INSPECTOR (P11.1d) — TEN DOKUMENT                              │
│    - Prezentuje ProofDocument użytkownikowi                             │
│    - Eksportuje do formatów (JSON/LaTeX/PDF/DOCX)                       │
│    - ZERO LOGIKI OBLICZENIOWEJ                                          │
│    - ZERO INTERPRETACJI NORMOWEJ                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Czym Proof Inspector NIE JEST (BINDING)

| NIE jest | Uzasadnienie | Gdzie ta funkcja? |
|----------|--------------|-------------------|
| Solverem | Nie wykonuje obliczeń fizycznych | Solver Layer |
| Analysis | Nie interpretuje wyników (brak limitów, brak oceny) | Analysis Layer |
| Edytorem | Dowód jest IMMUTABLE po wygenerowaniu | — |
| Walidatorem | Nie sprawdza zgodności z normami | Analysis Layer |
| Kalkulatorem | Nie przelicza wartości | Solver Layer |
| Formatowaczem danych | Nie modyfikuje struktury ProofDocument | — |

### 1.3 Zasada „Zero Intelligence"

$$
\boxed{
\textbf{Proof Inspector wyświetla dokładnie to, co otrzymał z ProofDocument.}
}
$$

- Brak dodatkowych obliczeń
- Brak decyzji logicznych (if/else na podstawie wartości)
- Brak kolorowania „dobry/zły"
- Brak interpretacji normowej
- Brak modyfikacji wartości

---

## 2. Struktura widoku dowodu (BINDING)

### 2.1 Nagłówek dowodu (ProofHeader)

Każdy dowód MUSI zawierać nagłówek z pełnymi metadanymi:

$$
\begin{array}{|l|l|l|}
\hline
\textbf{Pole} & \textbf{Źródło} & \textbf{Przykład} \\
\hline
\text{Typ analizy} & \texttt{proof\_type} & \text{Zwarcie trójfazowe IEC 60909} \\
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

### 2.2 Lista kroków (ProofStep) — sekwencja

Kolejność kroków jest **ustalona przez Equation Registry** i **nie może być zmieniana** przez UI.

```
┌─────────────────────────────────────────────────────────────────┐
│ SPIS KROKÓW (read-only, navigation)                             │
├─────────────────────────────────────────────────────────────────┤
│ 1. Napięcie z współczynnikiem c                                 │
│ 2. Impedancja źródła                                            │
│ 3. Impedancja zastępcza Thevenina                               │
│ ► 4. Początkowy prąd zwarciowy I_k''                           │
│ 5. Współczynnik udaru κ                                         │
│ 6. Prąd udarowy i_p                                             │
│ 7. Moc zwarciowa S_k''                                          │
│ 8. Prąd cieplny równoważny I_th                                 │
│ 9. Prąd dynamiczny I_dyn                                        │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Struktura pojedynczego kroku (5 sekcji — MANDATORY)

Każdy krok dowodu MUSI zawierać dokładnie **5 sekcji** w tej kolejności:

$$
\boxed{
\textbf{KROK } n: \quad \underbrace{\text{WZÓR}}_{\text{1}} \to \underbrace{\text{DANE}}_{\text{2}} \to \underbrace{\text{PODSTAWIENIE}}_{\text{3}} \to \underbrace{\text{WYNIK}}_{\text{4}} \to \underbrace{\text{WERYFIKACJA JEDNOSTEK}}_{\text{5}}
}
$$

#### 2.3.1 Sekcja WZÓR (formula)

- Równanie matematyczne w notacji LaTeX
- Wyłącznie bloki `$$ ... $$` (brak inline)
- ID równania z rejestru (np. `EQ_SC3F_004`)
- Odniesienie do normy (bez cytowania treści)

```latex
$$
I_k'' = \frac{c \cdot U_n}{\sqrt{3} \cdot |Z_{th}|}
$$
```

#### 2.3.2 Sekcja DANE (input_values)

- Lista wartości wejściowych z jednostkami
- Format: `symbol = wartość jednostka`
- Źródło każdej wartości (`source_key`)

| Symbol | Wartość | Jednostka | Źródło |
|--------|---------|-----------|--------|
| $c$ | 1.100 | — | `c_factor` |
| $U_n$ | 15.00 | kV | `u_n_kv` |
| $Z_{th}$ | 0.5000 + j2.000 | Ω | `z_thevenin_ohm` |
| $\|Z_{th}\|$ | 2.062 | Ω | (obliczone) |

#### 2.3.3 Sekcja PODSTAWIENIE (substitution)

- Wzór z podstawionymi wartościami liczbowymi
- LaTeX blokowy
- Wynik końcowy

```latex
$$
I_k'' = \frac{1.100 \cdot 15.00}{\sqrt{3} \cdot 2.062} = 4.620\,\text{kA}
$$
```

#### 2.3.4 Sekcja WYNIK (result)

- Wartość końcowa z jednostką
- Wyróżniona wizualnie
- Powiązanie z `mapping_key`

$$
\boxed{I_k'' = 4.620\,\text{kA}}
$$

#### 2.3.5 Sekcja WERYFIKACJA JEDNOSTEK (unit_check)

- Status: ✓ PASS / ✗ FAIL
- Ścieżka derywacji jednostek
- Jednostka oczekiwana vs obliczona

| Pole | Wartość |
|------|---------|
| Status | ✓ PASS |
| Oczekiwana | kA |
| Obliczona | kA |
| Derywacja | kV / Ω = kA |

### 2.4 Podsumowanie liczbowe (ProofSummary)

Na końcu dowodu — tabela wyników **bez interpretacji normowej**:

$$
\begin{array}{|l|c|c|c|}
\hline
\textbf{Wielkość} & \textbf{Symbol} & \textbf{Wartość} & \textbf{Jednostka} \\
\hline
\text{Początkowy prąd zwarciowy} & I_k'' & 4.620 & \text{kA} \\
\text{Prąd udarowy (szczytowy)} & i_p & 11.76 & \text{kA} \\
\text{Moc zwarciowa} & S_k'' & 120.0 & \text{MVA} \\
\text{Współczynnik udaru} & \kappa & 1.80 & — \\
\text{Prąd cieplny równoważny} & I_{th} & 5.23 & \text{kA} \\
\text{Prąd dynamiczny} & I_{dyn} & 11.76 & \text{kA} \\
\hline
\end{array}
$$

**UWAGA:** Brak granic normowych, brak oceny „spełnia/nie spełnia", brak kolorowania.

---

## 3. Layout UI — Proof Inspector (benchmark-style)

### 3.1 Lokalizacja w aplikacji

```
Results (Wyniki)
  └── [Wybrany Case]
        └── [Wybrany Run]
              ├── Wyniki (tabela) ← Analysis Layer
              ├── Ślad obliczeń (TraceArtifact) ← raw trace
              └── Dowód matematyczny ← PROOF INSPECTOR (TEN DOKUMENT)
```

### 3.2 Layout główny (two-panel)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ŚLAD OBLICZEŃ (White Box) — [Case Name] / [Run Timestamp]          [×]  │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌───────────────────┐ ┌─────────────────────────────────────────────┐   │
│ │ SPIS KROKÓW       │ │                                             │   │
│ │                   │ │  KROK 4: Początkowy prąd zwarciowy          │   │
│ │ 1. Napięcie c·U_n │ │  ─────────────────────────────────────────  │   │
│ │ 2. Z źródła       │ │                                             │   │
│ │ 3. Z Thevenina    │ │  ┌─────────────────────────────────────┐    │   │
│ │►4. I_k''          │ │  │ WZÓR                        [EQ_SC3F_004] │   │
│ │ 5. κ              │ │  │                                     │    │   │
│ │ 6. i_p            │ │  │       c · U_n                       │    │   │
│ │ 7. S_k''          │ │  │ I_k'' = ─────────────               │    │   │
│ │ 8. I_th           │ │  │        √3 · |Z_th|                  │    │   │
│ │ 9. I_dyn          │ │  │                                     │    │   │
│ │                   │ │  │ IEC 60909-0:2016 eq. (29)           │    │   │
│ │                   │ │  └─────────────────────────────────────┘    │   │
│ │                   │ │                                             │   │
│ │                   │ │  ┌─────────────────────────────────────┐    │   │
│ │                   │ │  │ DANE                                │    │   │
│ │                   │ │  │ c = 1.100 (—)                       │    │   │
│ │                   │ │  │ U_n = 15.00 kV                      │    │   │
│ │                   │ │  │ Z_th = 0.5000 + j2.000 Ω           │    │   │
│ │                   │ │  │ |Z_th| = 2.062 Ω                    │    │   │
│ │                   │ │  └─────────────────────────────────────┘    │   │
│ │                   │ │                                             │   │
│ │                   │ │  ┌─────────────────────────────────────┐    │   │
│ │                   │ │  │ PODSTAWIENIE                        │    │   │
│ │                   │ │  │         1.100 · 15.00               │    │   │
│ │                   │ │  │ I_k'' = ───────────────  = 4.620 kA │    │   │
│ │                   │ │  │         √3 · 2.062                  │    │   │
│ │                   │ │  └─────────────────────────────────────┘    │   │
│ │                   │ │                                             │   │
│ │                   │ │  ┌─────────────────────────────────────┐    │   │
│ │                   │ │  │ WYNIK                               │    │   │
│ │                   │ │  │ ┌───────────────────────────────┐   │    │   │
│ │                   │ │  │ │   I_k'' = 4.620 kA            │   │    │   │
│ │                   │ │  │ └───────────────────────────────┘   │    │   │
│ │                   │ │  └─────────────────────────────────────┘    │   │
│ │                   │ │                                             │   │
│ │                   │ │  ┌─────────────────────────────────────┐    │   │
│ │                   │ │  │ WERYFIKACJA JEDNOSTEK          ✓   │    │   │
│ │                   │ │  │ kV / Ω = kA                         │    │   │
│ │                   │ │  └─────────────────────────────────────┘    │   │
│ └───────────────────┘ └─────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────┤
│ [Eksportuj ▼]  [◄ Poprzedni]  [Następny ►]  [Podsumowanie]              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Reguły nawigacji (BINDING)

| Element | Akcja | Blokady |
|---------|-------|---------|
| Spis kroków (lewy panel) | Kliknięcie → przejście do kroku | Brak sortowania |
| ◄ Poprzedni | Poprzedni krok w sekwencji | Niedostępny na kroku 1 |
| Następny ► | Następny krok w sekwencji | Niedostępny na ostatnim |
| Podsumowanie | Widok zbiorczy wyników | Zawsze dostępny |

### 3.4 Skróty klawiszowe

| Skrót | Akcja |
|-------|-------|
| `←` / `→` | Poprzedni / następny krok |
| `Home` | Pierwszy krok |
| `End` | Podsumowanie |
| `Esc` | Zamknij Proof Inspector |
| `Ctrl+E` | Otwórz menu eksportu |

---

## 4. Tryb READ-ONLY (BINDING)

### 4.1 Dozwolone akcje

| Akcja | Dozwolona | Uzasadnienie |
|-------|-----------|--------------|
| Przeglądanie kroków | ✓ TAK | Prezentacja |
| Nawigacja między krokami | ✓ TAK | Nawigacja |
| Kopiowanie wartości | ✓ TAK | Audit |
| Eksport do pliku | ✓ TAK | Archiwizacja |
| Drukowanie | ✓ TAK | Dokumentacja |
| Zmiana języka (pl/en) | ✓ TAK | Lokalizacja |

### 4.2 Niedozwolone akcje (ABSOLUTNE)

| Akcja | Dozwolona | Uzasadnienie |
|-------|-----------|--------------|
| Edycja wartości | ✗ NIE | Dowód jest IMMUTABLE |
| Dodawanie kroków | ✗ NIE | Struktura z generatora |
| Usuwanie kroków | ✗ NIE | Struktura z generatora |
| Zmiana kolejności kroków | ✗ NIE | Sequence from Equation Registry |
| Ponowne obliczenie | ✗ NIE | Wymaga nowego Run |
| Sortowanie listy kroków | ✗ NIE | Fixed order |
| Filtrowanie kroków | ✗ NIE | Complete proof required |

---

## 5. Eksport dowodu — kontrakty (BINDING)

### 5.1 Formaty eksportu

| Format | Rozszerzenie | Opis | Przeznaczenie |
|--------|--------------|------|---------------|
| **JSON** | `.json` | 1:1 z ProofDocument | Archiwizacja, API |
| **LaTeX** | `.tex` | Kod źródłowy LaTeX | Kompilacja, edycja |
| **PDF** | `.pdf` | Dokument PDF (via LaTeX) | Druk, audyt |
| **DOCX** | `.docx` | Microsoft Word | Raportowanie |

### 5.2 Gwarancja determinizmu (BINDING)

$$
\boxed{
\textbf{Eksport jest deterministyczny:} \quad \text{identyczne wejście} \Rightarrow \text{identyczny dokument}
}
$$

| Aspekt | Gwarancja |
|--------|-----------|
| Kolejność kroków | Identyczna (z Equation Registry) |
| Kolejność pól JSON | Sortowana alfabetycznie |
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
  "title_pl": "Dowód obliczeń zwarciowych IEC 60909",
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

\title{Dowód obliczeń zwarciowych IEC 60909}
\author{MV-DESIGN-PRO v1.2.0}
\date{2026-01-27}

\begin{document}
\maketitle

\section*{Nagłówek dowodu}
% ... header fields ...

\section*{Kroki dowodu}

\subsection*{Krok 1: Napięcie z współczynnikiem c}
\textbf{Równanie:} (EQ\_SC3F\_001)
$$
U_{eq} = c \cdot U_n
$$

\textbf{Dane wejściowe:}
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
| Numeracja stron | Dolna, środkowa |
| Spis treści | Automatyczny (dla PDF > 3 strony) |
| Nagłówek strony | Tytuł dowodu + data |
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

## 6. UX — zgodność z benchmark (BINDING)

### 6.1 Zasady interfejsu

| Zasada | Opis |
|--------|------|
| **Brak trybu edycji** | Wszystkie pola read-only |
| **Brak sortowania** | Kolejność kroków ustalona |
| **Two-panel layout** | Lewa lista kroków → prawa treść |
| **Polish normative** | Nazewnictwo zgodne z normami PN-EN |
| **White Box label** | Jasne oznaczenie: „Ślad obliczeń (White Box)" |
| **No interpretation** | Brak kolorowania, brak oceny |

### 6.2 Terminologia polska (BINDING)

| Angielski | Polski (normowy) |
|-----------|------------------|
| Proof Inspector | Przeglądarka dowodu |
| Trace | Ślad obliczeń |
| Step | Krok |
| Formula | Wzór |
| Input | Dane wejściowe |
| Substitution | Podstawienie |
| Result | Wynik |
| Unit Check | Weryfikacja jednostek |
| Summary | Podsumowanie |
| Export | Eksportuj |
| Fingerprint | Odcisk (hash) |

### 6.3 Zgodność z DIgSILENT benchmark

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
&\text{❌ Brak interpretacji norm (to NIE Analysis)} \\
&\text{❌ Brak kolorowania „dobry/zły" (pass/fail)} \\
&\text{❌ Brak granic normowych w prezentacji} \\
&\text{❌ Brak oceny „spełnia/nie spełnia"} \\
&\text{❌ Brak warningów/errorów na podstawie wartości}
\end{aligned}
}
$$

### 7.2 Zakazy matematyczne

$$
\boxed{
\begin{aligned}
&\text{❌ Brak skrótów matematycznych} \\
&\text{❌ Brak inline LaTeX (tylko bloki } \$\$...\$\$ \text{)} \\
&\text{❌ Brak uproszczonych wzorów} \\
&\text{❌ Brak zaokrągleń pośrednich} \\
&\text{❌ Brak pomijania kroków}
\end{aligned}
}
$$

### 7.3 Zakazy systemowe

$$
\boxed{
\begin{aligned}
&\text{❌ Brak modyfikacji solverów} \\
&\text{❌ Brak modyfikacji Result API} \\
&\text{❌ Brak modyfikacji TraceArtifact po utworzeniu} \\
&\text{❌ Brak modyfikacji ProofDocument po wygenerowaniu} \\
&\text{❌ Brak cache'owania z modyfikacją}
\end{aligned}
}
$$

---

## 8. Komponenty UI (specyfikacja implementacyjna)

### 8.1 ProofInspector (główny komponent)

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

### 8.2 ProofHeader (nagłówek)

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

// Renderuje 5 sekcji: WZÓR, DANE, PODSTAWIENIE, WYNIK, WERYFIKACJA
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

## 9. Dostępność (a11y)

### 9.1 Wymagania WCAG AA

| Wymaganie | Implementacja |
|-----------|---------------|
| Nawigacja klawiaturą | Pełna obsługa bez myszy |
| Screen reader | ARIA labels dla wszystkich sekcji |
| Kontrast | Min 4.5:1 (WCAG AA) |
| Focus visible | Wyraźny fokus na elementach |
| Skip links | Przejście do treści głównej |

### 9.2 ARIA labels

```html
<main role="main" aria-label="Przeglądarka dowodu matematycznego">
  <nav role="navigation" aria-label="Spis kroków dowodu">
    <ol>
      <li aria-current="step">Krok 4: Początkowy prąd zwarciowy</li>
    </ol>
  </nav>

  <article role="article" aria-label="Krok dowodu 4 z 9">
    <section aria-labelledby="formula-heading">
      <h2 id="formula-heading">Wzór</h2>
      <math aria-label="I k prim prim równa się c razy U n dzielone przez pierwiastek z 3 razy moduł Z th">
        <!-- MathML or LaTeX -->
      </math>
    </section>

    <section aria-labelledby="data-heading">
      <h2 id="data-heading">Dane wejściowe</h2>
      <!-- ... -->
    </section>

    <!-- ... remaining sections ... -->
  </article>
</main>
```

---

## 10. Testy determinizmu (BINDING)

### 10.1 Test identyczności eksportu

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

### 10.2 Test kolejności kroków

```python
def test_step_order_immutable():
    """
    Kolejność kroków jest ustalona i nie może być zmieniona.
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
| Model mentalny (read-only, presentation-only) | SPEC ✓ |
| Relacja Solver → ProofDocument → Inspector | SPEC ✓ |
| Struktura kroku (5 sekcji mandatory) | SPEC ✓ |
| Layout UI (two-panel, PF-style) | SPEC ✓ |
| Nawigacja (sekwencyjna, bez sortowania) | SPEC ✓ |
| Tryb read-only (dozwolone/niedozwolone akcje) | SPEC ✓ |
| Kontrakty eksportu (JSON/LaTeX/PDF/DOCX) | SPEC ✓ |
| Gwarancja determinizmu | SPEC ✓ |
| Zakazy absolutne (interpretacja, inline, modyfikacja) | SPEC ✓ |
| Zgodność z benchmark | SPEC ✓ |
| Dostępność (WCAG AA) | SPEC ✓ |
| Testy determinizmu | SPEC ✓ |

---

## TODO — Proof Packs P14–P19 (FUTURE PACKS)

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

### TODO-P15-001 (PLANNED) — P15: Load Currents & Overload Proof Pack [FUTURE PACK]
- Priority: MUST
- Inputs: TraceArtifact, PowerFlowResult, Catalog
- Output: ProofPack P15 (ProofDocument: Prądy robocze i przeciążenia)
- DoD:
  - [ ] Prądy obciążenia linii/kabli wyprowadzone z mocy pozornej.

    $$
    I = \frac{S}{\sqrt{3} \cdot U}
    $$

  - [ ] Porównanie do prądu znamionowego z marginesem procentowym i statusem PASS/FAIL.
  - [ ] Transformator: relacja obciążenia do mocy znamionowej i overload %.

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

  - [ ] Energia strat z profilu obciążenia (integracja w czasie).

    $$
    E_{loss} = \int P_{loss} \, dt
    $$

### TODO-P19-001 (PLANNED) — P19: Earthing / Ground Fault Proof Pack (SN) [FUTURE PACK]
- Priority: MUST
- Inputs: TraceArtifact, Catalog
- Output: ProofPack P19 (ProofDocument: Doziemienia / uziemienia SN)
- DoD:
  - [ ] Jeśli SN: prądy doziemne z uwzględnieniem impedancji uziemienia i rozdziału prądu.
  - [ ] Tryb uproszczonych napięć dotykowych z wyraźnymi zastrzeżeniami.
  - [ ] Terminologia w ProofDocument: 1F-Z, 2F, 2F-Z oraz BoundaryNode – węzeł przyłączenia.

**END OF P11.1d CANONICAL**

