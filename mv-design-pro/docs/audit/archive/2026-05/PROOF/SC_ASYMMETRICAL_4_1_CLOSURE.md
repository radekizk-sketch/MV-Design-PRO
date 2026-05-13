# Raport domknięcia §4.1 — SC asymetryczne

## 0. RECON — ścieżki i pipeline

### Kluczowe ścieżki

- Rejestr równań i audit `c`: `backend/src/application/proof_engine/equation_registry.py`
- Generator dowodu SC1: `backend/src/application/proof_engine/proof_generator.py`
- Pakiet dowodowy SC asymetryczny: `backend/src/application/proof_engine/packs/sc_asymmetrical.py`
- Eksporter ZIP proof pack: `backend/src/application/proof_engine/proof_pack.py`
- API eksportu proof: `backend/src/api/proof_pack.py`
- Testy kompletne SC1: `backend/tests/proof_engine/test_sc1_asymmetrical_complete.py`

### Diagram „Proof pipeline”

```mermaid
flowchart LR
    A[Wyniki obliczeń IEC 60909
read-only] --> B[ProofGenerator SC1
EQ_SC1_001..012]
    B --> C[ProofDocument
JSON + LaTeX]
    C --> D[ProofPackBuilder
proof.json/proof.tex/(opcjonalnie pdf)]
    D --> E[Endpoint eksportu
/api/proof/.../pack]
    B --> F[SCAsymmetricalProofPack
SC1FZ + SC2F + SC2FZ]
    F --> G[Bundle ZIP
/api/proof/sc-asymmetrical/pack]
```

## 1. Deliverables

- Dokument normatywny BINDING: `docs/proof/NORMATIVE_COMPLETION_PACK_IEC_60909.md`.
- Golden artifacts (deterministyczne): `backend/tests/golden/sc_asymmetrical/{1f_z,2f,2f_z}/proof.json|proof.tex`.
- Testy deterministyczne i mandatory outputs: `backend/tests/proof_engine/test_sc_asymmetrical_golden.py`.
- Integracja eksportu użytkowego pakietu: `POST /api/proof/sc-asymmetrical/pack`.
- Guardy CI: brak `alert/confirm/prompt` + brak nazw kodowych w obszarach user-visible.

## 2. Linki do testów

- `backend/tests/proof_engine/test_sc_asymmetrical_golden.py`
- `backend/tests/proof_engine/test_sc1_asymmetrical_complete.py`
- `backend/tests/api/test_proof_pack_api.py`
- `backend/tests/ci/test_user_visible_guards.py`

## 3. Potwierdzenie determinism + anti-double-counting

- Determinizm: podwójne uruchomienie dla 1F-Z/2F/2F-Z daje identyczny `proof.json` i `proof.tex` po normalizacji metadanych identyfikacyjnych.
- Anti-double-counting `c`: twarda reguła `verify_sc1()` + test negatywny (wstrzyknięcie `c` do innego równania musi dawać FAIL).

## 4. Mapowanie norm

Mapowanie norma → równanie → implementacja → krok dowodu znajduje się w:
- `docs/proof/NORMATIVE_COMPLETION_PACK_IEC_60909.md`

## 5. Status końcowy

§4.1 (zwarcia asymetryczne) został domknięty na poziomie audytu zewnętrznego bez zmian solvera i bez naruszenia zamrożonego Result API.
