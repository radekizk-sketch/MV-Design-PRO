# STAN_REPO.md — ŻYWY REJESTR STANU MV-DESIGN-PRO

> **TO JEST PIERWSZE CZYTANIE DLA KAŻDEGO AGENTA.** Ten plik mówi, gdzie jesteśmy, i odsyła do dokumentów, które
> niosą pomiar. **Repo > specy > ten rejestr** (gdy rejestr jest nieaktualny, prawdą jest świeży skan repo).
> Kanon i hierarchia dokumentów: `CLAUDE.md` („Document Hierarchy"). Misja właściciela (nadrzędna operacyjnie):
> `docs/plan/MISJA_DOMKNIECIA_PRODUKTU_2026-09.md` (część I 2026-09-09, część II 2026-09-16).

> **ZASADA NR 3 (nadrzędna): NIC NA POTEM + WSZYSTKO WSZĘDZIE.** Wykryte = naprawione natychmiast, w tej samej
> pracy. Zakaz „follow-on" / „osobny przebieg" / „bounded increment" / jawnego błędu zamiast funkcji / okrajania
> zakresu / wyłączania kategorii spod zakresu. Rozmiar → orkiestracja teraz, nie odroczenie.

**Ostatnia aktualizacja:** 2026-09-16 · **Gałąź:** `claude/mv-design-pro-twin-audit-u4lhy0` (HEAD `c307e95f`;
`main` = `7e84753a`) · **Poprzednia wersja rejestru (2026-05-29):** `docs/audit/archive/STAN_REPO_2026-05-29.md`
(zarchiwizowana; zawierała deklaracje sprzeczne z kodem).
**Cykl życia:** aktualizowany przy każdym odbiorze wycinka; szczegółowe pomiary żyją w
`docs/evidence/CONVERGENCE_EVIDENCE.md` (§A CI, §E karty, §F dowody, §G ustalenia adwersaryjne, §I decyzje właściciela).

---

## 1. ZDROWIE SYSTEMU (pomiar na `c307e95f`, 2026-09-16)

| Sprawdzenie | Wynik |
|---|---|
| Backend `pytest tests/ -m "not pandapower"` | **14 557 passed**, 1 skipped (bramka `MV_TEST_POSTGRES_URL`), 1 xfailed (IEEE 13-bus PLANNED), 0 failed — 790 s |
| Wyrocznia pandapower (`-m pandapower`, osobne środowisko) | **30 passed** |
| `scripts/guardy_z_ci.py` | 85 guardów wołanych przez CI: 84 zielone + `tsconfig_gate_guard` czerwony z zapadki W DÓŁ (dług typów poza bramką 119 → 117; budżet obniżany w odbiorze fali 3); lint jak CI 4/4; 799 testów własnych guardów |
| Frontend | tsc 0, eslint 0 (w `guardy_z_ci`); pełny vitest i e2e w łańcuchu przedpushowym fali 3 (wynik w evidence §F po zakończeniu) |
| CI (GitHub, 9 workflowów) | ostatni pełny wpis: evidence §A (szczyt `b89c13b3`); fala 3 po pushu = kolejny wpis |
| Skala (pomiar 2026-09-09/16) | ~9 080 funkcji testowych backendu; ~10 580 testów frontendu w 892 plikach; 85 guardów CI + testy własne |

---

## 2. CO JEST ZROBIONE (z dowodem)

Pełna klasyfikacja per zdolność i domenę: `docs/plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` §3 (12 tabel) + §3a
(rodziny A–L). Skrót stanu wycinków (mapa §8, korekta kolejności w `docs/plan/SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md` §5):

- **W1 — jedna prawda sieci** (2026-09-09): import XLSX → ENM przez jeden kompilator grafu, kasacja legacy ORM
  (19 tabel), kreatora, SLD ORM, `designer`/`design_synth`, raportów legacy; guard wskrzeszenia. Wcześniej CV-1
  (projekt jest właścicielem ENM), CV-2 (rewizje z dziennika + koperta), CV-3 (scenariusze `apply_scenario`, warianty),
  CV-4.1–4.3 (jeden assembler, `TopologyService` jedna implementacja, K7 S''kQmin, PERF-SC-50 153 s → 7,7 s).
- **W2 (+B, +C) — zero fabrykacji ekranów** (2026-09-09): stabilność bez wartości domyślnych, macierz DER bez
  martwego kliku, widmo harmoniczne z karty, hinty roadmapowe skasowane.
- **W3 — konwergencja duplikatów fizyki** (fale 1–3, 2026-09-09/16): IDMT ×5 → jądro IEC 60255; metodyka nastaw
  → Hoppel z pakietem dowodowym; ALF → jądro + obwód wtórny CT/VT; `source_compliance` → NC RfG; V12.6 duplikaty
  z powierzchni (410); jednostki w jednym miejscu; jeden predykat wymagalności katalogu; metoda rozpływu jako opcja
  biegu + porównanie NR↔FD; pasma wiarygodności rozpływu; ekran pasma MIN/MAX zwarć; kasacja martwego śladu v2.
  W toku: W3-J (jedno źródło progów napięcia), V12.7 (prezentacja inżynierska po werdykcie B-02 8,5/10).
- **Powierzchnie analityczne B-02** (2026-09-10): katalog kart z gotowością, „Ocena techniczna wyników", nawigacja
  obszar → analiza — werdykt właściciela 8,5/10.
- **Rdzenie FROZEN** (B-01): IEC 60909 (3F/2F/1F, MAX/MIN, wkłady), NR/GS/FD, protection IEC 60255, NC RfG/PTPiREE
  (T01–T20), FRT/HVRT, `stability_rms`, WLS, phase state SN, V12.6 — nietknięte; zmiany wyłącznie przez OD-14/15/18/19/20.

---

## 3. RZECZYWISTY DŁUG (klasy, nie instancje — mapa §4; główny dług architektoniczny — synteza §0)

| Dług | Gdzie zmierzono | Wycinek |
|---|---|---|
| Dowód regulacyjny bez bezpiecznika: statusy `reportable`/`complete` wpisywane stałą; certyfikat NC RfG z testów T14/T15 będących tautologią (`solvers/ncrfg_ptpiree/engine.py:646-655`) | synteza §0 p. 1 | **S-1** (W6-0), OD-20 |
| `no_module` liczony jak gotowość (`calculation_readiness/service.py:91`); literał w 21 + 13 miejscach | synteza §0 p. 2 | **S-4** (W6-0) |
| Trzy implementacje NC RfG (solver T01–T20, `checker.py` T1–T18, martwa wyspa kliencka) | synteza §0 p. 3 | **S-3** (W6-0) |
| `k_sc = 1,1` jako domyślka dopuszczona do doboru/nastaw/dowodu; liczby zwarciowe z żądania jako dowód (`equipment-proof/pack`, koordynacja) | synteza §0 p. 4–5 | **S-2** (W6-0), OD-22 |
| Dynamika = fasada (progi z opcji biegu; `stability_rms` bez sieci; `frt_hvrt` trajektoria = wejście); BESS bez stanu energii; brak QSTS; flicker w złej warstwie; brak EN 50160 | mapa §3 dom. 5/6, synteza §2 | **W6-1…W6-8** |
| Zabezpieczenia poza modelem; brak 67/67N/21/87/25/50BF/grup/TRIP; brak relacji zabezpieczenie → chroniona gałąź | mapa dom. 4, synteza §1 p. 20 | W4 |
| Uziemienie ×6, `meta.field_specs`, TT/IT bez fizyki, rozpływ niesymetryczny bez konsumenta | mapa dom. 1/7 | W5 |
| SLD: semantyka w kliencie, trzy magazyny nadpisań | mapa dom. 8 | W7 |
| Sieć kompensowana G01 end-to-end (NOT_BUILT) | mapa dom. 3/7 | W8 |
| Dobór przekroju, BOM, pakiet do podpisu, rejestr założeń, koszty (OD-16), `NetworkVariation` | mapa §5 „wyjścia do Excela" | W10 |
| Dane zewnętrzne (karty producentów, IRiESD/programy ramowe, BIL, degradacja baterii) | mapa §7 OD-17/OD-21 | właściciel |

---

## 4. ZADANIE BIEŻĄCE

Odbiór fali 3 W3 (`c307e95f`: łańcuch przedpushowy → sygnatury → push → CI 9/9 → wpisy mapa/karta/evidence) ·
odbiór V12.7 i W3-J (agenci) · **W6-0**: karty S-1+S-4, S-2 (agenci, worktree na bazie po pushu), S-3 (po S-1),
S-5 (ten dokument i supersesje — wykonane w tej kolejce) · projekt W6-1 (kontrakty czasu) — architekt.

## 5. KOLEJNOŚĆ DALSZEJ PRACY

Synteza §5 (wiążąca): W3 (odbiór) → W6-0 → W5 → W4 → W6-1/W6-2 (równolegle z W5) → W8 → W6-3…W6-8 → W7 → W9 → W10
→ W11 → W12. Decyzje właściciela otwarte: mapa §7 (OD-13…OD-23) + evidence §I (OD-1…OD-9).

## 6. ZASADY UTRZYMANIA TEGO REJESTRU

1. Liczby wyłącznie z pomiaru (data + drzewo); żadnych deklaracji „PODPIĘTE"/„DZIAŁA" bez konsumenta w ścieżce
   użytkownika (ZASADA NR 1).
2. Każdy odbiór wycinka aktualizuje §1 (zdrowie) i §4 (zadanie bieżące); szczegóły idą do evidence, nie tutaj.
3. Sprzeczność między tym rejestrem a kodem = defekt rejestru; naprawiany w tej samej kolejce, z wpisem supersesji.
