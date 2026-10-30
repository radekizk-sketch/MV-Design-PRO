# Przekazanie karty WERDYKT-MIGRACJA-190

Gałąź `claude/mv-design-pro-twin-audit-u4lhy0-werdykt-migracja`, drzewo `/home/user/wt-werdykt`.
Cel karty: lista `scripts/werdykt_wyjasnialny_allowlist.json` bez wpisów MIGRACJA (strażnik
`scripts/werdykt_wyjasnialny_guard.py`). Stan bazowy karty (`b1e677ced`): MIGRACJA 190,
ENUM_WEWNETRZNY 49. Stan teraz: **MIGRACJA 23, ENUM_WEWNETRZNY 65** (strażnik RC=0).

## Domeny

| Domena | MIGRACJA przed | MIGRACJA teraz | Stan |
|---|---|---|---|
| 1. Wyposażenie stacji, dobór przekładników, aparatura | 21 | 0 | zmigrowane (commit grupy 1); dowód doboru aparatury `equipment_proof` (C33 ×3) zmigrowany w commicie C33 (opis w wierszu domeny 8); **C40 `protection_settings` zmigrowany**: `ThermalWithstandResult.ocena` (rekord W) i `ith_1s_a` zamiast `is_adequate`; sprawdzenie cieplne linii w silniku nastaw I>/I>> deleguje do `check_conductor_thermal_withstand` (jedna fizyka i jeden rekord z dowodem cieplnym przewodów), wzór I_dop = s·j_thn/√t w jednej funkcji `prad_dopuszczalny_zyly_a` (dawniej trzy kopie: sprawdzenie cieplne, I>> i SPZ); dane przyjęte rekordu: I_th = I″k,max (bez m, n IEC 60909-0 §12), t_w = 0,07 s, j_thn robocza dla materiału spoza tablicy (`ESTIMATED`, dowód niepełny); ekran nastaw pokazuje `EtykietaWerdyktu` i `KartaWerdyktu` rekordu |
| 2. Jakość wyniku (pasma wiarygodności, walidacja energetyczna, warunki przyłączenia, wytrzymałość cieplna) | 19 | 0 | zmigrowane (commit grupy 2) |
| 3. Werdykt projektowy, raport zgodności DER-SN, ekran oceny, wniosek OSD | 11 | 0 | zmigrowane (commit grupy 3) |
| 4. Ocena normatywna, wrażliwość, profil napięć | 7 | 0 | zmigrowane — w commicie WIP (zweryfikowane celowo: pytest 5834 zielone przed naprawami strażników; po naprawach bieg zbiorczy przerwany) |
| 5. Wzorce odniesienia A i C (+ API, PDF/DOCX) | 18 | 0 | zmigrowane — w commicie WIP (testy wzorców i API 56+175 zielone, 4 iniekcje czerwone bez naprawy) |
| 6. Modele analiz: siła sieci B11, adekwatność Q B10, SSCI B12, wgląd zabezpieczeń B7 | 8 | 1 | siła sieci B11 zmigrowana (rekord K SCR na węzeł i WSCR, `verdict`/`is_weak` projekcją, front pulpitu OZE i kontekst sekwencji FRT z etykietą i kartą rekordu); adekwatność Q B10 zmigrowana (rekord W: rezerwy w górę/w dół każdego źródła wobec ε i pasmo napięcia węzłów; nasycenie i naruszenie projekcją rekordów; brak danych źródła ≠ wystarczająca); SSCI B12 zmigrowana (wyjaśnienie rekordu `NIE_OCENIONO` przy polu werdyktu, model i ładunek HTTP); B7 `ProtectionInsightItem.selectivity_status` ZATRZYMANE do decyzji architekta — klasa bez producenta w produkcji (wejście zawsze `None` w `pokrycie_analiz`/`wrazliwosc_rozplywu`), a ocena pokrycia odejmuje 5 pkt za „Brak analizy zabezpieczeń”, której nic nie dostarcza |
| 7. nN / SWZ (C25, C27, C29, C30, arkusz obwodów, E75, E77, fieldLabels) | 22 | 0 | zmigrowane: SWZ TN z rekordu W (`swz.tn`), dobór aparatu nN z rekordów K, arkusz obwodów z rekordami w komórkach; pakiet dowodowy obwodu nN (C30) — kroki 4–5 z rekordów doboru (jedna reguła), krok 6 jako dwa rekordy K zdolności wyłączania (kombinacja / goły aparat, `NIE_DOTYCZY` z powodem) ze wspólnej reguły `ocena_zdolnosci_wylaczania`, krok 7 z rekordu `th.ocena`, krok 10 z rekordu W SWZ (`swz_wymaganie`), agregat obwodu projekcją rekordów; nakładka SWZ i karta obwodu nN z etykiety rekordu (`tonRysunkuEtykiety`/`znakEtykiety` w `KartaWerdyktu.tsx`, jedna tabela warunków TN i TT/IT). ENUM_WEWNETRZNY: 4 koperty arkusza obwodów, koperta sekcji raportu nN, `communicationStatusLabel`, `BayRuntimeState.secondary_communication_status`, `BaySwitchState.communication_ok` (stan telemetrii / dostępność danych, nie ocena) |
| 8. Proof Engine / audyt (C41, C44, C48, A36, sc_symmetrical/asymmetrical) | 19 | 0 | zamknięte (C39 i C40 liczone w domenach 10 i 1): plakietka „Weryfikacja jednostek: PASS/FAIL” zdjęta z podsumowania LaTeX (C44 „stop printing”, jak DOCX; złote `tests/golden/sc_asymmetrical/*/proof.tex` −2 linie); flagi spójności jednostek opakowań SC3F/SC1 i widoki inspektora → ENUM_WEWNETRZNY. **Audyt 2 (A36/A37/B17) zmigrowany**: nowy moduł `network_model/catalog/audit2_oceny.py` (rekordy K/W trybów BESS, planu zaczepów, bilansu eksportu, wytrzymałości aparatu, współczynnika VT; jedna reguła limitu cieplnego `limit_cieplny_aparatu_ka` dla walidatora katalogu, dowodu i widoku pól), dowody pakietu niosą rekord W (`wymaganie`), pakiet `liczby_statusow` zamiast `all_pass`/`fail_count`, raport (tekst/LaTeX/PDF/DOCX/JSON) cytuje etykietę rekordu; walidatory `/catalog/audit2/validate-*` zwracają rekordy (VT: `voltage_factor` może być `null` → `NIE_OCENIONO`; nieznany typ uziemienia 422; aparat spoza katalogu 404); widok wytrzymałości pól: `wymaganie` zamiast `werdykt`; progi eksportu 0,8/1,5/3,0 bez podstawy usunięte (rekord `BRAK_PODSTAWY`); front: etykiety rekordów w pakiecie, przeglądzie technicznym E-04, walidacji VT, wytrzymałości aparatury i ekranie aparatury zwarć; `zbuduj_widok_wytrzymalosci_aparatury.status` → ENUM (koperta C26). **C48 `api.proof_pack` zmigrowany**: panel metody IEC 60909 wkładów maszyn bez statusu PASS/FAIL (pozycje to fakty biegu; dawne „Maszyny asynchroniczne: PASS” i „Powtarzalność: PASS” nie były ocenami), reguła małych silników p. 6.6 jako zdanie z wartością obliczoną, graniczną i skutkiem — JEDNO zdanie dla kroku wywodu i pozycji panelu; usunięte fałszywe „silniki pomijalne w Ib” (program liczy wkłady wszystkich maszyn); bez silników asynchronicznych reguła „nie dotyczy” zamiast „spełniona”. Front: `SladSekcyjny` bez ikon ✓/✗ i `data-status` (D22 ×3 zdjęte razem). Fikstury harnessu `zwarcia_wklady_scena_*` zregenerowane. **C33 `equipment_proof` zmigrowany**: nowy moduł `application/equipment_proof/oceny.py` — cztery rekordy K (izolacja U_s(U_n) ≤ U_m, wyłączanie I_b/I″k ≤ I_cu, dynamiczna, cieplna) i rekord W doboru; dynamiczna i cieplna z TEGO SAMEGO budowniczego co walidator katalogu i widok pól (`oceny_wytrzymalosci_aparatu`, limit `limit_cieplny_aparatu_ka`), podstawa wyłączania z `podstawa_kryterium_wylaczania` (wspólna z widokiem pól); `EquipmentProofCheckResult.ocena` zamiast `status`, `EquipmentProofResult.wymaganie` zamiast `overall_status`/`key_results`; brak danej aparatu → `BRAK_PODSTAWY`, brak wielkości biegu → `NIE_OCENIONO` (dawniej `FAIL`); kroki dowodu z polskimi tytułami, wynik kroku = etykieta rekordu, podstawienie z relacją `relacja_latex`; t_b roboczy pod I_b z maszynami = dana przyjęta rekordu; usunięte: kod „P11” w nazwie równania, wynik kroku „OK/PASS”, równanie energetyczne EQ_P12_006b (jeden limit cieplny). Inspektor dowodów: wymagane klucze podsumowania = klucze rekordów. |
| 9. Frontend pozostały (D18…D72, E20…E62, SLD v2 G1–G9, NnSwitchgearCard) | 38 | 10 | **SLD v2 G1–G9 i stacja T1–T4 zmigrowane** (odczyty szyn z rekordów K backendu, sekcja niżej); **kontyngencje N-1 zmigrowane** (rekordy K/W kategorii dotkliwości, sekcja niżej); **porównanie A/B D26 zmigrowane** (zdjęty próg okna „waga ≥ 4 → Poza zakresem”, sekcja niżej); **kompensacja D18 i LoM D19 zmigrowane** (sekcje niżej); **diagnostyka inspektora ENM E62 zmigrowana** (sekcja niżej); reszta (panel referencyjny E61, karta rozdzielnicy nN, nakładka przepływu zwarciowego, zgodność referencyjna) nietknięta |
| 10. Pozostałe (archiwum, importy, preflight B20, kreator C54, katalogi audit2, reference_engine) | 24 | 9 | w części przeklasyfikowane na ENUM_WEWNETRZNY z uzasadnieniem; **C39 `protection_read_model` zmigrowany** (sekcja niżej); **B20 pre-flight: `ready` usunięte, `PreflightCheckEntry.status` → ENUM_WEWNETRZNY** (sekcja E62); reszta nietknięta |
| FRT/HVRT A13 (`network_model/solvers/frt_hvrt/contracts.py`, `FrtHvrtResult.status`, `FrtScenarioResult.status`, `FrtScenarioResult.stayed_connected`) | 3 | 3 | ZATRZYMANE — rdzeń FROZEN z `scripts/rdzenie_b01.py` (wiersz „FRT/HVRT”), wymaga decyzji B-01 |

## Wspólni budowniczowie utworzeni w karcie

- `backend/src/analysis/normative/oceny.py` — rekord K reguły oceny normatywnej (`ocena_pozycji`, podstawa z konfiguracji).
- `backend/src/analysis/sensitivity/oceny.py` — rekord K zapasu wrażliwości (`ocena_zapasu`, `decyzja` jako projekcja).
- `backend/src/analysis/energy_validation/oceny.py` — rekord K pozycji walidacji energetycznej.
- `backend/src/application/reference_patterns/oceny.py` — rekord K sprawdzenia wzorca, rekord W wzorca, projekcje `status_sprawdzenia` / `werdykt_wzorca` / `opis_werdyktu`.
- `backend/src/analysis/sanity_bounds/oceny.py`, `backend/src/network_model/solvers/equipment_checks/oceny.py` — z grup 1–2.
- `backend/src/analysis/grid_strength/oceny.py` — rekord K siły sieci (`ocena_sily`, projekcja `klasa_sily`).
- `backend/src/analysis/reactive_adequacy/oceny.py` — rekordy K rezerwy i pasma, rekord W adekwatności Q.
- Wpisy `CapabilityEvidence` w `solver_input/provenance.py`: `sila_sieci.scr_wscr`, `adekwatnosc_q.rezerwa_i_pasmo`, `normatywna.ocena_dowodow`, `wzorzec_odniesienia.nastawy_i_bis`, `wzorzec_odniesienia.generacja_lokalna`, `wrazliwosc.zapas_kryterium`.

## Znane czerwone i niezweryfikowane

- Commity grup 1–3 weszły z czerwonymi strażnikami `nazwa_bez_identyfikatora_guard`, `polykanie_wyjatkow_guard`, `ui_production_codes_guard` i błędami typów testów frontu (`tsconfig_gate_guard`); naprawy są w commicie WIP i po nich te strażniki (oraz `no_codenames_guard`, `solver_input_substitute_guard`, `mypy_ratchet_guard` 163/20, `tsconfig_gate_guard`, `werdykt_wyjasnialny_guard`) dały RC=0 pojedynczo.
- Nieukończone: zbiorczy bieg pytest (`/tmp/claude-0/werdykt/testy_final.txt`, 137 ścieżek) przerwany na STOP przed startem (czekał na blokadę); pełny `guardy_z_ci.py` ostatnio zatrzymany limitem czasu na kroku testów własnych strażników.
- Vitest celowany (`src/ui/sld/v3/lv-domain`, `src/ui2/kreatory/edycja-parametrow`, `src/ui2/oze/ncrfg`, `src/ui2/oze/wniosek`, `src/ui2/spaces/wyniki`, `src/ui2/wyniki`): 131 plików / 2604 testy zielone; eslint zmienionych plików RC=0.
- Zapadka mypy obniżona 163/20 → 161/19 (pomiar: różnica zbiorów = 2 błędy `misc` w `analysis/grid_strength/builder.py`).
- Bieg zbiorczy `testy_final.txt` na `6bc155298` zakończony RC=143 (przerwany sygnałem przed startem pytest) — do powtórzenia na drzewie końcowym.
- Znaleziska do meldunku: dryf ostatniej cyfry rozpływu ~1e-11 (rdzeń NR FROZEN); wzorzec C bez ścieżki w API; API wzorców bez konsumenta frontu; selektywność wzorca A przy `ik_max_next_bus_a = 0` daje „spełniona: I_min = 0 A” (silnik nastaw).

## Naprawy weryfikacji zbiorczej `6bc155298`

Bieg zbiorczy na `6bc155298` (14071 zielonych, 10 czerwonych, 9 błędów środowiska — brak
`node_modules` w drzewie tymczasowym) wykazał skutki wcześniejszych grup, naprawione w commicie
WIP domeny 7: pin mapy pól i zapadki `solver_input_substitute_guard` (4510 pól, 606 plików,
45/208), pin testu zapadki mypy (161/19), tekst sanity z przecinkiem dziesiętnym, fikstura ekranu
kontyngencji i złoty hash `kontyngencje_n1/pierscien/pelny` (zmiana wyłącznie tekstu powodu
przeciążenia: „wobec limitu … (próg ostrzeżenia …)” zamiast „przekracza limit” — rozstrzygnięcie
niesie rekord K walidacji energetycznej; porównanie widoku przed/po: 2 linie tekstu, zero liczb).

## Domena 7 — zmiany semantyczne do oceny właściciela (B-02)

- Plakietka SWZ na rysunku nN dla kryterium spełnionego przy modelu niezwalidowanym pokazuje
  „SWZ ?” w tonie ostrzegawczym (rekord `BRAK_DOWODU`, „Brak wystarczającego dowodu”), a nie
  zielone „✓”; podpowiedź plakietki i kropki przeglądu niesie etykietę i zdanie rekordu. Zrzuty
  do wykonania przez `e2e/lv-domain-screenshot.spec.ts` (kadr `18_swz_overlay`) — bez werdyktu
  wizualnego agenta.
- Dowód obwodu nN: I2 wyłącznika MCCB z wyzwalaczem elektronicznym liczony z Ir (1,3·Ir) tak jak
  w doborze aparatu (wcześniej dowód i dobór miały dwie reguły); krok 7 bez podstawienia `0.0`
  za brak I²t (zapadka `solver_input_substitute_guard` 45/208 → 44/206).
- Iniekcje domeny 7: kombinacja MCB bez `NIE_DOTYCZY` → 10 testów pakietu czerwonych; status
  nakładki SWZ wymuszony na `SPELNIA` → 4 testy frontu czerwone.

## Znalezisko poza kartą (stan bazy karty)

`tests/golden/parytet_assemblera/test_parytet_assemblera.py` czerwony już na `b1e677ced`
(57 rozjazdów szkieletu `SC_1F_max`: nowe pole `doziemienie_sieci`/`brak_wyniku_zerowego`
z karty doziemienia SN); obszar `doziemienie_sn.py` jest poza granicą tej karty — do
regeneracji złotego pliku przez kartę ZU (zmiana zamierzona po jej stronie).

## Audyt 2 — zmiany kontraktu HTTP (nie addytywne, do meldunku)

- `POST /api/v1/catalog/audit2/validate-vt-grounding`: `{ocena, message_pl}` zamiast `{ok, message_pl}`; `voltage_factor` przyjmuje `null`.
- `POST …/validate-device-withstand`: `{wymaganie, message_pl, i_th_effective_ka, utilization_*}` zamiast `ok`/`i_dyn_ok`/`i_th_ok`; aparat spoza katalogu → 404.
- `POST …/validate-hosting-capacity-export`: `{station_id, p_*, p_net_export_kw, ocena, message_pl}`; usunięte `status` i `export_to_import_ratio`.
- `POST /api/v1/projects/{id}/audit2-station-config/_validate-all`: `liczby_statusow` zamiast `all_pass`; pakiety stacji bez `all_pass`/`fail_count`, dowody z `wymaganie` zamiast `pass_status`.
- `POST …/widok wytrzymałości aparatury` (`/api/cases/{id}/enm/wytrzymalosc-aparatury`): wiersz pola `wymaganie` zamiast `werdykt`.
- Snapshot OpenAPI zregenerowany (zmiana: `voltage_factor` nullable, opisy końcówek); ciała odpowiedzi to nietypowane słowniki.
- Fixtury frontu z backendu: `frontend/src/ui/network-build/station-der/__tests__/rekordyAudytu2.json`, `frontend/src/ui2/wyniki/zwarcia/aparatura/__tests__/rekordyWytrzymalosci.json` (generator `backend/tests/uczciwosc/generuj_fixtury_ocen_fe.py`, parytet `test_fixtury_ocen_fe.py`).
- Iniekcje audytu 2: relacja VT `NIE_MNIEJ` → `NIE_WIECEJ` i `dotyczy=True` dla trybów BESS → 6 testów backendu czerwonych; etykieta pakietu na stałe „Spełnia” → test pakietu czerwony; status wiersza aparatury na stałe `SPELNIA` → 6 testów ekranu czerwonych.
- Weryfikacja audytu 2: `guardy_z_ci.py` — jedyne czerwone (`polykanie_wyjatkow_guard`, pin pól `solver_input_substitute_guard`) naprawione i ponowione (aparat spoza katalogu w generatorze dowodu → `OdmowaDanychError`; pin pól 4508 → 4512, plików 606 → 607 z pomiarem); mypy zapadka 161/19 RC=0.
- Iniekcje C33: relacja izolacji `NIE_WIECEJ` → `NIE_MNIEJ` i `dotyczy=True` dla rozłącznika → 56 testów czerwonych (dowód doboru, iloczyn, parytet z `izolacja_pokrywa_siec`, założenia zaniku). Zapadka mypy 161/19 → 156/18 (5 błędów `arg-type` w `equipment_proof/generator.py` zniknęło, zero nowych); pin pól `solver_input_substitute_guard` 4512 → 4513, plików 607 → 608, application 255 → 256.
- Znalezisko C33: końcówka `POST /api/equipment-proof/pack` nie ma konsumenta we froncie (grep `frontend/src`, `frontend/e2e`: 0 trafień) — ścieżka użytkownika istnieje tylko przez API.
- Iniekcje C48: skutek reguły na stałe „pomijalne” i gałąź „brak silników asynchronicznych” wyłączona → 3 przypadki iloczynu czerwone; `data-status="PASS"` w pozycji panelu → test `sladSekcyjny` czerwony.

## C40 — wytrzymałość cieplna linii w silniku nastaw (domena 1)

- Defekt fizyczny naprawiony przy okazji: tablica `THERMAL_DENSITY` miała klucze `Cu`/`Al`/`AlFe`,
  a model ENM podaje `CU`/`AL`/`AL_ST` — linie miedziane i AFL po cichu dostawały j_thn aluminium
  94 A/mm² (dla AFL zawyżenie wytrzymałości o ok. 8 %, 94 zamiast 87). Teraz klucze `CU`/`AL`/`AL_ST`
  plus aliasy `ALFE`/`ACSR`, normalizacja `strip().upper()`, a materiał spoza tablicy dostaje jawną
  wartość roboczą 87 A/mm² (najmniejszą z tablicy, po stronie bezpiecznej) jako daną przyjętą
  `ESTIMATED` z notą walidacji. Usunięte ciche `94.0` w czterech miejscach (silnik ×3, wzorzec A).
- Usunięty cichy zacisk czasu zwarcia `t ≤ 0 → 0,1 s`; `ProtectionSettingsInput.__post_init__`
  odrzuca przekrój ≤ 0 i ujemne czasy (`ValueError`). Zapadka `solver_input_substitute_guard`
  44/206 → 44/204 (application 24/69 → 24/67), pin pól 4513 → 4515 (`dana_przyjeta`,
  `podstawa_wytrzymalosci`) — pomiar `contract_fields()` na `01b76169c` i na drzewie karty.
- Wzorzec A (`pattern_line_i_doubleprime_thermal_spz.py`) czyta I_th1s z wyniku silnika
  (`thermal.ith_1s_a`) zamiast powtarzać tablicę; fałszywy komentarz („wynik nie niesie materiału
  i przekroju”) usunięty.
- Fixtura frontu z backendu: `frontend/src/ui2/wyniki/koordynacja/__tests__/nastawyCieplne.json`
  (przypadki „wytrzymuje” → `BRAK_DOWODU`, bo I_th i t_w są danymi przyjętymi, oraz
  „nie wytrzymuje” → `NIE_SPELNIA`); fikstury katalogu zabezpieczeń (`test_vendor_adapter_v0`,
  `test_device_mapping_v0`, `test_vendor_elektrometal_etango_v0`) budują blok cieplny realną
  ścieżką silnika zamiast ręcznego rekordu.
- Iniekcje C40: tablica z dawnymi kluczami `Cu`/`Al`/`AlFe` → testy iloczynu kodów materiału
  czerwone (wynik w meldunku commita); etykieta plakietki na stałe „Spełnia” → 2 testy ekranu
  nastaw czerwone.
- Do decyzji architekta (metodyka, nie defekt): silnik nastaw liczy I_th1s z tablicy j_thn metody
  Hoppela, a nie z katalogowego `ith_1s_a` gałęzi; zmiana źródła zmieniłaby wyniki nastaw.
- Dług nazwany, nietknięty (inna klasa): czułość I> = 0 przy zerowym prądzie obciążenia
  (`B:ifexp:inp.ik2_min_end_a` w zapadce); `spz_allowed`/`blocking_recommended`/`overall_valid`
  nie są flagowane przez strażnik werdyktu.

## C39 — podsumowanie elementu widoku zabezpieczeń (domena 10)

- `verification_status` SPELNIONE/NIESPELNIONE/BRAK_DANYCH, `verification_reason`, stałe
  `margin_pct = None` oraz liczniki `verified_count`/`failed_count`/`no_data_count` usunięte:
  „SPELNIONE” wynikało z BRAKU diagnostyk, nie z oceny kryterium. Podsumowanie niesie
  `braki_danych_pl`, a `has_complete_data == not braki_danych_pl` (jeden predykat). Diagnostyka
  INFO jest brakiem także obok WARN/ERROR (dawniej tylko, gdy była jedyna).
- Test iloczynu `tests/application/test_protection_read_model_podsumowanie.py` (funkcje × diagnostyki).
- Znalezisko: liczniki podsumowania nie miały konsumenta we froncie (grep).

## SLD v2 — odczyty szyn stacji z rekordów K (domena 9, B-02)

- Generator `tests/reference_networks/station_archetype_substrate.py` niesie na szynę rekord K
  odchylenia napięcia (±10 % PN-EN 50160, budowniczy walidacji energetycznej) i dwa rekordy K
  wytrzymałości (cieplna, dynamiczna — `audit2_oceny`), zamiast flagi `verification.passed`
  i progu okna |ΔU| ≤ 5 %. Companions, presety G1–G9, archetyp OZE i plakietki stacji T1–T4
  czytają znak, ton i podpowiedź z etykiety i zdania rekordu.
- Zmiana wizualna do oceny właściciela (B-02, bez werdyktu agenta): pasmo napięcia ±10 % zamiast
  ±5 %, a kryterium spełnione przy modelu niezwalidowanym rysuje „?” w tonie ostrzegawczym zamiast
  zielonego „✓”.
- Test `frontend/src/ui/sld/v2/station-rozdzielnia/__tests__/odczytOcenSzyn.test.tsx`: renderer
  (G1–G9, archetyp OZE, T1–T4) × wielkość (U, I_cw, I_dyn) × semantyka rekordu (oryginalna /
  podmieniona na naruszoną przy tych samych liczbach). Iniekcja `znak: '✓'` → 9 czerwonych.
- `tests/application/test_oze_machine_archetypes.py` czyta rekordy K zamiast `verification.passed`.

## Kontyngencje N-1 — rekordy kategorii dotkliwości (domena 9)

- Nowy moduł `backend/src/application/analyses/kontyngencje_n1_oceny.py`: każda kontyngencja
  i stan bazowy niosą `oceny` = K odbiorów bez zasilania (limit 0) oraz W przeciążeń i W odchyleń
  napięcia (składowa „największa” i składowa „niewyznaczone” z powodami); bieg niezbieżny →
  `NIE_OCENIONO`, element wykluczony → `NIE_DOTYCZY` z powodem. `ocena_pozycji` walidacji
  energetycznej przyjmuje zakres, przedmiot i sufiks kryterium. `CapabilityEvidence`
  `rozplyw.kontyngencje_n1` (UNVALIDATED_MODEL).
- Front: karty rekordów w panelu bazowym i szczegółów, znacznik rankingu ze statusu rekordu
  (dawniej `licznik > 0`); usunięty tekst „bez naruszeń”. Zmiana wizualna do B-02.
- Ładunek: ok. 37 KB rekordów na kontyngencję (fikstura 5 wariantów 184 KB); ranking bez rekordów.
- Złote hashe `kontyngencje_n1/golden/pelny` i `pierscien/pelny` zmienione wyłącznie kluczem
  `oceny` (widok bez `oceny` równy sprzed zmiany — test `test_widok_bez_ocen_rowny_widokowi_sprzed_rekordow`).
- Iniekcje: sortowanie składowej rosnąco → 2 czerwone (backend); znacznik z licznika → 3 czerwone (front).

## Porównanie A/B — bez progu wagi okna (D26, domena 9)

- Waga problemu (`ISSUE_SEVERITY_MAP` backendu) porządkuje różnice A/B, nie jest wymaganiem.
  Usunięte cztery miejsca progu `WAGA_PROG_TAG = 4` (`naWierszeRankingu`, `naWierszeRankinguZabezpieczen`,
  `poza`, `pozaZabezpieczenia`) wraz z mapami wag oraz dopisek „poza zakresem” delty strat przy
  `total_issues > 0` (przypisywał stratom każdy problem). Znacznik „Poza zakresem” zapalał się na
  każdej delcie elementu, także niezwiązanej z problemem.
- Akcja inspekcyjna „Pokaż na schemacie” czyta obecność elementu w rankingu backendu
  (`elementyZRankingu`, `trybDecyzji="zawsze"`), nie próg wagi.
- Testy: waga 1–5 × miejsce (ranking, delty szyny, gałęzi, zabezpieczeń, podsumowanie) oraz
  zakładka × waga × obecność w rankingu (ekran). Iniekcja przywracająca próg → 10 czerwonych.

## Kompensacja — rekord W doboru baterii (D18, domena 9)

- Nowy moduł `backend/src/application/analyses/dobor_kompensacji_oceny.py`: każdy kandydat niesie
  rekord W `kompensacja.cosfi_punktu` nad K `kompensacja.cosfi_punktu.{dzien,noc}` (NIE_MNIEJ,
  limit = wymagany cosφ z zapytania projektanta, podstawa jawnie „założenie projektanta”).
  Usunięte flagi `spelnia_dzien`/`spelnia_noc`/`spelnia` i `_meets` (cosφ `None` dawało po cichu
  „nie spełnia”). Pomiar bez wyniku niesie powód (`odmowa obliczenia wariantu`, `brak zbieżności`,
  `punkt bez gałęzi zasilających`) → K `NIE_OCENIONO` z powodem w brakach.
- Dobór = pierwszy kandydat z rozstrzygnięciem liczbowym `SPELNIA` TEGO SAMEGO rekordu
  (`spelnia_liczbowo`); powód braku doboru liczy kandydatów nierozstrzygniętych osobno.
- Nowa zdolność dowodowa `kompensacja.dobor_baterii` (UNVALIDATED_MODEL) w
  `solver_input/provenance.py`; pin `scripts/test_solver_input_substitute_guard.py` 609→610 plików
  i 257→258 w application (nowy plik importuje rejestr zdolności — zmierzone).
- Front: kolumna werdyktu czyta `wymaganie.etykieta` (spełnienie liczbowe na modelu niezwalidowanym
  = „Brak wystarczającego dowodu”), sekcja doboru pokazuje `KartaWerdyktu` rekordu dobranego
  kandydata — **zmiana wizualna do oceny właściciela (B-02)**.
- Złote hashe: cztery scenariusze rodziny kompensacji zmienione wyłącznie kluczem `wymaganie`;
  sonda rzutująca W z powrotem na stare flagi odtwarza stare hashe (`rozne: []`).
- Rozmiar ładunku: ok. 21 KB na kandydata.
- Testy: iloczyn zakres scenariuszy × stan dnia × stan nocy (6 stanów, w tym trzy powody braku),
  dobór z rekordu, noc bez rozwiązania, determinizm; front: scenariusz × stan. Iniekcje:
  `!= "NIE_SPELNIA"` jako predykat doboru → 25 czerwonych; zgubione braki → 31 czerwonych;
  front: etykieta z flagi → 1 czerwony.

## LoM — klasa koloru z jedynej mapy semantyki (D19, domena 9)

- Usunięta własna mapa `istotnoscLom`/`IstotnoscTaguLom` ekranu; klasa tagu i chipu przechodzi
  przez `tonRysunkuEtykiety` (`KartaWerdyktu.tsx`). Sufiksy klas CSS przemianowane na nazwy tonów
  (`zielony`/`czerwony`/`bursztynowy`/`szary`), bo sufiks `ok` był słownikiem werdyktu bez rekordu.
- Test: cztery semantyki etykiety → klasa. Iniekcja (stała klasa „szary”) → 3 czerwone (czwarty przypadek to semantyka neutralna, zgodna ze stałą).

## Diagnostyka modelu — nagłówek z faktów, I-D01 z macierzy (E62, B20)

- Defekt klasy „predykaty parami”: reguła I-D01 („Wszystkie analizy dostępne — model jest
  kompletny”) czytała same blokady, a macierz dostępności blokowała zwarcie 1F także
  ostrzeżeniem E-D06 (linie bez Z0). Scena harnessu `diagnoza_scena_diagnostyka` niosła oba
  naraz. Teraz `rule_i_d01_full_analysis_available(matrix)` czyta macierz (silnik liczy macierz
  przed I-D01), komunikat nie twierdzi, że model jest kompletny; zdanie kodu I-D01 w
  `ui2/spaces/obliczenia/diagnoza/kodyDiagnozy.ts` poprawione tak samo.
- Usunięta zbiorcza flaga `PreflightReport.ready = status ≠ FAIL` (mówiła „Gotowy do analizy”
  przy zablokowanym zwarciu 1F i „Analiza zablokowana” przy dostępnych zwarciach, gdy blokada
  dotyczyła samego rozpływu). Jedynym konsumentem był nagłówek `PreflightMatrix`; zmiana
  kontraktu HTTP `GET …/diagnostics/preflight` (pole usunięte, nie addytywne) — typy front
  (`ui/enm-inspector/types.ts`, `ui2/.../diagnozaApi.ts`) i fikstury harnessu zaktualizowane.
- Front: `ui/enm-inspector/naglowekDiagnostyki.ts` — nagłówek panelu diagnostyki mówi, co
  wskazały reguły (liczby z backendu), brak zgłoszeń ma ton neutralny zamiast zielonego
  „Model poprawny”; nagłówek pre-flight „Dostępne analizy: N z M” z listy `checks`. Usunięte
  `STATUS_LABELS_PL` i trójskładnik koloru statusu. **Zmiana wizualna do oceny właściciela (B-02).**
- `PreflightCheckEntry.status` (AVAILABLE/BLOCKED) → ENUM_WEWNETRZNY: dostępność analizy z
  powodem i kodami blokad obok, nie werdykt zgodności.
- Testy: macierz z analizą zablokowaną (żadna, każda z czterech) × macierz pusta; iloczyn
  dziewięciu grafów testowych z predykatem parami „I-D01 ⇔ macierz nic nie blokuje”; regresja
  E-D06; front: blokady {0,1} × ostrzeżenia {0,2}, dostępne analizy {0, część, wszystkie, brak},
  render na fiksturach backendu. Iniekcje: I-D01 ignorujące E-D06 → 6 czerwonych (backend);
  nagłówek pre-flight bez tonu ostrzegawczego → 2 czerwone (front).
- Obserwacja poza klasą werdyktu (do decyzji architekta): reguła E-D06 zakłada, że linia z
  `type_ref` ma Z0 („Catalog types may have Z0 — assume available”), bo `LineBranch` grafu nie
  niesie składowej zerowej — dostępność zwarcia 1F z domysłu, nie z danych.

## Naprawa przy okazji commitu łącznego

- `backend/tests/ci/test_mypy_ratchet_guard.py` przypinał 161/19, choć commit C33 (`01b76169c`)
  obniżył zapadkę w `scripts/mypy_ratchet_guard.py` do 156/18 — test był czerwony od `01b76169c`.
  Pin poprawiony do 156/18 z komentarzem pomiaru; `mypy_ratchet_guard.py` na drzewie karty:
  156 błędów w 18 plikach, RC=0.

## Pierwszy krok następcy

Domeny 1, 6, 7 i 8 zamknięte; C40, C39, SLD v2, kontyngencje N-1 i porównanie D26 w commicie łącznym.
Kompensacja D18 i LoM D19 w osobnym commicie. E62/B20 w osobnym commicie. Dalej: reszta domeny 9 (panel referencyjny E61, E36, NnSwitchgearCard,
E20, zgodność referencyjna D71/D72) i domeny 10 (archiwum, importy, C36, C54, B20, A17,
reference_engine); B7 i FRT A13 czekają na decyzje.
