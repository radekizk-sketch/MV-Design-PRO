> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# ENM Diagnostics � Specyfikacja kanoniczna (v4.2)

## 1. Cel

Diagnostyka in�ynierska modelu sieci (ENM) wykrywa b��dy projektowe,
wyja�nia dost�pno�� analiz i przygotowuje u�ytkownika przed RUN.

## 2. Architektura

```
ENM (KANON, read-only)
  � DiagnosticEngine (regu�y E-Dxx)
    � DiagnosticReport (frozen, deterministyczny)
      � AnalysisMatrix (macierz dost�pno�ci)
      � PreflightReport (przed RUN)
      � EnmDiffReport (por�wnanie rewizji)
        � Inspektor ENM (UI)
```

## 3. Silnik diagnostyczny (DiagnosticEngine)

### Wej�cie
- `NetworkGraph` (kanoniczny JSON, read-only)
- Opcjonalny kontekst case (read-only)

### Wyj�cie
- `DiagnosticReport`:
  - `status`: OK | WARN | FAIL
  - `issues[]`: lista DiagnosticIssue
  - `analysis_matrix`: macierz dost�pno�ci analiz

### Zasady
- Brak mutacji ENM
- Stabilne kody b��d�w
- Deterministyczne sortowanie wynik�w (severity � code)

## 4. Regu�y E-Dxx

### BLOCKER (blokuj� solwer)

| Kod | Opis |
|-----|------|
| E-D01 | Brak �r�d�a zasilania (SLACK lub falownik) |
| E-D02 | Niesp�jne poziomy napi�� na po��czeniu linia/kabel |
| E-D03 | Brak ci�g�o�ci topologicznej (wyspy) |
| E-D04 | Transformator bez strony GN/DN |
| E-D05 | Linia/kabel bez impedancji (R=0, X=0) |
| E-D07 | Otwarte ��czniki izoluj� cz�� sieci |
| E-D08 | Sprzeczne cz�stotliwo�ci (placeholder) |

### WARN (ograniczenie analiz)

| Kod | Opis |
|-----|------|
| E-D06 | Zwarcie jednofazowe niedost�pne � brak Z0 |
| W-D01 | Brak danych Z0 � ograniczenie analiz |
| W-D02 | Parametry graniczne poza typowymi zakresami |
| W-D03 | Nadmiar �r�de� bez koordynacji |

### INFO (informacyjne)

| Kod | Opis |
|-----|------|
| I-D01 | Analizy dost�pne w pe�nym zakresie |
| I-D02 | Topologia sieci: radialna/oczkowa |

## 5. Macierz dost�pno�ci analiz

| Analiza | Blokuj�ce kody |
|---------|----------------|
| SC 3F | E-D01, E-D03, E-D04, E-D05 |
| SC 1F | E-D01, E-D03, E-D04, E-D05, E-D06 |
| LF | E-D01, E-D02, E-D03, E-D04, E-D05 |
| Protection | E-D01, E-D03, E-D04, E-D05 |

## 6. API (read-only)

```
GET /api/cases/{case_id}/diagnostics
GET /api/cases/{case_id}/diagnostics/preflight
GET /api/cases/{case_id}/enm/diff?from=revA&to=revB
```

Brak side-effects. Case-bound.

## 7. Diff rewizji ENM

Por�wnanie techniczne dw�ch snapshot�w:
- Na poziomie encji (node/branch/switch/inverter_source)
- Na poziomie parametr�w (field-level changes)
- Deterministyczny wynik (sortowanie po entity_type � change_type � entity_id)
- Fingerprint SHA-256 dla identyfikacji rewizji

## 8. Pre-flight checks

Tabela wy�wietlana przed K10 (RUN):
- SC 3F | SC 1F | LF | Protection
- Status: AVAILABLE / BLOCKED
- Pow�d blokady (je�li BLOCKED)
- Kody blokuj�ce

## 9. Testy

- Unit: 44 testy (regu�y E-Dxx, engine, preflight, diff)
- Deterministyczno��: ten sam graf � ten sam wynik
- Brak snapshot�w � semantyczna walidacja
