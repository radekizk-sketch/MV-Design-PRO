# Meldunek wykonawcy — karta AB-1a-bis (domknięcie guardu werdyktu)

Data: 2026-09-23. Wykonawca: Opus 5.5. Worktree `agent-aa7e9154ed55f346f`, baza
`claude/relaxed-sagan-ww188q` @ `8a49a02d`, przestawiona (rebase) na `a13ad4f2` po komunikacie
orkiestratora. Commity lokalne, bez push i bez PR:

| Commit | Treść |
|---|---|
| `56b921a8` | pięciu towarzyszy werdyktu w 7 nośnikach `analysis/**` i w dostawcach jakości; `PodstawaNormatywna` → `analysis/podstawa_normatywna.py`; fikstury przeliczone generatorami |
| `02589dfa` | testy backendu (iloczyn cech) |
| `da4a4c70` | guard: pola `Enum`/`StrEnum` z tokenem, aliasy, typy z całego `src` |
| `cfea33ea` | front `ui2/wyniki/jakosc/**`, lista wyjątków frontu bez 6 luster, mutacje guardu, budżet `tsconfig_gate` 104 → 102 |
| `33fcbf52` | `wynikiInzynierskieV126.json` przeliczona generatorem (rozjazd zastany na bazie) |
| ten meldunek | — |

## 1. Inwentarz klasy zmierzony na HEAD przed zmianami (`8a49a02d`)

Pomiar: rozszerzona reguła guardu uruchomiona na niezmienionym drzewie.

**A. Nośniki w zakresie skanu (`api`, `application`, `analysis`, `solver_input`) — pole typu enum z członkiem-tokenem:**

| Nośnik | Plik:linia | Pole (enum) | Brakujące grupy |
|---|---|---|---|
| `EnergyValidationItem` | `analysis/energy_validation/models.py:44` | `status: EnergyValidationStatus` | wszystkie 5 |
| `NormativeItem` | `analysis/normative/models.py:84` | `severity: NormativeSeverity`, `status: NormativeStatus` | wartość, wymaganie, podstawa, dowód |
| `ProtectionCurvesITView` | `analysis/protection_curves_it/models.py:83` | `normative_status: NormativeStatus` | wszystkie 5 |
| `RecommendationEntry` | `analysis/recommendations/models.py:44` | `expected_effect: RecommendationEffect` | wszystkie 5 |
| `SensitivityPerturbation` | `analysis/sensitivity/models.py:44` | `decision: SensitivityDecision` | wartość, wymaganie, podstawa, dowód |
| `SensitivityEntry` | `analysis/sensitivity/models.py:52` | `base_decision: SensitivityDecision` | wszystkie 5 |
| `VoltageProfileRow` | `analysis/voltage_profile/models.py:17` | `status: VoltageProfileStatus` | wszystkie 5 |

Pomiar zgadza się z wykonawcą 2 (7 klas). Enumy z tokenem w całym `backend/src`:
`CoordinationVerdict`, `DiagnosticStatus`, `EnergyValidationStatus`, `NormativeSeverity`,
`NormativeStatus`, `RecommendationEffect`, `SelectivityVerdict`, `SensitivityDecision`,
`VoltageProfileStatus`. Nowych nośników `Literal`, które pojawiłyby się po zbieraniu aliasów z całego `src`, nie ma.

**B. Front (`ui2/**/api.ts`) — 6 luster na liście wyjątków:** `jakosc/api.ts`:
`WalidacjaItem.status`, `PozycjaWarunku.status`, `OcenaWarunkow.status_ogolny`, `PozycjaCieplna.status`,
`KryteriumCieplne.status`, `DowodCieplnyResponse.status`. Dwa z tych luster mają dostawców spoza klasy A:
- `application/analyses/warunki_przylaczenia.py:67` (`PozycjaOceny`) i `:101` (`OcenaWarunkowPrzylaczenia`);
- `application/analyses/wytrzymalosc_cieplna_przewodow.py` (`ConductorThermalWithstandItem`, kryteria solvera, `zbuduj_dowod_cieplny`).

Status mają tam typ `str`, więc guard backendu ich nie widzi. Oba przebudowane (p. 2).
Po zbieraniu aliasów i enumów TS z całego `frontend/src` rozszerzona reguła frontu nie znalazła żadnego nowego nośnika.

**C. Zmierzone POZA zakresem skanu — nośniki enum/alias w `domain/**`, `diagnostics/**`, `enm/**`, `reference_engine/**` (NIE przebudowane, patrz p. 5):**

| Nośnik | Plik:linia |
|---|---|
| `DiagnosticReport` | `diagnostics/models.py:113` |
| `SensitivityCheck`, `SelectivityCheck`, `OverloadCheck`, `ProtectionCoordinationResult` | `domain/protection_device.py:392, 428, 473, 514` |
| `InstantaneousSelectivityCheck`, `InstantaneousSensitivityCheck`, `InstantaneousThermalCheck`, `SPZFromInstantaneousCheck` | `domain/protection_device.py:618, 663, 708, 759` |
| `ValidationResult` | `enm/validator.py:104` |
| `ComplianceCheck` | `reference_engine/models.py:163` |

**D. FROZEN:** reguła enum nie znalazła żadnego nowego nośnika FROZEN. W plikach `SKAN_FROZEN` zgłoszenia są te same. `SelectivityVerdict` w `network_model/solvers/protection_iec60255.py:265,309` leży w solverze poza skanem, poza listą FROZEN guardu i poza granicami tej karty. Lista wyjątków backendu jest bez zmian: 6 pozycji, każda z adapterem.

## 2. Co zmieniono (pliki)

**Guard** (`scripts/explainable_verdict_guard.py`, `test_explainable_verdict_guard.py`,
`explainable_verdict_frontend_allowlist.txt`). Nowa reguła 2(c):
- pole typu klasy wyliczeniowej (`Enum`, `StrEnum`, `str, Enum` albo enum dziedziczący po enum), która ma ≥ 1 członka o wartości-tokenie (literał albo `auto()` w `StrEnum`);
- alias takiej klasy (`X = S`, `X = S | None`, `X: TypeAlias = Optional[S]`, alias aliasu — do punktu stałego). Wyrażenia wartości nie są aliasem (`DOMYSLNY = S.PASS`, `ORDER = {S.PASS: 0}`, `__all__`).

Reguła 2(b) rozszerzona o wartość-członka (`S.PASS`, `S.PASS.value`). Definicje typów zbiera `zgloszenia_drzewa`/`_kontekst_backendu` z CAŁEGO `backend/src`, nośniki tylko z zakresu skanu. Front: enum TS z członkiem-tokenem i aliasy nieeksportowane; typy z całego `frontend/src/**` (`zgloszenia_frontu`). Wszystkie wykluczenia bez zmian.

Nowe mutacje (19 przypadków):
- „werdykt jako StrEnum bez towarzyszy → zgłoszenie” — 5 postaci enum;
- „ten sam z pięcioma grupami → brak”;
- brak jednej grupy wystarcza (×5);
- „alias enum → zgłoszenie” (×4);
- enum z modułu spoza skanu;
- nie-nośniki (×4);
- słownik z członkiem enum (×2) i bez tokenu;
- enum TS z tokenem i bez;
- alias z pliku kontekstu;
- pin „7 klas zmierzonych nie jest zgłaszanych”;
- pin „lista frontu bez luster jakości”.

Lista wyjątków frontu: 8 → 2 pozycje (zostaje wyłącznie kontrakt `PozycjaOceny`/`OdpowiedzOceny`).

**Backend:**
- nowy `analysis/podstawa_normatywna.py` — `PodstawaNormatywna` przeniesiona z `werdykt_projektowy.py` (import `analysis` → `application` zamykał cykl), `podstawa_niezweryfikowana`, `dowod_pozycji`;
- `werdykt_projektowy.py` importuje typ stąd (jeden kontrakt);
- `analysis/normative/kryteria_napiecia.py`: `podstawa_progu_napiecia` — jedno źródło podstawy napięcia;
- `energy_validation/{models,builder,serializer}`;
- `voltage_profile/{models,builder,serializer}`;
- `normative/{models,rule_registry,evaluator,serializer}` — podstawa per reguła w rejestrze;
- `protection_curves_it/{models,builder,serializer}`;
- `sensitivity/{models,builder,serializer}`;
- `recommendations/{models,builder,serializer}`;
- `application/analyses/{warunki_przylaczenia,wytrzymalosc_cieplna_przewodow}.py`;
- `application/analyses/lv_domain/projection_v1.py` — `dowod.element_id` przekluczowany tą samą mapą co `bus_id`;
- `backend/scripts/eksport_fixtur_projekcji_nn.py` — normalizacja `dowod.run_id`.

Kształt: towarzysze `wartosc`, `odniesienie`, `margines` (dodatni = w granicy, konwencja `OcenaElementu`), `podstawa`, `dowod {run_id, element_id, trace_ref}`, dopisani ADDYTYWNIE na końcu pozycji. Tam, gdzie liczba już istniała, są WYPROWADZANI w `__post_init__` z pól dostawcy (`field(init=False)`), np. `wartosc = observed_value`, `margines = −margin_pct`, więc jest jedno źródło liczby. Rekomendacje przepisują towarzyszy 1:1 z nośnika źródłowego. `None` = brak. Identyfikatory analiz (`compute_sensitivity_id`, `compute_recommendation_id`, `report_id`) są bez zmian, bo payload odcisku nie obejmuje nowych pól.

Testy: `tests/analysis/test_towarzysze_werdyktu_ab1a_bis.py` (11) i
`tests/application/analyses/test_towarzysze_werdyktu_jakosci_ab1a_bis.py` (7), oba przez prawdziwe buildery. Iloczyn cech: nośnik × stan (PASS/WARNING/FAIL/NIE OBLICZONO) × towarzysz × postać (obiekt / słownik API). Predykat parami przypięty w teście: `margines ≤ 0 ⇔ FAIL` (walidacja, profil), `margines < 0 ⇔ FAIL` (warunki, cieplna, kryteria cząstkowe), znak zapasu ⇔ decyzja (wrażliwość), `wartosc < odniesienie ⇔ FAIL` (agregat krzywych I–t).

**Front (`ui2/wyniki/jakosc/**`):**
- `api.ts`: `TowarzyszeWerdyktu`, reużywa `PodstawaNormatywnaOdpowiedz`/`DowodWyniku` z `ocena/api.ts` — nie trzeci kontrakt;
- `jakoscModel.ts`: tabela walidacji czyta `wartosc`/`odniesienie`/`margines`; warunki mają kolumnę „Zapas”;
- `EkranJakosci.tsx`: szczegół walidacji ma zapas w pkt proc. i podstawę; warunki mają podstawę sekcji;
- `PanelDowoduCieplnego.tsx`: podstawa z punktem normy, zapas każdego kryterium;
- `strings.ts`, `jakosc.css`;
- fikstury testów, w tym `rozplyw/__tests__/fixtures.ts`;
- nowy `__tests__/towarzyszeWerdyktu.test.tsx` — natywna ścieżka: `userEvent.click` + globalny `fetch`, bez `dispatchEvent`;
- podstawę renderuje istniejący `PodstawaStrukturalna` (odznaka „źródło niezweryfikowane”).

Znalezisko przy okazji: ręczne fikstury frontu miały `margin_pct` z ODWROTNYM znakiem niż backend (65 % przy progu 100 → „35”, a backend daje −35). Szczegół walidacji pokazywał więc projektantowi zapas z mylnym znakiem. Fikstury poprawione do kształtu backendu. Ekran czyta teraz `margines` (dodatni = w granicy).

## 3. Weryfikacja (kody wyjścia łapane bezpośrednio)

| Polecenie | Wynik |
|---|---|
| `poetry run pytest tests/ -q -m "not pandapower and not andes" -p no:cacheprovider` | EXIT=1: **17075 passed, 1 failed**, 37 deselected, 0 skipped. Porażka: `tests/ci/test_v126_odpowiedzi_fixtury.py::test_fixtura_wynikow_inzynierskich_zgodna_z_adapterem` — zastany rozjazd bazy (`physics_domain_pl` dodane w integracji `8a49a02d`, fikstura nieprzeliczona). Naprawa: generator `tests/ci/generuj_odpowiedzi_v126.py`, powtórka pliku: **4 passed**. Pełnego przebiegu po tej jednej zmianie JSON nie powtórzyłem (50 min). |
| `poetry run python ../scripts/guardy_z_ci.py` | **EXIT=0, KOMPLET ZIELONY** (108 pozycji zielonych). W tym `explainable_verdict_guard` (backend i `--frontend`), `mypy_ratchet_guard`, `tsconfig_gate_guard` (102/102), black/ruff we wszystkich trzech zakresach, `npm run type-check`, `npm run lint`. Dwóch czerwieni bazy, o których pisał orkiestrator, nie było — są już w `a13ad4f2`, na który przestawiłem gałąź. |
| `poetry run pytest -q ../scripts` (w ramach `guardy_z_ci`) | **1133 passed** |
| black/ruff (`src tests`, `--config pyproject.toml ../scripts`, `scripts`) | 0 (w `guardy_z_ci`) |
| `npm run type-check` / `npm run lint` | 0 / 0 |
| `npm test` (pełny) | EXIT=1: **12589 passed, 1 failed**, 14 todo (901 plików). Porażka: `src/ui/sld/v3/scene/__tests__/kosztSceny.test.ts` („koszt planu rośnie LINIOWO”). To test czasowy SLD, bez związku z kartą; biegł równolegle z pełnym pytestem. Uruchomiony osobno: **zielony**. Uczciwie: nie zmierzyłem, czy jest niestabilny także bez obciążenia. |
| vitest `src/ui2/wyniki/jakosc` | 11 plików, 134 testy — zielone |
| `eksport_fixtur_harnessu.py --sprawdz`, `eksport_fixtur_projekcji_nn.py --sprawdz` | 0 / 0 |

## 4. Piny i fikstury przeliczone (z powodem)

- `frontend/src/harness-fixtures/generated/{walidacja_scena_wynik,cieplna_scena_wynik,cieplna_scena_dowod}.json` — `eksport_fixtur_harnessu.py`; powód: towarzysze werdyktu w odpowiedziach.
- `frontend/src/ui/sld/v3/lv-domain/fixtures/generated/16_stale_result.json`:
  - generator: `eksport_fixtur_projekcji_nn.py` (jedyny scenariusz z biegiem PF);
  - powód: wiersze profilu napięć niosą towarzyszy; zmienił się `projection_hash`;
  - generator dostał normalizację `dowod.run_id` — bez niej fikstura zależałaby od losowego UUID biegu.
- `frontend/src/ui2/wyniki/akademickie/__tests__/wynikiInzynierskieV126.json` — `generuj_odpowiedzi_v126.py` (rozjazd bazy, p. 3).
- `schemas/openapi_snapshot.json` — `generuj_snapshot_openapi.py` uruchomiony: **bez zmian** (widoki zwracają słowniki, nie modele pydantic).
- `scripts/solver_input_substitute_guard.py`: `analysis/podstawa_normatywna.py` dopisany do `CONTRACT_SOURCES`. Komentarz uzasadnia: typ WYNIKU, delta pól = 0, bo nazwy pól były już w mapie. Piny w `test_solver_input_substitute_guard.py` po pomiarze **bez zmian** (67 testów zielonych).
- `scripts/tsconfig_gate_guard.py`: budżet 104 → 102. Przy okazji w tym samym module naprawiłem 2 zastane błędy typów testów: nieużywany import w `arcFlash.test.tsx` i brak pól `zrodlo_k*` w `wytrzymaloscCieplna.test.tsx`.

## 5. Czego NIE zrobiono i dlaczego

1. **Nośniki spoza zakresu skanu (tabela 1C, 11 klas).** Zakres `{api, application, analysis, solver_input}` wyznacza audyt §3.3 i karta go nie zmienia. `domain/protection_device.py` to wyniki koordynacji zabezpieczeń (8 klas) z własnymi konsumentami. Rozszerzenie skanu i ich przebudowa to osobna decyzja zakresu — dotyka domeny zabezpieczeń i solvera `protection_iec60255` (FROZEN?). Zmierzone i nazwane tutaj, nie ukryte. **Decyzja dla orkiestratora.**
2. **Luka reguły: status typu `str`.** Klasy ze statusem `str` (np. `ConductorThermalWithstandItem.status`, `PozycjaOceny.status` warunków) i słowniki `{"status": zmienna}` są dla guardu backendu niewidoczne. Wykrył je dopiero lustro-typ frontu (`'PASS' | 'FAIL'`). Oba przypadki z tej karty przebudowałem. Reguły NIE rozszerzyłem o analizę przepływu wartości, bo byłaby to heurystyka. Kandydat do reguły: „pole `status: str` + słownik tokenów w module”.
3. **Lustra frontu z `string`.** `ui2/wyniki/wrazliwosc/api.ts` (`decision: string`, `base_decision: string`) nie jest flagowane. Backend niesie już towarzyszy wpisów wrażliwości, ale ekran „Wrażliwość” ich jeszcze nie pokazuje. To poza zakresem (3) karty (`jakosc/**`), zostaje jako dług nazwany.
4. **`werdykt_projektowy`.** Nadal podaje podstawę kryteriów walidacji energetycznej jako tekst `norma_pl` definicji, a nie `PozycjaWerdyktu.podstawa` z dostawcy. Dwa opisy tej samej podstawy są w tym miejscu dwoma źródłami. Zmiana `norma_pl` zmieniłaby teksty ekranu „Ocena techniczna” i fikstury harnessu werdyktu, a karta tego nie obejmuje. **Do decyzji.**
5. **Zrzuty ekranu żywej aplikacji (B-02 / dyrektywa 8)** — nie wykonane. Dowód pochodzi z testów komponentów na natywnej ścieżce.
6. **`ProtectionCurvesITView` nie ma producenta produkcyjnego.** `pokrycie_analiz` podaje `None`, co jest uczciwym brakiem opisanym w module. Przebudowałem kształt, ale nie ma ścieżki użytkownika, która go pokaże. To zastany dług, nie wprowadzony tą kartą.

## 6. Moje decyzje

- **Addytywnie i bez drugiej prawdy.** Towarzysze są WYPROWADZANI z istniejących pól dostawcy (`field(init=False)`), nie przechowywani obok. Pola dostawcy zostają (karta: „never a third contract”). `margines` ma konwencję wyniku wyjaśnialnego (dodatni = w granicy) — dla walidacji to `−margin_pct`, dla raportu normatywnego `−margin`.
- **`odniesienie`** = granica werdyktu FAIL (walidacja, profil). Dla raportu normatywnego to `limit_value`, czyli próg, wobec którego reguła wydała status: ostrzegawczy przy PASS/WARNING.
- **Werdykty zliczeniowe** (krzywe I–t, warunki zbiorczo): `wartosc` = pozycje spełnione, `odniesienie` = pozycje rozstrzygnięte. `margines` przy warunkach zbiorczo = `None` (różne jednostki). Przy krzywych I–t `margines` = najmniejszy z `margins_pct` (ta sama konwencja).
- **Wrażliwość:** werdykt = znak zapasu, więc `wartosc = margines = base_margin`, a `odniesienie = ZAPAS_GRANICZNY = 0` (definicja kryterium, nie liczba normatywna). Perturbacja korzysta z towarzyszy wpisu nadrzędnego (reguła zagnieżdżenia §3.3 p. 3).
- **Podstawy:** wszystkie `UNVERIFIED_SOURCE`, `wersja = None`. Dokument pojawia się tylko tam, gdzie kod go nazywa: PN-EN 50160 dla progu 10 %, PN-HD 60364-4-43 § 434.5.2 z `STANDARD_REFS` solvera kryterium cieplnego, IEC 60909-0 dla reguły dostępności SC3F. Próg napięcia inny niż 10 % (konfiguracja) nie dostaje dokumentu. Liczby są bez zmian.
- **`PodstawaNormatywna` przeniesiona do `analysis/`** (warstwa niższa niż `application/`). Konsumenci importujący ją z `werdykt_projektowy` działają dalej (nazwa jest tam używana). `ochrona_lom.py` nietknięty (granica karty).

**Uwaga procesowa (uczciwość):** w trakcie pracy uruchomiłem `black` na zbiorze ścieżek bez konfiguracji projektu (domyślne 88 znaków). Przeformatował ~960 plików. Zatrzymałem go i cofnąłem wszystkie zmiany poza moimi plikami (`git checkout`). W moich plikach cofnąłem formatowanie łatką odwrotną (`black88(HEAD) → HEAD`) i sformatowałem je ponownie konfiguracją backendu. `guardy_z_ci` (black `--check` we wszystkich zakresach) jest zielony, a diff zawiera wyłącznie zmiany merytoryczne.
