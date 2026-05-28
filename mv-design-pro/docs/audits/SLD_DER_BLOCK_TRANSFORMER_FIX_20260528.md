# SLD DER / transformator blokowy - decyzje i walidacja

## Kontekst

Widok SLD mieszał trzy różne obiekty:

- transformator SN/nN stacji,
- pole przyłączeniowe/PCC źródła DER po stronie SN,
- transformator blokowy źródła DER.

Skutek widoczny dla użytkownika: etykieta typu `PVR blokowy 15/0,4 kV 630 kVA` oraz symbol transformatora nakładały się na stronę nN stacji i sugerowały, że transformator blokowy jest elementem transformatora stacyjnego.

## Design review

- Prompt: `docs/audits/CLAUDE_DESIGN_REVIEW_sld_der_block_transformer_semantics_20260528_010441.prompt.md`
- Review: `docs/audits/CLAUDE_DESIGN_REVIEW_sld_der_block_transformer_semantics_20260528_010441.md`
- Metadane: `docs/audits/CLAUDE_DESIGN_REVIEW_sld_der_block_transformer_semantics_20260528_010441.meta.json`
- Exit code: `0`

## Accepted

- DER z transformatorem blokowym nie może być rysowany na szynie nN stacji.
- Wariant `block_transformer` musi być pokazywany jako osobny tor: szyna SN stacji -> pole/PCC DER -> transformator blokowy -> źródło DER.
- Wybrany DER nie może przełączać się na ogromny pełny symbol na aktywnym SLD, bo zasłania schemat. Szczegóły mają trafić do panelu konfiguracji.
- Pole/PCC i transformator blokowy muszą mieć osobne hit area, tooltip i selection kind.
- Etykieta transformatora blokowego na kanwie ma być kompaktowa; pełne dane zostają w tooltipie i inspektorze.

## Rejected

- Nie wprowadzono żadnych nowych parametrów katalogowych ani fizyki w UI.
- Nie zmieniono znaczenia wariantów przyłączenia DER: DER po stronie nN nadal nie dostaje symbolu transformatora blokowego.

## Deferred

Brak decyzji odroczonych w tej poprawce. Zakres nie dodaje nowych katalogów producentów, bo nie wolno dopisywać danych bez `source_ref`.

## Testy

- `npm test -- --run src/ui/sld/v2/canvas/__tests__/SldCanvasV2.overviewChrome.test.tsx src/ui/sld/v2/canvas/__tests__/enmToSldAdapter.test.ts`
- `npm run type-check`
- `npm run lint`
- `npm run build`

## Dowód przeglądarkowy

Screenshot po zmianie:

- `tmp/sld-der-block-transformer-after.png`

Weryfikacja wizualna: aktywny SLD nie pokazuje już gigantycznej etykiety `PVR blokowy...`; połączenie DER nie wchodzi w stronę nN stacji.
