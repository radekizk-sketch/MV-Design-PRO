# KARTA KRE-2 — DOMKNIĘCIE KONSUMPCJI: SZABLON POLA + RODZINA W WIDOKU I SLD

**Priorytet:** wysoki (domknięcie łańcucha „do ostatniego klika") · **Wiążące:**
CLAUDE.md (Dyrektywy właściciela §1,§3), `INTEGRACJA_KREATOR_ZRODLA_GLOBALNA_2026-07.md` §5.

## 0. Kontekst (stan zweryfikowany)
Kreator źródła zapisuje na `field_spec` (top-level) `bay_template_ref`,
`switchgear_family_ref`, `manufacturer_ref`, `protection_ref`. `_collect_bays`
przenosi je na syntetyczny `Bay` (bay_template_ref + meta rodziny). BRAK jeszcze
konsumentów prezentujących szablon/rodzinę.

## 1. Ogniwo A — widok pola / E-27 (display)
- `BayBaseModel` (`application/field_read_model.py`) rozszerzyć o opcjonalne
  `bay_template_ref` + `switchgear_family_ref` (exclude_none, determinizm: None dla
  pól bez rodziny → golden bez zmian).
- Frontend `types/enm` + `useFieldReadModel` — zmapować pola.
- E-27 `EkranZabezpieczenAutomatyki` + karta pola E-11 — kolumna/chip
  „Szablon / rodzina" per pole.
- Testy: read-model (nowe pola), E-27 (wyświetla szablon).

## 2. Ogniwo B — SLD internal_layout + Reference Engine compliance (KOORDYNACJA)
- Konsumenci czytają `bay.bay_template_ref` z ENM `bays`; GPZ tworzy `field_specs`
  (`snapshot.bays == []`). Wymaga PROJEKCJI `field_spec → Bay` (bay_template_ref/
  switchgear_family_ref/ports) albo rozszerzenia konsumentów o field_specs.
- To domena wątku Reference Engine/SLD (V12K-060) — pakiety READ-ONLY, wpis
  koordynacyjny. Bez zmian `ui/sld/**` z wątku UI.

## 3. Bramki
type-check; lint; frontend vitest ZERO failed; backend pytest (field_read_model +
determinizm + golden) ZERO failed; guardy = 0. Kontrakt/determinizm zachowany
(pola addytywne, exclude_none).
