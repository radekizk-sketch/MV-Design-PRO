# SLD/CAD — DOCELOWA ARCHITEKTURA EDYTORA (KANON)

Status: **KANONICZNY / BINDING**  
Data: **2026-03-30**

## 1. Warstwy

1. **Domena + Snapshot (jedyna prawda)**  
   Mutacja tylko przez ENM_OP → nowy Snapshot.
2. **Semantyka SLD**  
   Jawne byty (GPZ, trunk, branch, ring, NOP, typy stacji, PV/BESS), jawne porty semantyczne.
3. **Layout / geometria / routing**  
   Deterministyczny layout, orthogonal routing, trunk jako oś dominująca.
4. **Renderer**  
   Cienki: tylko rysowanie geometrii i etykiet.
5. **Interakcje edytora**  
   Narzędzia CAD (wybór, wstawianie, łączenie, inspektor) mapowane 1:1 na ENM_OP.

## 2. Kontrakt narzędzi użytkownika → ENM_OP

| Narzędzie UI | Operacja kanoniczna |
|---|---|
| Dodaj GPZ | `add_gpz` |
| Dodaj odcinek magistrali | `continue_trunk_segment_sn` |
| Wstaw stację w odcinek | `insert_station_on_segment_sn` |
| Dodaj odgałęzienie | `start_branch_segment_sn` |
| Połącz ring | `connect_secondary_ring_sn` |
| Ustaw NOP | `set_normal_open_point` |
| Dodaj PV/BESS | `add_converter_source` |
| Edytuj właściwości | `update_element_parameters` |
| Usuń element | `delete_element` |

## 3. Determinizm

- Ten sam `snapshot_base_hash` + payload ENM_OP = ten sam `idempotency_key`.
- Ten sam Snapshot = ten sam wynik adapterów semantycznych i layoutu.
- Sortowanie kanoniczne po identyfikatorach w transformacjach semantycznych/render.

## 4. Zakazy twarde

- Zakaz `PCC` w modelu i UI.
- Zakaz mutacji topologii przez lokalny `setState` konkurujący ze Snapshotem.
- Zakaz tworzenia równoległego edytora produkcyjnego.

## 5. Inspektor i fix actions

- Inspektor czyta/zapisuje wyłącznie przez model kanoniczny.
- Fix action musi prowadzić do elementu i panelu właściwej korekty.

## 6. Status wdrożenia (2026-03-30)

- Toolbar kreatora korzysta z kanonicznego rejestru narzędzi i palety typów (`editorPalette.ts` + `CreatorToolbar.tsx`).
- Rejestr typów obiektów zawiera minimalny zestaw: GPZ, stacje A/B/C/D, ZKSN, punkt rozgałęźny, PV, BESS.
- Duplikacja requestów ENM_OP została usunięta w ścieżce SLD:
  `useEnmStore` wykonuje operacje przez `domainOpsClient.executeDomainOp(...)`.
- Interaction controller (`interactionController.ts`) rozwiązuje:
  narzędzie → gating kontekstu → canonicalOp → payload → status runtime (DZIAŁA/ZABLOKOWANE/MAPOWANIE).
