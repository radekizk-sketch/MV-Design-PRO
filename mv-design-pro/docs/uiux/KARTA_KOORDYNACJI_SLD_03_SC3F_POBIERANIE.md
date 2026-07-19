# KARTA KOORDYNACJI (wątek SLD, V12K-060): pobieranie pakietu dowodowego SC3F

**Status:** OTWARTA (do wykonania przez wątek SLD). **Autor:** Fable (wątek UI/UX). **Data:** 2026-07-19.
**Powód:** wątek UI/UX zbudował backend (G-SCM F2, V12K-054/055) — brak „ostatniego klika"
we froncie, który leży w `frontend/src/ui/sld/**` (granica programu — wątek UI/UX go nie dotyka).

---

## Kontekst

G-SCM F2 dostarczył **pierwszy pakiet dowodowy zwarcia trójfazowego** (dotąd 3F — najczęstsze
zwarcie — nie miało pakietu):
- Backend pack: `application/proof_engine/packs/sc_symmetrical.py::SC3FProofPack`.
- Endpoint: `POST /api/proof/sc3f/pack` (`api/proof_pack.py::download_sc3f_pack`).
- Payload (`SC3FPackRequest`): `project_id, case_id, run_id, snapshot_id, project_name,
  case_name, fault_node_id, run_timestamp, solver_version, snapshot (ENM), c_factor, tk_s`.
- Zwraca ZIP (`application/zip`) = proof.json + proof.tex (+ PDF gdy dostępny).
- Rozbicie maszynowe μ/q/i_b (§6.6) w dowodzie, gdy sieć ma maszyny wirujące (F1).

## Zadanie dla wątku SLD

`frontend/src/ui/sld/v2/proof/ProofPacksPanel.tsx` **już wymienia** SC3F jako jeden z 8
kanonicznych pakietów (`labelPl: 'Zwarcie 3-fazowe (SC3F)'`), z CTA `onGeneratePack`/
`onExportPack`. Brakuje wpięcia tych callbacków dla SC3F w realne pobranie:
- `onExportPack('sc3f', 'pdf'|'latex'|'json')` (lub „Pobierz pakiet") → `POST /api/proof/sc3f/pack`
  z payloadem jak wyżej (snapshot ENM z aktywnego StudyCase, `fault_node_id` = węzeł grafu
  wskazanego zwarcia), następnie pobranie zwróconego ZIP (Blob → download).
- Analogia gotowa: pakiet asymetryczny (`POST /api/proof/sc-asymmetrical/pack`) — ten sam wzorzec.

## Kontrakt (stabilny)

- Endpoint i payload są ZAMROŻONE po stronie backendu (dodatki addytywne). ZERO fizyki w UI —
  całość liczy backend z `snapshot`; front tylko kompletuje payload i pobiera ZIP.
- `fault_node_id` to identyfikator węzła grafu (jak w kanonicznym SC), nie ref szyny.

## Weryfikacja po wykonaniu (wątek SLD)

- Klik „Pobierz/Eksportuj" na kafelku SC3F → pobiera ZIP z proof.json/proof.tex.
- Sieć z OZE/agregatem → dowód zawiera sekcję maszynową (i_b) / wkład falownikowy w I″k.
- Guardy UI + vitest wątku SLD zielone; bez kolizji plikowej z wątkiem UI/UX.
