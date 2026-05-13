# MV-DESIGN-PRO — Root documentation pointer

**Status:** LEGACY POINTER (zaktualizowany 2026-05-13)
**Cel pliku:** ten plik jest tylko wskazówką nawigacyjną. Nie jest kanoniczny.

> Pełny aktywny indeks dokumentacji żyje w **[`mv-design-pro/docs/INDEX.md`](../mv-design-pro/docs/INDEX.md)**.
> Hierarchia kanonu (priorytety 1–11) jest zdefiniowana w `mv-design-pro/AGENTS.md` § 1 + `CLAUDE.md`.

---

## Od czego zacząć

| Rola | Wejście |
|------|---------|
| Nowy developer | [`mv-design-pro/docs/INDEX.md`](../mv-design-pro/docs/INDEX.md) — sekcja „🚀 START" |
| Architekt / agent AI | [`mv-design-pro/docs/v12xx/KANON_V12_XX.md`](../mv-design-pro/docs/v12xx/KANON_V12_XX.md) |
| Kontrakty UI | [`mv-design-pro/docs/ui/`](../mv-design-pro/docs/ui/) |
| Cel SLD industrial | [`mv-design-pro/docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md`](../mv-design-pro/docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md) |
| Plan dalszego wdrożenia | [`mv-design-pro/docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md`](../mv-design-pro/docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md) |
| Status operacyjny | [`mv-design-pro/PLANS.md`](../mv-design-pro/PLANS.md) |
| Audyty 2026-05 | [`mv-design-pro/docs/audit/`](../mv-design-pro/docs/audit/) |

---

## Historia tego pliku

Wcześniejsze wersje tego pliku (do 2026-05-13) deklarowały kanonalność i indeksowały kontrakty UI z odniesieniami do `mv-design-pro/docs/spec/` jako source of truth. Po rozstrzygnięciu konfliktu V12K-001 / V12K-011:

- Źródło prawdy = `mv-design-pro/docs/v12xx/KANON_V12_XX.md`
- `mv-design-pro/docs/spec/` = ARCHIWALNE (V11 reference)
- Aktywny root dokumentacji = `mv-design-pro/docs/`
- Ten plik (root `docs/INDEX.md`) ma już rolę WYŁĄCZNIE POINTERA do aktywnego indeksu

Pełna historia decyzji: [`mv-design-pro/docs/v12xx/REJESTR_KONFLIKTOW.md`](../mv-design-pro/docs/v12xx/REJESTR_KONFLIKTOW.md) (V12K-001, V12K-011).
