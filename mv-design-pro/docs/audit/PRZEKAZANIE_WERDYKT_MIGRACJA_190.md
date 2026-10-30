# Przekazanie karty WERDYKT-MIGRACJA-190

Gałąź `claude/mv-design-pro-twin-audit-u4lhy0-werdykt-migracja`, drzewo `/home/user/wt-werdykt`.
Cel karty: lista `scripts/werdykt_wyjasnialny_allowlist.json` bez wpisów MIGRACJA (strażnik
`scripts/werdykt_wyjasnialny_guard.py`). Stan bazowy karty (`b1e677ced`): MIGRACJA 190,
ENUM_WEWNETRZNY 49. Stan teraz: **MIGRACJA 49, ENUM_WEWNETRZNY 64** (strażnik RC=0).

## Domeny

| Domena | MIGRACJA przed | MIGRACJA teraz | Stan |
|---|---|---|---|
| 1. Wyposażenie stacji, dobór przekładników, aparatura | 21 | 4 | zmigrowane (commit grupy 1); 4 pozostałe to `equipment_proof` (C33) i `protection_settings` C40 — nietknięte |
| 2. Jakość wyniku (pasma wiarygodności, walidacja energetyczna, warunki przyłączenia, wytrzymałość cieplna) | 19 | 0 | zmigrowane (commit grupy 2) |
| 3. Werdykt projektowy, raport zgodności DER-SN, ekran oceny, wniosek OSD | 11 | 0 | zmigrowane (commit grupy 3) |
| 4. Ocena normatywna, wrażliwość, profil napięć | 7 | 0 | zmigrowane — w commicie WIP (zweryfikowane celowo: pytest 5834 zielone przed naprawami strażników; po naprawach bieg zbiorczy przerwany) |
| 5. Wzorce odniesienia A i C (+ API, PDF/DOCX) | 18 | 0 | zmigrowane — w commicie WIP (testy wzorców i API 56+175 zielone, 4 iniekcje czerwone bez naprawy) |
| 6. Modele analiz: siła sieci B11, adekwatność Q B10, SSCI B12, wgląd zabezpieczeń B7 | 8 | 1 | siła sieci B11 zmigrowana (rekord K SCR na węzeł i WSCR, `verdict`/`is_weak` projekcją, front pulpitu OZE i kontekst sekwencji FRT z etykietą i kartą rekordu); adekwatność Q B10 zmigrowana (rekord W: rezerwy w górę/w dół każdego źródła wobec ε i pasmo napięcia węzłów; nasycenie i naruszenie projekcją rekordów; brak danych źródła ≠ wystarczająca); SSCI B12 zmigrowana (wyjaśnienie rekordu `NIE_OCENIONO` przy polu werdyktu, model i ładunek HTTP); B7 `ProtectionInsightItem.selectivity_status` ZATRZYMANE do decyzji architekta — klasa bez producenta w produkcji (wejście zawsze `None` w `pokrycie_analiz`/`wrazliwosc_rozplywu`), a ocena pokrycia odejmuje 5 pkt za „Brak analizy zabezpieczeń”, której nic nie dostarcza |
| 7. nN / SWZ (C25, C27, C29, C30, arkusz obwodów, E75, E77, fieldLabels) | 22 | 0 | zmigrowane: SWZ TN z rekordu W (`swz.tn`), dobór aparatu nN z rekordów K, arkusz obwodów z rekordami w komórkach; pakiet dowodowy obwodu nN (C30) — kroki 4–5 z rekordów doboru (jedna reguła), krok 6 jako dwa rekordy K zdolności wyłączania (kombinacja / goły aparat, `NIE_DOTYCZY` z powodem) ze wspólnej reguły `ocena_zdolnosci_wylaczania`, krok 7 z rekordu `th.ocena`, krok 10 z rekordu W SWZ (`swz_wymaganie`), agregat obwodu projekcją rekordów; nakładka SWZ i karta obwodu nN z etykiety rekordu (`tonRysunkuEtykiety`/`znakEtykiety` w `KartaWerdyktu.tsx`, jedna tabela warunków TN i TT/IT). ENUM_WEWNETRZNY: 4 koperty arkusza obwodów, koperta sekcji raportu nN, `communicationStatusLabel`, `BayRuntimeState.secondary_communication_status`, `BaySwitchState.communication_ok` (stan telemetrii / dostępność danych, nie ocena) |
| 8. Proof Engine / audyt (C41, C44, C48, A36, sc_symmetrical/asymmetrical) | 19 | 0 | w toku: plakietka „Weryfikacja jednostek: PASS/FAIL” zdjęta z podsumowania LaTeX (C44 „stop printing”, jak DOCX; złote `tests/golden/sc_asymmetrical/*/proof.tex` −2 linie); flagi spójności jednostek opakowań SC3F/SC1 i widoki inspektora → ENUM_WEWNETRZNY. **Audyt 2 (A36/A37/B17) zmigrowany**: nowy moduł `network_model/catalog/audit2_oceny.py` (rekordy K/W trybów BESS, planu zaczepów, bilansu eksportu, wytrzymałości aparatu, współczynnika VT; jedna reguła limitu cieplnego `limit_cieplny_aparatu_ka` dla walidatora katalogu, dowodu i widoku pól), dowody pakietu niosą rekord W (`wymaganie`), pakiet `liczby_statusow` zamiast `all_pass`/`fail_count`, raport (tekst/LaTeX/PDF/DOCX/JSON) cytuje etykietę rekordu; walidatory `/catalog/audit2/validate-*` zwracają rekordy (VT: `voltage_factor` może być `null` → `NIE_OCENIONO`; nieznany typ uziemienia 422; aparat spoza katalogu 404); widok wytrzymałości pól: `wymaganie` zamiast `werdykt`; progi eksportu 0,8/1,5/3,0 bez podstawy usunięte (rekord `BRAK_PODSTAWY`); front: etykiety rekordów w pakiecie, przeglądzie technicznym E-04, walidacji VT, wytrzymałości aparatury i ekranie aparatury zwarć; `zbuduj_widok_wytrzymalosci_aparatury.status` → ENUM (koperta C26). **C48 `api.proof_pack` zmigrowany**: panel metody IEC 60909 wkładów maszyn bez statusu PASS/FAIL (pozycje to fakty biegu; dawne „Maszyny asynchroniczne: PASS” i „Powtarzalność: PASS” nie były ocenami), reguła małych silników p. 6.6 jako zdanie z wartością obliczoną, graniczną i skutkiem — JEDNO zdanie dla kroku wywodu i pozycji panelu; usunięte fałszywe „silniki pomijalne w Ib” (program liczy wkłady wszystkich maszyn); bez silników asynchronicznych reguła „nie dotyczy” zamiast „spełniona”. Front: `SladSekcyjny` bez ikon ✓/✗ i `data-status` (D22 ×3 zdjęte razem). Fikstury harnessu `zwarcia_wklady_scena_*` zregenerowane. |
| 9. Frontend pozostały (D18…D72, E20…E62, SLD v2 G1–G9, NnSwitchgearCard) | 38 | 29 | nietknięte poza wpisami usuniętymi razem z grupami 2–4 |
| 10. Pozostałe (archiwum, importy, preflight B20, kreator C54, katalogi audit2, reference_engine) | 24 | 14 | w części przeklasyfikowane na ENUM_WEWNETRZNY z uzasadnieniem; reszta nietknięta |
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
- Iniekcje C48: skutek reguły na stałe „pomijalne” i gałąź „brak silników asynchronicznych” wyłączona → 3 przypadki iloczynu czerwone; `data-status="PASS"` w pozycji panelu → test `sladSekcyjny` czerwony.

## Pierwszy krok następcy

Domeny 6 i 7 oraz audyt 2 z domeny 8 zamknięte. Dalej: reszta domeny 8 (`api.proof_pack` C48,
`protection_read_model` C39, `equipment_proof` C33, `ThermalWithstandResult.is_adequate` C40),
potem domeny 9 (front) i 10.
