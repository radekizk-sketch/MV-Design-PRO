> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# Kreator budowy sieci (Wizard) � Flow K1-K10

**Status:** BINDING
**Komponent:** `frontend/src/ui/wizard/WizardPage.tsx`
**Backend API:** `backend/src/api/enm.py`

---

## 1. Cel

Kreator prowadzi u�ytkownika krok po kroku (K1-K10) przez proces budowy
kompletnego modelu sieci �redniego napi�cia (ENM). Ka�dy krok edytuje
EnergyNetworkModel z autosave (500ms debounce) przez `PUT /api/cases/{id}/enm`.

## 2. Kroki

| Krok | Nazwa | Co edytuje | ENM pola |
|------|-------|-----------|----------|
| K1 | Parametry modelu | Nazwa, opis, cz�stotliwo�� | `header.name`, `header.description`, `header.defaults.frequency_hz` |
| K2 | Punkt zasilania | Szyna g��wna + �r�d�o zasilania | `buses[0]` (tag: source), `sources[0]` |
| K3 | Struktura szyn i sekcji | Dodatkowe szyny, sekcjonowanie | `buses[]` (dodawanie/usuwanie) |
| K4 | Ga��zie (linie/kable) | Parametry R, X, d�ugo�� | `branches[]` (OverheadLine, Cable) |
| K5 | Transformatory | Sn, uk%, Pk | `transformers[]` |
| K6 | Odbiory i generacja | P, Q odbior�w | `loads[]`, `generators[]` |
| K7 | Uziemienia i Z0 | Przegl�d sk�adowej zerowej | Read-only (informacja o brakach) |
| K8 | Walidacja | Gate readiness check | Read-only (tabela issues + go-to-step) |
| K9 | Schemat jednokreskowy | Podgl�d SLD | Read-only (podsumowanie element�w) |
| K10 | Uruchom analizy | SC 3F dispatch | POST `/runs/short-circuit` |

## 3. Autosave

```
onChange(newEnm) �
  setEnm(newEnm)
  clearTimeout(timerRef)
  timerRef = setTimeout(500ms, () => {
    PUT /api/cases/{id}/enm � saved
    GET /api/cases/{id}/enm/validate � validation
  })
```

Status zapisu: `saving` � `saved` | `error`.

## 4. Deep-linking

URL hash aktualizowany przy zmianie kroku:
`#wizard/k3?caseId=abc` � krok K3, case `abc`.

Przy wej�ciu na stron�, krok parsowany z URL hash (`/k(\d+)/`).

## 5. Walidacja (K8)

Tabela ValidationResult z polami:
- **Kod** (E001, W001, I001...)
- **Priorytet** (BLOCKER / IMPORTANT / INFO)
- **Opis** (po polsku)
- **Akcja** � przycisk "Id� do kroku Kx" (wizard_step_hint)

Nad tabel�: karty dost�pno�ci analiz (Zwarcie 3F, 1F, Rozp�yw mocy).

## 6. Uruchomienie oblicze� (K10)

1. Walidacja musi by� != FAIL
2. `POST /api/cases/{id}/runs/short-circuit`
3. Backend: ENM � `map_enm_to_network_graph()` � `ShortCircuitIEC60909Solver.compute_3ph_short_circuit()`
4. Wyniki w tabeli: Ik'', Ip, Ith, Sk'' per w�ze�

## 7. GateIndicator

Wid�et w sidebar wizarda:
- Zielony: `OK` � "Gotowy"
- ��ty: `WARN` � "N ostrz."
- Czerwony: `FAIL` � "N bloker."

## 8. K2 � wzorzec ensureBusAndSource

K2 automatycznie tworzy szyn� + �r�d�o przy pierwszej edycji:
- Szyna: `ref_id="bus_sn_main"`, tag `source`, domy�lne 15 kV
- �r�d�o: `ref_id="source_grid"`, model `short_circuit_power`, Sk''=250 MVA, R/X=0.1

Kolejne edycje modyfikuj� istniej�ce elementy (upsert po ref_id).

## 9. Etykiety

Wszystkie etykiety UI po polsku. Brak kod�w projektowych (P7, P11 itp.).

---

**END OF WIZARD FLOW**
