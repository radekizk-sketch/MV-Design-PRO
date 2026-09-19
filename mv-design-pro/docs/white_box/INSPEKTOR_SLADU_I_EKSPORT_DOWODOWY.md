# Inspektor sladu obliczen i eksport dowodowy

| Pole           | Wartosc                                      |
|----------------|----------------------------------------------|
| **Status**     | BINDING                                      |
| **Wersja**     | 1.0                                          |
| **Data**       | 2026-02-17                                   |
| **Wlasciciel** | MV-Design-PRO — warstwa White Box            |
| **Dokument**   | INSPEKTOR_SLADU_I_EKSPORT_DOWODOWY.md        |

---

## 1. Zasada White Box

**Wszystkie obliczenia solwerow musza udostepniac wartosci posrednie.**

Zasada White Box jest fundamentalna dla MV-Design-PRO i oznacza:

- Kazdy krok obliczeniowy jest mozliwy do przeSledzenia.
- Wszystkie wartosci posrednie (macierz admitancji Y-bus, impedancja Thevenina Zth, macierz Jacobiego) sa dostepne.
- Kazdy wynik mozna zweryfikowac numerycznie.
- Wszystkie zalozenia sa udokumentowane.

**Zakazane:**

- Solwery typu "czarna skrzynka" (black box).
- Ukryte korekty (hidden corrections).
- Nieudokumentowane uproszczenia.

---

## 2. Inspektor sladu obliczen — interfejs uzytkownika

### 2.1. Przeplyw pracy

```
Wybierz typ analizy          Wybierz element/szyne         Wyswietl slad obliczen
(zwarciowa / przeplywowa)  ->  (lista elementow)         ->  (krok po kroku)
```

### 2.2. Uklad trzypanelowy

```
┌─────────────────┬──────────────────────────────┬─────────────────┐
│                 │                              │                 │
│  SPIS TRESCI    │     TRESC OBLICZEN           │   METADANE      │
│                 │                              │                 │
│  1. Dane wej.   │  Krok 1: Impedancja...       │  run_id: abc123 │
│  2. Impedancja  │                              │  data: 2026-... │
│  3. Macierz Y   │  $$Z_{th} = R + jX$$        │  solwer: v2.1   │
│  4. Zth         │                              │  snapshot: def.. │
│  5. Prady       │  Dane wejsciowe:             │                 │
│  6. Moc zwarc.  │  R = 0.15 Ohm               │  Jednostki:     │
│  7. Ip, Ith     │  X = 0.45 Ohm               │  [Ohm], [kA]    │
│     ...         │                              │  [MVA], [p.u.]  │
│                 │  Podstawienie:                │                 │
│                 │  $$Z_{th} = 0.15 + j0.45$$   │  Uwagi:         │
│                 │                              │  IEC 60909 4.2  │
│                 │  Wynik:                       │                 │
│                 │  $$|Z_{th}| = 0.474 \Omega$$ │                 │
│                 │                              │                 │
└─────────────────┴──────────────────────────────┴─────────────────┘
```

### 2.3. Panele

| Panel              | Zawartosc                                                        |
|--------------------|------------------------------------------------------------------|
| Spis tresci (lewy) | Drzewo sekcji obliczeniowych, klikalne nawigacja                 |
| Tresc (srodkowy)   | Pelny slad obliczen: wzory, dane, podstawienia, wyniki           |
| Metadane (prawy)   | Identyfikatory, wersje, jednostki, odniesienia normatywne        |

### 2.4. Struktura kroku obliczeniowego

Kazdy krok obliczeniowy w inspektorze zawiera:

| Element          | Opis                                                            | Format          |
|------------------|-----------------------------------------------------------------|-----------------|
| Wzor (formula)   | Wzor matematyczny w postaci LaTeX                               | `$$...$$`       |
| Dane wejsciowe   | Wartosci liczbowe uzyte w obliczeniu                            | Tabela          |
| Podstawienie      | Wzor z podstawionymi wartosciami                                | `$$...$$`       |
| Wynik             | Wartosc wynikowa z jednostka                                    | Wartosc + jedn. |
| Weryfikacja jedn. | Sprawdzenie zgodnosci jednostek                                | Analiza wymiar. |
| Uwagi             | Odniesienie normatywne, zalozenia                               | Tekst           |

### 2.5. Deterministyczna kolejnosc sekcji

Kolejnosc sekcji w inspektorze jest **deterministyczna** i zalezy od typu analizy:

**Analiza zwarciowa (IEC 60909):**

1. Dane wejsciowe (parametry sieci, stan lacznikow, wspolczynnik c)
2. Schemat zastepczy (impedancje elementow)
3. Macierz admitancji Y-bus
4. Impedancja zasteprcza Thevenina Zth
5. Poczatkowy prad zwarciowy I''k
6. Prad udarowy ip (I_dyn)
7. Prad zwarciowy ustalony Ik
8. Prad cieplny Ith (I_th)
9. Moc zwarciowa Sk''
10. Podsumowanie wynikow

**Analiza przeplywowa (Newton-Raphson):**

1. Dane wejsciowe (obciazenia, generacja, parametry sieci)
2. Macierz admitancji Y-bus
3. Wektor startowy (napiecia poczatkowe)
4. Iteracje Newton-Raphson (macierz Jacobiego, wektor reszt, poprawki)
5. Zbiезnosc (kryterium, liczba iteracji)
6. Napiecia wezlowe (modul i kat)
7. Prady galezi
8. Straty mocy
9. Podsumowanie wynikow

---

## 3. Struktura TraceArtifactV2

**KOREKTA 2026-09-10 (karta TRACE-V2):** klasa `TraceArtifactV2` i pakiet
`domain/trace_v2/**` skasowane (klaster "ślad v2" bez konsumenta produkcyjnego,
pomiar architekta — grep całego repo). Schemat poniżej jest zapisem
historycznym projektu, nie żywym kontraktem. Rzeczywisty kontrakt eksportu
śladu to `api/analysis_run_exports.py::build_analysis_run_trace_export_payload`
(JSON/JSONL) — patrz sekcja 4.1.

### 3.1. Schemat danych

```
TraceArtifactV2 {
    artifact_id:      UUID
    analysis_type:    enum [SC3F, SC1F, SC2F, POWER_FLOW]
    element_ref:      ElementReference {
        element_id:   UUID
        element_type: enum [BUS, BRANCH, SOURCE, LOAD, SWITCH]
        label:        string
    }
    study_case_id:    UUID
    run_id:           string (deterministyczny)
    snapshot_hash:    string (SHA-256)
    solver_version:   string
    math_spec_version: string

    steps: [
        TraceStep {
            step_id:        string
            section:        string
            order:          int
            formula_latex:  string
            inputs:         Map<string, InputValue> {
                symbol:     string
                value:      float | complex
                unit:       string
                source:     string (skad pochodzi wartosc)
            }
            substitution:   string (LaTeX z podstawionymi wartosciami)
            result: {
                symbol:     string
                value:      float | complex
                unit:       string
            }
            units_check: {
                expected:   string
                actual:     string
                valid:      bool
            }
            notes:          string[]
            norm_reference: string (np. "IEC 60909 4.2.1")
        }
    ]

    run_hash:           string  SHA-256(snapshot_hash + input + math_spec)
    trace_signature:    string  SHA-256(canonical JSON of trace)
    created_at:         datetime
}
```

### 3.2. Typy analizy

| Typ            | Opis                                      | Sekcje sladu                              |
|----------------|-------------------------------------------|-------------------------------------------|
| `SC3F`         | Zwarcie trojfazowe symetryczne            | Zth, I''k, ip, Ik, Ith, Sk''             |
| `SC1F`         | Zwarcie jednofazowe                       | Z0, Z1, Z2, I''k1, Ith1                  |
| `SC2F`         | Zwarcie dwufazowe                         | Z1, Z2, I''k2, Ith2                      |
| `POWER_FLOW`   | Obliczenia przeplywowe Newton-Raphson     | Y-bus, iteracje, napiecia, prady, straty  |

### 3.3. Identyfikatory artefaktow

Identyfikator artefaktu jest **deterministyczny**:

$$
\text{artifact\_id} = f(\text{snapshot\_hash}, \text{study\_case\_id}, \text{run\_id}, \text{analysis\_id})
$$

**Gwarancja reprodukowalnosci**: identyczne dane wejsciowe generuja identyczny artefakt.

### 3.4. Skroty kryptograficzne

| Skrot              | Dane wejsciowe                                         | Cel                                      |
|--------------------|--------------------------------------------------------|------------------------------------------|
| `run_hash`         | snapshot_hash + konfiguracja wejsciowa + math_spec     | Identyfikacja uruchomienia               |
| `trace_signature`  | Kanoniczny JSON calego sladu                           | Weryfikacja integralnosci sladu          |
| `snapshot_hash`    | Caly model sieci (topologia + parametry)               | Identyfikacja stanu modelu               |

Algorytm: **SHA-256** dla wszystkich skrotow.

---

## 4. Formaty eksportu

### 4.1. JSON / JSONL

| Cecha             | Opis                                                          |
|-------------------|---------------------------------------------------------------|
| Przeznaczenie     | Odczyt maszynowy, integracja z innymi systemami               |
| Format            | JSON (pelny artefakt) lub JSONL (jeden krok na linie)         |
| Zawartosc         | Pelne dane sladu: wzory, wartosci, jednostki, metadane        |
| Kodowanie         | UTF-8                                                         |
| Schemat           | `api/analysis_run_exports.py::build_analysis_run_trace_export_payload` (KOREKTA 2026-09-10, patrz sekcja 3) |

### 4.2. PDF

| Cecha             | Opis                                                          |
|-------------------|---------------------------------------------------------------|
| Przeznaczenie     | Dokument do podpisu, archiwizacja formalna                    |
| Wzory             | Renderowane z LaTeX (blokowe `$$...$$`)                       |
| Uklad             | Naglowek -> Spis tresci -> Sekcje obliczen -> Podsumowanie   |
| Metadane          | Osadzone w PDF (snapshot_hash, run_id, data)                  |
| Podpis            | Pole na podpis elektroniczny lub reczny                       |

### 4.3. DOCX

| Cecha             | Opis                                                          |
|-------------------|---------------------------------------------------------------|
| Przeznaczenie     | Dokument do podpisu, edycja koncowa                           |
| Wzory             | Unicode Math (OMML) — natywny format MS Word                  |
| Uklad             | Identyczny z PDF                                              |
| Tabele            | Natywne tabele Word                                           |
| Style             | Szablonowe (Naglowek 1, Naglowek 2, Normalny, Wzor)          |

### 4.4. LaTeX

| Cecha             | Opis                                                          |
|-------------------|---------------------------------------------------------------|
| Przeznaczenie     | Formalny dowod matematyczny, jakosc akademicka                |
| Format            | Plik `.tex` kompilowalny do PDF (pdflatex / lualatex)         |
| Pakiety           | amsmath, amssymb, booktabs, hyperref, siunitx                 |
| Struktura         | `\documentclass{article}` z sekcjami per element              |
| Jezyk             | Polski (babel, polski)                                        |

---

## 5. Identyfikatory artefaktow

### 5.1. Schemat identyfikacji

```
{snapshot_hash}_{study_case_id}_{run_id}_{analysis_id}
```

Przyklad:
```
a1b2c3d4_550e8400_sha256abc_SC3F_BUS001
```

### 5.2. Determinizm

| Wlasciwosc         | Gwarancja                                                    |
|---------------------|--------------------------------------------------------------|
| Reprodukowalnosc    | Identyczne dane wejsciowe -> identyczny artefakt             |
| Jednoznacznosc      | Kazdy artefakt ma unikalny identyfikator                     |
| Weryfikowalnosc     | Mozna zweryfikowac integralnosc przez ponowne obliczenie     |
| Niezaleznosc        | Identyfikator nie zalezy od czasu ani srodowiska             |

---

## 6. Struktura dokumentu dowodowego

### 6.1. Naglowek

```
┌─────────────────────────────────────────────────────────────┐
│  DOWOD OBLICZENIOWY                                         │
│                                                             │
│  Projekt:        [nazwa projektu]                           │
│  Wariant:        [nazwa wariantu]                           │
│  Typ analizy:    [zwarciowa IEC 60909 / przeplywowa N-R]   │
│  Data:           [data uruchomienia]                        │
│  Migawka modelu: [snapshot_hash]                            │
│  Identyfikator:  [run_id]                                   │
│  Wersja solwera: [solver_version]                           │
│  Specyfikacja:   [math_spec_version]                        │
└─────────────────────────────────────────────────────────────┘
```

### 6.2. Spis tresci

Automatycznie generowany na podstawie sekcji sladu obliczen.

### 6.3. Sekcje obliczen (per element)

Dla kazdego elementu (szyny, galezi) wszystkie kroki obliczeniowe:

```
Sekcja 3.1: Impedancja zasteprcza Thevenina — Szyna S1

Wzor:
$$Z_{th} = R_{th} + jX_{th}$$

Dane wejsciowe:
  R_th = 0.1523 Ohm   (zrodlo: macierz impedancji, krok 2.4)
  X_th = 0.4567 Ohm   (zrodlo: macierz impedancji, krok 2.4)

Podstawienie:
$$Z_{th} = 0.1523 + j \cdot 0.4567$$

Wynik:
$$|Z_{th}| = 0.4814 \; \Omega$$

Weryfikacja jednostek: [Ohm] + j[Ohm] = [Ohm]  ✓
Odniesienie: IEC 60909-0:2016, punkt 4.2.1
```

### 6.4. Podsumowanie

Tabela kluczowych wynikow:

| Element | I''k [kA] | ip [kA] | Ith [kA] | Sk'' [MVA] |
|---------|-----------|---------|----------|------------|
| Szyna 1 | 12.45     | 31.23   | 12.01    | 323.7      |
| Szyna 2 | 8.67      | 21.78   | 8.34     | 225.4      |

### 6.5. Stopka

```
┌─────────────────────────────────────────────────────────────┐
│  Skrot artefaktu:    [trace_signature]                      │
│  Wersja specyfikacji: [math_spec_version]                   │
│  Wygenerowano:       [timestamp]                            │
│  Narzedzie:          MV-Design-PRO [wersja]                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Niezmienniki (invariants)

### 7.1. Solwer nietkniety

Silnik dowodowy (Proof Engine) **NIE MODYFIKUJE** solwerow.
Dowody generowane sa wylacznie na podstawie istniejacych danych sladu i wynikow.

```
SOLWER  ─── generuje ───>  TraceArtifact  ─── odczytuje ───>  SILNIK DOWODOWY
                                                                      │
                                                            generuje dowod
                                                                      │
                                                                      v
                                                              ProofDocument
```

### 7.2. Determinizm

Identyczny `run_id` generuje **identyczny** dokument dowodowy.

$$
\forall \text{run\_id}: \text{ProofDocument}(\text{run\_id})_1 = \text{ProofDocument}(\text{run\_id})_2
$$

### 7.3. Czysta interpretacja

Dowody sa generowane wylacznie z istniejacych danych sladu i wynikow.
Silnik dowodowy nie wykonuje zadnych obliczen fizycznych.

### 7.4. LaTeX jako jedyny format matematyczny

Wszystkie wzory w dokumentach dowodowych zapisywane sa w formacie blokowym LaTeX:

```
$$wzor$$
```

Zakazane: MathML, Unicode Math w tresci dowodu (DOCX uzywa OMML jedynie w eksporcie koncowym).

### 7.5. Obowiazkowosc I_dyn i I_th w dowodach SC3F

Dla zwarc trojfazowych (SC3F) dowod **MUSI** zawierac:

- **I_dyn** (prad udarowy ip) — obliczony zgodnie z IEC 60909.
- **I_th** (prad cieplny Ith) — obliczony dla zadanego czasu odniesienia.

Brak tych wartosci powoduje **odrzucenie** dowodu jako niekompletnego.

---

## 8. Powiazania z innymi warstwami

| Warstwa           | Relacja                                                       |
|-------------------|---------------------------------------------------------------|
| Solwer SC         | Zrodlo danych sladu: TraceArtifact generowany przez solwer    |
| Solwer PF         | Zrodlo danych sladu: TraceArtifact generowany przez solwer    |
| Study Case        | run_id powiazany z wariantem obliczeniowym                    |
| SLD               | Lacze z inspektora sladu do elementu na schemacie             |
| Eksport           | Dowod jako czesc pakietu projektu do podpisu                  |
| Analiza ochrony   | Slad obliczen TCC dostepny w inspektorze                      |

---

## 9. Odniesienie: istniejace pakiety dowodowe

Szczegolowe specyfikacje pakietow dowodowych znajduja sie w:

- `docs/proof_engine/` — specyfikacje pakietow Proof Pack
- Formaty artefaktow, szablony LaTeX, schematy JSON

Niniejszy dokument definiuje **interfejs inspektora i zasady eksportu**, a nie szczegoly implementacyjne pakietow.

---

## 10. Ograniczenia i zalozenia

1. Inspektor sladu wyswietla dane **po zakonczeniu obliczen** — nie w czasie rzeczywistym.
2. Dla duzych sieci (>500 szyn) inspektor moze stosowac paginacje sekcji.
3. Eksport PDF wymaga dostepu do silnika renderujacego LaTeX (lualatex/pdflatex).
4. Eksport DOCX uzywa biblioteki generujacej OMML (nie wymaga MS Word).
5. Rozmiar artefaktu JSON moze byc znaczny dla duzych sieci — archiwizacja z kompresja.
6. Weryfikacja jednostek jest **statyczna** (analiza wymiarowa) — nie numeryczna.

---

*Koniec dokumentu. Status: BINDING. Wersja: 1.0. Data: 2026-02-17.*
