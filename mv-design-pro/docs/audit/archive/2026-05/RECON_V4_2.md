# RECON v4.2 — Diagnostyka inżynierska ENM + Inspektor Modelu

## Data: 2026-02-06

## Cel

Zidentyfikowanie punktów integracji dla diagnostyki ENM v4.2
bez naruszania istniejących kontraktów.

## Zeskanowane moduły

### 1. ENM (network_model/core/)

| Plik | Rola | Status |
|------|------|--------|
| `node.py` | Node (Bus) — NodeType: SLACK/PQ/PV | NIE DOTYKAMY |
| `branch.py` | LineBranch, TransformerBranch | NIE DOTYKAMY |
| `switch.py` | Switch — SwitchType, SwitchState | NIE DOTYKAMY |
| `inverter.py` | InverterSource (OZE) | NIE DOTYKAMY |
| `graph.py` | NetworkGraph — topologia NetworkX | CZYTAMY (read-only) |
| `snapshot.py` | NetworkSnapshot — fingerprint SHA-256 | CZYTAMY (diff) |
| `station.py` | Station — logiczny kontener | CZYTAMY |
| `ybus.py` | AdmittanceMatrixBuilder | NIE DOTYKAMY |

### 2. NetworkValidator (network_model/validation/)

| Plik | Rola | Status |
|------|------|--------|
| `validator.py` | 13 reguł walidacji, Severity, ValidationReport | NIE DOTYKAMY |

**Uwaga**: Diagnostyka v4.2 jest warstwą PONAD walidacją — dodaje reguły
inżynierskie (E-Dxx) i macierz dostępności analiz. Nie modyfikuje Validatora.

### 3. Wizard (application/network_wizard/)

| Moduł | Rola | Status |
|-------|------|--------|
| service.py | K1-K10 operacje na modelu | NIE DOTYKAMY |
| DTOs | Payloady Wizard | NIE DOTYKAMY |

### 4. SLD (domain/sld.py)

| Element | Rola | Status |
|---------|------|--------|
| SldNodeSymbol | Symbol szyny (ref: node_id) | NIE DOTYKAMY |
| SldBranchSymbol | Symbol gałęzi (ref: branch_id) | NIE DOTYKAMY |
| SldSwitchSymbol | Symbol łącznika (ref: switch_id) | NIE DOTYKAMY |

**Inspektor operuje na ENM (ref_id), nie na SLD canvas.**

### 5. Case API (application/study_case/)

| Element | Rola | Status |
|---------|------|--------|
| StudyCase | Konfiguracja przypadku | CZYTAMY (case_id → graph) |
| ResultStatus | NONE/FRESH/OUTDATED | NIE DOTYKAMY |

### 6. Solvers (network_model/solvers/)

| Solver | Status |
|--------|--------|
| short_circuit_iec60909.py | FROZEN — NIE DOTYKAMY |
| power_flow_newton.py | FROZEN — NIE DOTYKAMY |

### 7. API (api/)

| Router | Status |
|--------|--------|
| main.py | MODYFIKUJEMY — dodajemy diagnostics_router |
| Wszystkie inne routery | NIE DOTYKAMY |

## Nowe moduły (v4.2)

| Moduł | Ścieżka | Rola |
|-------|---------|------|
| diagnostics/ | backend/src/diagnostics/ | Silnik diagnostyczny |
| diagnostics/models.py | - | DiagnosticReport, Issue, Matrix |
| diagnostics/rules.py | - | Reguły E-Dxx (BLOCKER/WARN/INFO) |
| diagnostics/engine.py | - | DiagnosticEngine |
| diagnostics/preflight.py | - | Pre-flight checks |
| diagnostics/diff.py | - | Diff rewizji ENM |
| api/diagnostics.py | - | API read-only |
| enm-inspector/ | frontend/src/ui/enm-inspector/ | UI React |

## Kontrakty NIE do naruszenia

1. **Result API** — FROZEN (ShortCircuitResult, PowerFlowNewtonSolution)
2. **NetworkValidator** — nie modyfikujemy reguł walidacji
3. **Solvers** — zero zmian w fizyce
4. **Proof Engine** — nie dotykamy
5. **Protection** — nie dotykamy
6. **ENM v1.0** — nie zmieniamy kontraktu modelu
7. **Snapshot fingerprint** — korzystamy read-only
