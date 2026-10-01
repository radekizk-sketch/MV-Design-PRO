# Meldunek — karta PROT-LTI (jedna nazwa krzywej zależnej długoczasowej)

Gałąź: `claude/mv-design-pro-twin-audit-u4lhy0-karta-prot-lti`, baza `f3c435b6`.
Commity: `c854267e` (kod, testy, strażniki), `0f12f874` (e2e), `75679793` (dokumenty), ten meldunek.
Decyzja: OD-15(e) z mapy domknięcia, zgoda B-01 w ramach O-59 (OD — otwarta decyzja właściciela,
B-01 — bramka edycji rdzenia zamrożonego).

## 1. Wynik i dowód

Krzywa t = TMS·120/(M − 1) (K = 120, α = 1) ma w produkcie jedną nazwę „LTI”. Czasy zadziałania są
identyczne bit w bit przed zmianą i po niej.

| Bramka | Wynik (kod wyjścia łapany bezpośrednio) |
|---|---|
| Test tożsamości t(M), `backend/tests/network_model/solvers/test_protection_lti_tozsamosc.py` | 13 zielonych. Iniekcja kontrolna (stała 120 → 120,0000001 w rdzeniu) dała 4 czerwone; rdzeń przywrócony, odcisk zgodny |
| Pełna regresja backendu `pytest -m "not pandapower and not andes"`, `OPENBLAS_NUM_THREADS=1` | 26 996 zielonych, 10 czerwonych i 6 błędów — wyłącznie czerwień bazy (§4) |
| Pełny vitest `--no-file-parallelism` | 13 009 zielonych, 2 czerwone — wyłącznie czerwień bazy (§4) |
| `npm run type-check` / `npm run lint` | RC = 0 / RC = 0 |
| `python ../scripts/guardy_z_ci.py` z katalogu `backend/` | RC = 0: 106 guardów z 106 wołanych przez CI, lint jak CI, 3368 testów własnych guardów („KOMPLET ZIELONY”) |
| W tym strażniki `protection_no_heuristics_guard`, `solver_diff_guard` (8 plików, w tym rdzeń IEC 60255), `resultset_v1_schema_guard`, `solver_boundary_guard` | zielone (sankcja OD-15(e) wypisana przez `solver_boundary_guard`) |
| E2E z natywnym klikiem `frontend/e2e/krzywa-lti-koordynacja.spec.ts` (realny backend) | 1 zielony (34 s) |

Test tożsamości porównuje wyniki z migawką `backend/tests/fixtures/protection/iec60255_t_m_przed_prot_lti.json`. Migawka została wygenerowana z pliku rdzenia z commita `f3c435b6`, czyli sprzed zmiany. Zakres porównania:
- wszystkie krzywe rdzenia (NI, VI, EI, LTI, DT);
- M ∈ {1,05; 1,1; 1,5; 2; 3; 5; 7,5; 10; 15; 20; 50} oraz TMS ∈ {0,05; 0,1; 0,3; 0,5; 1};
- porównywane pola: czas, wielkości pośrednie WHITE BOX, podstawienie LaTeX i wzór, liczby jako `float.hex`.

Klucz migawki to stałe A/B krzywej, a nie jej nazwa. Ten sam iloczyn cech przechodzi też torem nastawy modelu ENM (`czas_z_nastawy`). Osobny test przypina, że zbiory nazw są równe w trzech miejscach: w literałach modelu, w odwzorowaniu na solver (`_KRZYWE`) i w mapie odczytu (`CURVE_TYPE_MAP`).

Ścieżka e2e:
1. Edytor stopnia 51 na ekranie E-28 (koordynacja zabezpieczeń): wybór „Odwrotna długoczasowa (LTI, 120)”.
2. Zapis do konfiguracji przypadku (`variant: "LTI"`).
3. Biegi zwarciowe MAX i MIN oraz rozpływ przez API.
4. Klik „Wykonaj analizę koordynacji”.
5. Kontrola wyniku: krzywa `IEC_LTI` z punktami, legenda wykresu TCC z jedną etykietą, czasy zadziałania z backendu w tabeli selektywności, brak „RI” i „IEC_LI” w odpowiedzi.

## 2. Inwentarz klasy (wszystkie nazwy tej krzywej przed kartą)

| Miejsce | Było | Jest |
|---|---|---|
| Rdzeń `network_model/solvers/protection_iec60255.py` | `RI = "RI"`, etykieta „Odwrotna RI (120)” | `LONG_TIME_INVERSE = "LTI"`, „Odwrotna długoczasowa (LTI, 120)” |
| Model ENM `enm/models.py` (`ProtectionSetting.curve_type`), front `types/enm.ts` | `IEC_LI` | `IEC_LTI` |
| `application/protection_read_model.py` `CURVE_TYPE_MAP` | `"IEC_LI": "LTI"` | `"IEC_LTI": "LTI"` |
| `application/analyses/protection/czas_wylaczenia_galezi.py` `_KRZYWE` | `"IEC_LI": RI` | `"IEC_LTI": LONG_TIME_INVERSE` |
| `enm/domain_operations_v2.py` `IEC_CURVES` | klucz `LTI`, komentarz „alias LTI = RI w jądrze” | klucz `LTI`, alias usunięty z komentarza |
| Adapter `protection/curves/iec_curves.py` | `LTI`, „Długoczasowa odwrotna (LTI)” | `LTI`, „Odwrotna długoczasowa (LTI, 120)” |
| Rejestr producentów `domain/protection_vendors.py`, katalog `devices_v0.json` | `IEC_LTI` / `LTI` (bez zmian nazwy) | atrybucja poprawiona (§3) |
| Front `ui/protection-coordination/types.ts` (jedyny słownik używany w produkcie) | „Długoczasowa odwrotna (LTI)” | „Odwrotna długoczasowa (LTI, 120)” |
| Front `ui/protection-curves/types.ts`: `curveTypes`, `IEC_CURVE_OPTIONS`, `IEEE_CURVE_OPTIONS` | trzecia i czwarta kopia etykiet (ASCII), bez konsumenta produkcyjnego | skasowane razem z eksportem i testem |
| Katalog pomocniczy `mv_auxiliary_catalog.py` (`curve_iec_long_time_inverse`, „IEC dlugoczasowo inwersyjna”) | opis pozycji katalogu, nie kod krzywej | bez zmian — pozycja opublikowana jest niezmienna, a nazwa rodziny (normalna/bardzo/skrajnie/długoczasowo) jest spójna |

Wzorzec grepa grep-zero, wykonany na drzewie karty:
```
grep -rnE '\bRI\b|"RI"|'"'"'RI'"'"'|IEC_LI\b|CurveType\.RI\b|Odwrotna RI' \
  backend/src backend/tests backend/schemas frontend/src frontend/e2e scripts \
  --include=*.py --include=*.ts --include=*.tsx --include=*.json
```
Wynik: zostały wyłącznie trafienia celowe:
- asercje nieobecności: `test_dawna_nazwa_ri_nie_istnieje_w_jadrze`, test równości zbiorów nazw, regex w e2e;
- zapis historii zmiany w docstringach testów, w sankcji `solver_boundary_guard` i w nagłówku `solver_diff_guard`.

W dokumentach kontraktowych (`docs/protection`, `docs/proof`, `docs/domain`, `docs/system`, `docs/analysis`, `docs/twin`, `docs/sld`, `docs/ui`, kanon) zostało jedno trafienie: zapis zmiany w `docs/twin/MV_DESIGN_PRO_PROTECTION_ARCHITECTURE.md`. Rejestry historyczne (`docs/architecture/**`, `docs/evidence/**`, `docs/plan/KARTA_W3_*`) dostały adnotację „wykonane 2026-09-30”; ich zapis historyczny został zachowany.

Persystencja — pomiar, z którego wynika brak migracji:
- Wartość jądra (`"RI"`) nie trafia do modelu, konfiguracji przypadków ani zapisów biegów. Jedynym konsumentem enumu jądra jest `czas_wylaczenia_galezi`; zwraca on literał modelu, a do śladu solvera nie przekazuje nazwy jądra.
- Snapshot OpenAPI nie zawiera „RI” ani `IEC_LI`.
- `IEC_LI` nie występuje w fiksturach, sieciach złotych, szablonach, katalogach ani w fiksturach e2e. W interfejsie nie ma pisarza `curve_type` modelu; nastawy domyślne to DT i `IEC_SI`.

Ryzyko nazwane wprost: projekt zapisany poza repozytorium, w którym `IEC_LI` wpisano bezpośrednim wywołaniem `update_protection`, nie przejdzie walidacji modelu. Zgodnie z zasadą właściciela nie dodawałem warstwy zgodności.

## 3. Ustalenia przy okazji

1. **Atrybucja LTI.** Rejestr producentów, `PROTECTION_SYSTEM_CANONICAL.md` i `VENDOR_CURVES.md` przypisywały krzywą do „IEEE C37.112-2018”. To błąd: IEEE C37.112 nie ma krzywej 120/1. Atrybucję poprawiłem na ABB 1MRS756887 rev. Q, Tab. 1001, poz. 14 („IEC Long Time Inverse”) i praktykę BS 142 / IEC 255. Źródła z raportu wyszukiwania, z dostępem 2026-09-30:
   - ABB 1MRS756887 rev. Q, str. 1136 (Tab. 1001) i str. 1150 (§11.2.1.3 — RI = k/(0,339 − 0,236·I>/I), inna krzywa);
   - ABB SPAJ 140 C, Product Guide, str. 4;
   - BSI Knowledge (BS 142-3-3.2:1990);
   - Protecta PP-13-21408, Tab. 1-1.
2. **Cytowanie „IEC 60255-151:2009 Tabela 1” jest prawdopodobnie błędne w całym repozytorium.** Według podglądu normy (spis treści, VDE) stałe krzywych są w Załączniku A, Tab. A.1, a Tabela 1 dotyczy błędu czasu. Krzywa LTI najpewniej nie należy do zbioru A–F tej normy. Nie poprawiałem tego, bo potrzebny jest tekst normy, którego nie ma. Ten sam napis jest też w śladzie WHITE BOX rdzenia (`"standard": "IEC 60255-151:2009"`), a ślad należy do B-01.
3. **Druga para nazw tej samej krzywej (0,14/0,02).** „NI” jest w rdzeniu i w katalogu analitycznym (`IEC_NI`); „SI” jest w modelu (`IEC_SI`), adapterze, rejestrze producentów i froncie. Ujednolicenie wymaga wyboru nazwy i zgody B-01 na rdzeń, a zgoda tej karty obejmuje tylko (e). Zmiana samego katalogu bez rdzenia byłaby połowiczna i mogłaby wymagać odwrócenia, jeśli wybrana zostanie nazwa „NI”. Pozycję dopisałem do listy B-01 w `STAN_REPO.md` §J i do wiersza rejestru konfliktów `PROT-LTI`.
4. **Odcisk B-01.** Rdzeń IEC 60255 był na liście `scripts/rdzenie_b01.py`, ale nie pilnował go ani odcisk `solver_diff_guard`, ani `WATCHED_PATHS` `solver_boundary_guard`. Dopisałem go do obu: odcisk nowej wersji oraz sankcja OD-15(e) do usunięcia po scaleniu do `main`. Pozostałe grupy B-01 (NC RfG, FRT/HVRT, RMS, WLS, stan fazowy, V12.6) nadal nie mają odcisku. To ta sama klasa luki, ale dopisanie ich do odcisku nie wymaga edycji rdzeni — zostawiam to do decyzji integratora jako zmianę strażnika.
5. **OD-15(e), druga część.** Nieaktualny nagłówek „STATUS: SCAFFOLDING (MVP)” w `fault_loop_builder.py` (plik spoza listy B-01) zastąpiłem opisem modułu i listą sześciu zmierzonych konsumentów.
6. **Defekt spoza tej karty, nie naprawiony.** W `fault_loop_builder.transformer_lv_impedance_ohm` przy `pk_kw` brak albo 0 przyjmowane jest R = 0, a `r_pu = min(r_pu, z_pu)` po cichu obcina sprzeczne dane (Pk/Sn > uk). Ani jedno, ani drugie nie trafia do śladu. Poprawka (odmowa nazwana albo jawne założenie w śladzie) zmienia wyniki pętli zwarcia u czterech konsumentów nN. Ta karta ma kontrakt identyczności liczb, więc poprawka wymaga osobnej karty z parytetem.

## 4. Czerwień bazy (zmierzona osobno, nie naprawiana)

Backend — na bazie `f3c435b6` te same pliki dają ten sam wynik (10 czerwonych, 145 zielonych, 6 błędów). Wszystkie są na liście karty „naprawiana w innej karcie”:
- `tests/enm/migrations/test_nn_field_specs_promocja_aparat.py` — 7 czerwonych;
- `tests/domain/test_rejestr_kodow_bram_katalogowych.py` — 1;
- `tests/enm/test_nazwy_jedno_zrodlo.py` — 1;
- `tests/test_protection_settings_w3c2_identity.py` — 6 błędów.

Strażnik `tsconfig_gate_guard` (karta podawała 81 > 80) jest zielony w biegu `guardy_z_ci.py` na tym drzewie.

Frontend — 2 czerwone w `src/ui/sld/v3/canvas/__tests__/menuBudowyNaKanwie.test.tsx`: „ogniwo powtarzalne 15×” i „pokrycie łańcucha … ≥ 15 stacji”. Na tej sieci referencyjnej żadna stacja nie ma aktywnego „kontynuuj ciąg” (`stacjeZWejsciem = 0`). Tego pliku nie ma na liście karty. Pomiar na drzewach:

| Drzewo | Wynik pliku |
|---|---|
| `9dbc8ee7~1` | 24 zielonych |
| `9dbc8ee7` (przegenerowanie fikstur SLD i modeli ENM frontu z generatorów backendu) | 4 czerwone |
| `3c246c08` | 4 czerwone |
| `1c7cadc4`, `8143e644~1`, `f3c435b6` | 2 czerwone |

Wniosek: regresję wprowadziło przegenerowanie fikstur w łańcuchu partii integracji 6 (SLD-SUBSTRAT / POLA-W-TORZE). Nie naprawiałem — to warstwa SLD i fikstury partii 6, poza granicą tej karty („zmiany minimalne”). Do przypisania przez integratora właściwej karcie SLD.

## 5. Punkty styku z kartami równoległymi

- **BIEG-ZABEZPIECZEN.** W `enm/domain_operations_v2.py` zmieniłem tylko komentarz przy `IEC_CURVES`. `validate_selectivity` dalej czyta nieistniejący schemat nastaw (słownik `Ipickup_a`/`time_dial` zamiast listy `ProtectionSetting`) i mutuje `enm.meta` — w KARTY_OTWARTE ta kwestia należy do tamtej karty („jedna ścieżka albo znika”). Literał modelu, na którym tamta karta zbuduje pisarza nastaw, to od teraz `IEC_LTI`.
- **RESULTSET-MARTWE-MAPPERY.** `domain/protection_engine_v1.py` i `protection_to_resultset_v1.py` są nietknięte; enum `IECCurveTypeV1` (SI/VI/EI) nie zna LTI. Wpis `WATCHED_PATHS`/sankcji dla `protection_engine_v1.py` w `solver_boundary_guard` jest obok mojego wpisu — przy kasacji tamtego pliku trzeba zdjąć tylko jego wpis.

## 6. Czego nie zrobiono i dlaczego

- Para nazw NI ↔ SI: wymaga zgody B-01 i decyzji o nazwie (§3 pkt 3).
- Korekta cytowania normy „Tabela 1” → „Załącznik A, Tab. A.1”: brak tekstu normy (§3 pkt 2).
- Ciche obcięcie w `transformer_lv_impedance_ohm`: osobna karta z parytetem liczb (§3 pkt 6).
- Czerwień bazy frontu `menuBudowyNaKanwie`: warstwa i karta partii 6 (§4).
- Werdykt wizualny wykresu TCC z nową etykietą: bramka B-02 właściciela. Spec e2e ćwiczy ścieżkę, ale zrzutów nie certyfikuje.
