# SLD nN — FINAL ACCEPTANCE REPORT

**Mandat:** „FABLE — MASTER PROMPT WYKONAWCZY — PROFESJONALIZACJA SLD nN DO
POZIOMU ABB / DIgSILENT POWERFACTORY" (tryb AUDYT → IMPLEMENTACJA → TESTY →
VISUAL QA → KOREKTA → POWTÓRZENIE). **Data:** 2026-09-02. **Gałąź:**
`codex/b02-lv-domain-projection-v1`. **Wykonawca:** Fable (architekt/nadzór/
wykonanie). **Werdykt wizualny B-02 należy do właściciela** — ten raport
podaje dowody, pomiary i samoocenę względem bramek §50; NIE wystawia
werdyktu B-02.

## 1. Zakres i przebieg (iteracje §48/§49)

Pętla „render → ocena → korekta → powtórzenie" wykonana **11 razy** na
rzeczywistym ekranie L2 nN (`lv-domain-harness.html`, Playwright, Chromium,
20 kadrów §47, oba motywy, LOD 0/1/2, mobile, druk mono A3). Każda iteracja:
uruchomienie aplikacji (Vite), zrzut, ocena kadr po kadrze, korekta u
źródła (backend / kompozytor / renderer / gramatyka), ponowny zrzut.
Iteracje 1–2: struktura (sloty, incomer na krańcu, kotwica SN, zaciski
aparatów); 3–5: kolizje etykiet, wyspy, znaczniki, relay, druk/mobile,
profil napięć (defekt backendu); 6–8: orientacja pionowa oznaczeń, plakietki
podrozdzielnic, parametry kabli; 9–11: pozycje etykiet kabli, dolna granica
pisma (TERTIARY), łamanie wyrazów na dywizie.

## 2. Audyt stanu zastanego (§3) — 20 problemów ekranu L2 nN

| # | Problem zastany | Status | Dowód |
|---|---|---|---|
| 1 | energizacja liczona w rendererze (BFS) | usunięty — stany z `buses[]/segments[]/islands[]` backendu | `composeLvDomainScene.test.ts` (zero kolejki/odwiedzonych/while; pass-through stanów) |
| 2 | jeden stan na aparat (brak strony A/B) | dwa kikuty `#a/#b` w stanach własnych zacisków | `energizacja.test.tsx` [10]/[11] |
| 3 | sprzęgło jako „kreska" | QBC = aparat poziomy z glifem stanu i dwoma kikutami | [02]/[03] |
| 4 | dwie kotwice SN dla wspólnego zasilania | jedna kotwica na `equivalent_id`/`upstream_system_id` | [04]/[05], `composeLvDomainScene.test.ts` |
| 5 | brak nazw źródeł SN (refy `src`) | `upstream_source_names` z ENM („GPZ Północ") | kadr 02/04 |
| 6 | DER „ikona na sekcji" | pełny tor QF → kabel → CT → źródło; przekaźnik z kodami ANSI | kadr 12 |
| 7 | odbiory bez pola nieodróżnialne | odbiór wprost na szynie + NN-AUD-07 ze znacznikiem | kadr 13 |
| 8 | wyspa DER bez zdolności źródła | GRID_FOLLOWING / GRID_FORMING / DUAL_MODE / UNKNOWN z ENM; wyspa ENERGIZED/DEENERGIZED/UNKNOWN | kadry 07/08/09 |
| 9 | brak N/PE i bilansu wyspy | `neutral_reference`, `power_balance`, `island_operation_allowed` (null = nieoceniona) | kadr 08 |
| 10 | „bez napięcia" sugerowało pomiar | „NIEZASILONA (WG AKTUALNEJ TOPOLOGII)" + `energization_basis_pl` | kadr 10 |
| 11 | brak konfliktu/wielostronności | CONFLICT (podwójna kreska) i MULTISOURCE (TA, TB) | kadry 03/06 |
| 12 | brak audytu topologii | NN-AUD-01…17, panel audytu, jeden znacznik na komunikat | `audit.py`, kadr 08/13 |
| 13 | wyniki bez pochodzenia | plakietki z normą · przebiegiem · statusem; NIEAKTUALNY pokazywany | kadry 16/17 |
| 14 | nakładka spadków napięcia zawsze pusta | **defekt backendu**: profil kluczowany UUID solvera vs refy ENM — naprawiony u źródła | `test_projection_v1.py::test_profil_napiec_kluczowany_referencja_enm_szyn_domeny` |
| 15 | SWZ bez pochodzenia | „pętla zwarcia IEC 60364-4-41 liczona z modelu ENM rN (bez przebiegu)" | kadr 18 |
| 16 | kolizje etykiet (nazwy, plakietki, przekaźniki) | sloty rastrowane, etykieta sekcji za pionem, plakietki za końcem kreski / nad podrozdzielnicą, zawijanie z łamaniem, orientacja pionowa | kadry 11/14/15/16/17 |
| 17 | incomer liczony jako odpływ (SWZ/arkusz) | **defekt backendu** klasy: `incomer_branch_refs` w `route.py` + oba konsumenty | `test_route_incomer.py` |
| 18 | kryptonimy/angielskie identyfikatory na kanwie | `upstream_network_topology_invalid` → opis po polsku; guardy kryptonimów/terminów zielone | `no_codenames_guard`, `forbidden_ui_terms_guard` |
| 19 | mobile nieczytelny (glify zlane) | symbole z sufitem udziału w slocie, fit „zmieść wszystko", nazwa sekcji zawijana | kadr 19 |
| 20 | druk mono tracił stany | paleta mono + nośniki geometryczne (wzór kreski, glif, etykieta) | kadr 20, `energizacja.test.tsx` (mono) |

## 3. Architektura (§2) — LV Domain Projection zachowana

Jedna sieć obliczeniowa (ENM), dwie projekcje; portal na terminalu nN bez
zmian; **jeden kontrakt** `LvDomainProjectionV1` **3.0.0** (addytywny
względem 2.0.0: nowe kolekcje `devices/segments/sections/supply_paths/
measurements/protection_assignments`, pola stanów szyn, wysp, tożsamości SN,
`validation_messages`); LOD 0/1/2 na jednej geometrii; świeżość wyniku
FRESH/OUTDATED/NONE. Klient odrzuca odpowiedź bez stanów szyn / komunikatów
audytu (`projectionApi.ts`). Kanon: `docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md`
(rewizja 3.0.0).

## 4. Semantyka elektryczna (§1/§5/§6/§14–§17)

- **Łączność ≠ stan łącznika ≠ energizacja** — trzy osie na każdym odcinku
  (`connectivity_state`, `device_state`, `from/to_terminal.energization_state`).
- **Energizacja dwustronna** (scenariusz 11): otwarty QF-B3 ma zacisk A w
  wyspie sieciowej i zacisk B w wyspie magazynu — obie strony ENERGIZED,
  żaden kikut nie jest wygaszony.
- **Wyspy**: z siecią (grid) / bez sieci; źródło tworzące → ENERGIZED,
  podążające → DEENERGIZED, nieznane → UNKNOWN (kreska kropkowana + „?");
  ≥2 systemy SN spięte → CONFLICT; >1 źródło → MULTISOURCE.
- **N/PE i bilans**: `neutral_reference` (TN-C-S / brak układu / brak
  źródła — SWZ nieoceniane), `power_balance` z jawną podstawą („suma mocy
  znamionowych z modelu — dane źródłowe, nie wynik rozpływu").
- **§17**: ENM nie niesie pomiarów obecności napięcia → stany są
  topologiczne, `measured_voltage_states = {}` jawnie, etykieta
  „NIEZASILONA (WG AKTUALNEJ TOPOLOGII)".

## 5. Symbolika (§4/§7/§9/§12)

Rejestr `symbolRegistry.ts`: typ ENM → glif · klasa QF/QS/FU/QBC/W · nośnik
stanu (`wypelnienie`/`noz`/`brak`); snapshot glifu per typ × stan
(`__snapshots__/symbolRegistry.test.tsx.snap`), OPEN ≠ CLOSED geometrycznie
dla typów ze stanem, identyczne dla wkładki/przewodu. Transformator 62 px
(−26 %) z jawnymi zaciskami SN/nN i hierarchią tabliczki; DER wg `gen_type`;
CT/VT wg `measurement_type`; przekaźnik z kodami ANSI (≤2 wprost, ≥3 →
pierwszy + licznik; pełna lista w podpowiedzi i panelu odpływu).

## 6. Układ, typografia, LOD (§8/§20–§30/§41–§44)

Raster 8 (każda pozycja), sloty `feederGap 128`, incomer na krańcu sekcji
(ostatnia sekcja lustrzana), podrozdzielnica jako kreska od punktu wejścia z
etykietą za pionem, zejścia liści ortogonalne, przekaźnik obok kikuta
dolnego. Fit 70–85 % z clampem i skalą „zmieść wszystko" na wąskim ekranie.
Cztery poziomy graficzne (topologia / etykieta główna / dane inżynierskie /
stan i wyniki), typografia screen-stable (PRIMARY 14 / SECONDARY 11 /
TERTIARY 9,5 — żaden tekst poniżej), symbole screen-stable z sufitem udziału
w slocie, zawijanie nazw z łamaniem wyrazów (nigdy poza slot), orientacja
oznaczeń aparatów PIONOWA dla całej sceny, gdy slot przy skali fitu nie
mieści najdłuższego oznaczenia (kadry 11/14/15). LOD: jedna geometria, filtr
`REJESTR_ELEMENTOW_KANWY`, odcisk toru identyczny na 0/1/2 (`lod.test.tsx`).

## 7. Wyniki i pochodzenie (§18/§19/§35/§36)

Plakietki Ik″3/ip/Ith (IEC 60909), U/u, ΔU, SWZ (Ik₁min · Ia wym. · t) —
wartość == wartość backendu (zero przeliczeń), zawsze z pochodzeniem (norma
· przebieg · aktualny/NIEAKTUALNY). Wynik NIEAKTUALNY jest pokazywany jako
nieaktualny, nigdy ukrywany (NN-AUD-13). Plakietki sekcji głównej za końcem
kreski; podrozdzielnicy — nad kreską, zawijane do jej długości. Dane
źródłowe (tabliczki) i wyniki nie mieszają się.

## 8. Audyt topologii i stany błędów (§34/§39/§40)

`audit.py`: NN-AUD-01…17 (zacisk wiszący, odpływ osierocony, brak źródła,
DER odizolowany, łączność między poziomami napięć, konflikt, brak aparatu,
brak N/PE, wyspa bez źródła tworzącego, wspólne zasilanie SN (INFO),
nieprawidłowe przyłączenie TR, sprzęgło niemożliwe, wynik nieaktualny,
zdolność DER nieznana, zasilanie wsteczne, wiele źródeł tworzących, deficyt
mocy wyspy). Jeden znacznik „!" na komunikat (na szynie, gdy jest wśród
referencji), panel audytu z referencjami do wskazania, INFO bez znacznika.
Stan „brak danych" projekcji → uczciwy komunikat; kotwica SN bez
równoważnika → „Sk″/Ik″ SN: brak danych — <powód po polsku>".

## 9. Scenariusze §47 i zrzuty przed/po

Scenariusze 01–18 to modele ENM w backendzie (`scenariusze_nn.py`),
wyeksportowane do `frontend/src/ui/sld/v3/lv-domain/fixtures/generated/`
(pin JSON == backend). Kadry 19 (mobile 390×844, LOD 0) i 20 (druk mono A3)
używają scenariuszy 15 i 02.

| Kadr | Po (2026-09-02) | Przed (2026-09-01, poprzednia architektura fixtur ręcznych) |
|---|---|---|
| 01–18 | `docs/audit/visual/nn/<slug>[_lod<n>]_{light,dark}.png` | `docs/audit/visual/lv_domain_{multi_qbc-open,multi_qbc-closed,stationC,island}_lod<n>_{light,dark}.png` |
| 19 mobile | `docs/audit/visual/nn/19_mobile_overview_lod0_{light,dark}.png` | brak (nie istniał) |
| 20 druk A3 | `docs/audit/visual/nn/20_print_a3.png` | brak (nie istniał) |
| SWZ | `docs/audit/visual/nn/18_swz_overlay_*.png` | `docs/audit/visual/lv_domain_multi_overlay-swz_lod2_dark.png` |

Różnice widoczne przed/po: energizacja obu stron aparatu, sprzęgło jako
aparat, jedna kotwica SN z nazwą GPZ, zaciski SN/nN transformatora, pełne
tory DER z CT i przekaźnikami, etykiety bez kolizji, plakietki z
pochodzeniem, wyspy z N/PE i bilansem, mobile i druk mono.

## 10. Testy (§46) i regresja pełna

| Stos | Zakres | Wynik |
|---|---|---|
| backend pytest (pełny) | 10 512 testów | **10 512 passed, 11 skipped** (530 s) |
| backend lv_domain + API | `test_projection_v1.py`, `test_energization.py`, `test_audit.py`, `test_route_incomer.py`, `test_scenariusze_nn.py` (JSON == backend), `test_lv_domain_api.py` | 178 passed |
| ruff / black / mypy (moduły dotknięte) | `lv_domain/**`, `fault_loop/route.py`, skrypt eksportu | czysto |
| frontend vitest lv-domain (10 plików) | scenariusze, projectionApi, symbolRegistry (snapshoty), composeLvDomainScene, energizacja, lod, visualGrammar, motyw, LvDomainView, portal | **248 passed** |
| frontend vitest pełny (`--no-file-parallelism`) | cały projekt | patrz §10a |
| tsc `--noEmit` / eslint (pełny) | cały frontend | czysto (0 błędów) |
| Playwright e2e | `e2e/lv-domain-screenshot.spec.ts`, 20 kadrów z asercjami semantycznymi | **20 passed** (×11 iteracji) |
| guardy | lv_domain_projection, no_codenames, forbidden_ui_terms, ui_terminology, dead_click, dialog_completeness, local_truth, overlay_no_physics, ui_no_physics, trace_ui_leak, arch, repo_hygiene, docs, docs_archive, utf8_mojibake, sld_determinism, physics_label | wszystkie 0 |

Testy obowiązkowe §46 — mapowanie: otwarty wyłącznik góra/dół →
`energizacja.test.tsx` [10]; energizacja dwustronna → [11]; QBC → [02]/[03];
wyspa podążająca vs tworząca → [07]/[08] (+[09] nieznana); wspólne źródło
nieduplikowane → [04]; wielostronność → [03]; świeżość → [16]/[17]/[01];
LOD zachowuje topologię → `lod.test.tsx`; zero BFS w rendererze →
`composeLvDomainScene.test.ts`; snapshoty rejestru → `symbolRegistry.test.tsx`.

### 10a. Regresja pełna vitest

Pełny przebieg `vitest run --no-file-parallelism` (cały frontend, ~537
plików) uruchomiony po ostatniej zmianie kodu; w chwili pierwszego commitu
tego raportu przebieg trwał (pojedynczy pełny przebieg na tej maszynie
zajmuje ponad godzinę). Wynik jest dopisywany poniżej w osobnym commicie —
nie jest deklarowany z góry.

Wynik: **(w toku — patrz kolejny commit)**.

## 11. Bramki §50 — samoocena wykonawcy (NIE werdykt B-02)

| Bramka | Próg | Samoocena | Uzasadnienie / pozostałości |
|---|---|---|---|
| A. Topologia | ≥ 9 | 9 | 18 scenariuszy odwzorowane 1:1 z ENM (incomer, odpływy, sprzęgła, podrozdzielnice, DER z torem, granice); tożsamość SN; zero BFS w UI. Pozostałość: równoważnik SN nieobliczalny dla niezależnych źródeł (ograniczenie zarejestrowane §12). |
| B. Symbolika | ≥ 9 | 9 | rejestr per typ, stany geometryczne, QBC jako aparat, TR z zaciskami, CT/VT, przekaźniki. Pozostałość: ≥3 kody ANSI na glifie jako „pierwszy + licznik". |
| C. Stany | ≥ 9 | 9 | zaciski A/B, odcinki, wyspy (4 zdolności), N/PE, bilans, dopuszczalność, konflikt, wielostronność, świeżość; mono bez utraty. Pozostałość: stany topologiczne (ENM bez pomiarów) — jawne w §17. |
| D. Układ | ≥ 9 | 9 | raster, sloty, fit, zero kolizji w 20 kadrach po 10 iteracjach, orientacja pionowa w gęstych scenach, mobile i druk. Pozostałość: gęste sceny (≥3 poziomy podrozdzielnic) schodzą do pisma TERTIARY na oznaczeniach — czytelne, ale małe. |
| E. Typografia i wyniki | ≥ 8,5 | 9 | cztery poziomy, screen-stable, pochodzenie wyniku na każdej plakietce, NIEAKTUALNY jawny, SWZ trójstanowe. |

Samoocena jest deklaracją wykonawcy po 10 iteracjach visual QA. Bramkę
zamyka ocena właściciela na zrzutach `docs/audit/visual/nn/`.

## 12. Ograniczenia zarejestrowane (nie ukryte)

1. **Dwa niezależne źródła SN = dwa węzły SLACK.** Zamrożony rdzeń
   (`network_model/core/graph.py::_validate_single_slack`, B-01) odrzuca taki
   graf → kotwice SN meldują `brak danych: upstream_network_topology_invalid`
   (po polsku na kanwie); tożsamość systemów i nazwy źródeł są rysowane z
   grafu ENM (scenariusze 05/06). Zmiana rdzenia wymaga zgody właściciela.
2. **ENM nie niesie pomiarów obecności napięcia** — stany są topologiczne
   (§17), `measured_voltage_states = {}` i `energization_basis_pl` jawne.
3. **Zdolność pracy wyspowej DER bez nowego pola Pydantic** — czytana z
   `meta.island_capability` → `meta.control_mode` →
   `materialized_params.control_mode` → klasa maszyny → UNKNOWN; nowe pole
   modelu zmieniałoby `compute_input_hash` każdego modelu z generatorami.
4. **Glif przekaźnika mieści dwa wiersze** — ≥3 funkcje jako „pierwszy +
   licznik", pełna lista w podpowiedzi glifu i panelu odpływu.
5. **Gęste sceny** (12 odpływów / 3 poziomy podrozdzielnic na 1400 px)
   schodzą do pisma TERTIARY i orientacji pionowej oznaczeń — czytelne, ale
   docelowo wymagają kamery (zoom) w powłoce, której harness nie ma.

## 13. DoD §51 i następne kroki

- [x] Kontrakt 3.0.0 backend + frontend, klient odrzuca kształt niepełny.
- [x] 18 scenariuszy jako ENM, JSON == backend, frontend bez ręcznej energizacji.
- [x] Rejestr symboli + snapshoty; gramatyka wizualna + tokeny `--sld-*`.
- [x] Kompozytor/renderer: zaciski A/B, QBC, kotwica SN, sloty, LOD, wyniki z pochodzeniem, audyt, wybór toru, mobile, druk.
- [x] Testy §46 (backend + vitest) i pełna regresja backendu; guardy zielone; e2e 20 kadrów.
- [x] Dwa defekty backendu klasy naprawione u źródła (profil napięć po ref ENM; incomer ≠ odpływ).
- [x] Kanon zaktualizowany (`PROJEKCJA_SN_NN_PORTAL_V1.md` rewizja 3.0.0), INDEX.
- [ ] Werdykt wizualny B-02 — właściciel (zrzuty `docs/audit/visual/nn/`).
- [ ] Push — wyłącznie za wyraźną zgodą właściciela (commity lokalne na gałęzi).
