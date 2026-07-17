# SŁOWNIK IA NOWEJ POWŁOKI (2026-07)

**Status:** WIĄŻĄCY dla etykiet nowej powłoki · podporządkowany
`PROGRAM_UIUX_2026-07.md`. Rozszerzany przy integracjach międzywątkowych.

## 1. Terminy Reference Engine V1 (HANDOFF pkt 2.5, kontrakt
`docs/sld/REFERENCE_ENGINE_UI_HANDOFF_2026-07.md`)

| Termin PL (obowiązujący w UI) | Znaczenie | Źródło danych |
|---|---|---|
| **pakiet referencyjny** | Wersjonowany zbiór referencji (norma / producent / OSD) z Reference Engine V1 | `GET /api/reference/packs` |
| **profil pola** | Referencyjny skład i kolejność aparatów pola wg pakietu (IEC 62271) | pakiet `field_profiles` / mirror `ui/sld/reference/` |
| **konfiguracja celki** | Katalogowa konfiguracja celki producenta (skład standardowy vs opcja) | pakiet `cell_configurations` |
| **ocena zgodności referencyjnej** | Polska forma „Reference Score" — wynik procentowy zgodności projektu z pakietem | `GET /api/cases/{id}/reference/compliance` (`score_percent`) |
| **nie dotyczy** | JEDYNA prezentacja `score_percent = null` (zero sprawdzeń stosowalnych). NIGDY 0% ani 100% | kontrakt HANDOFF §3.3 |
| **zgodność referencyjna** (grupa ostrzeżeń) | Grupa kodów `reference.*` walidatora ENM w panelu problemów gotowości | `GET /api/cases/{id}/enm/validate` |

Zasady:
- Skala kolorów oceny: 100% zieleń · ≥80% bursztyn · <80% czerwień ·
  null szarość („nie dotyczy") — tokeny `--mvd-*`.
- **Kody celek producentów** (C, F, V, IM, QM, DM1-A, 8DJH R/T/L, …) to
  NOTACJA KATALOGOWA producenta — NIE są kodenames projektu i nie podlegają
  `no_codenames_guard`; w UI występują wyłącznie jako dane z API/pakietów
  (zakaz stałych w komponentach — V12K-060).
- Zakaz drugiej definicji składów/kolejności/słowników: wyłącznie
  API Reference Engine albo mirrory `frontend/src/ui/sld/reference/`.

## 2. Rezerwa: profil renderowania schematu (HANDOFF pkt 2.6)

W ustawieniach widoku powłoki zarezerwowany jest punkt **„Profil renderowania
schematu"** (`ui2/shell/useShellStore.ts` — typ `RenderProfileId`). Do czasu
pozyskania ZWERYFIKOWANYCH wzorników graficznych producentów (legendy: 8DJH
katalog HA 40.2 s. 10–13, UniGear ZS1 s. 83 — patrz
`docs/audit/REFERENCE_ENGINE_RESEARCH_MANUFACTURER_CELLS_2026-07-17.md` na
gałęzi SLD) jedyną wartością jest `standard`; implementacja stylów
producenckich jest ZAKAZANA („nie fabrykuj danych producenta", HANDOFF §4).
