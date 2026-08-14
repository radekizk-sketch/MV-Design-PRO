# KONFIGURATOR ROZDZIELNIC SN / RMU — MODEL KATALOGOWY (BINDING)

Status: WIĄŻĄCY (dyspozycja właściciela 2026-08-14, ocena ekranu „Pola
rozdzielnicy SN" 3/10 — ODRZUCONY; wykonanie osobiste Fable).
Rejestr: wiersz KONFIGURATOR-POL-RMU w `docs/v12xx/REJESTR_KONFLIKTOW.md`.

## 1. Diagnoza (przyjęta w całości)

Obecny kreator myli POLE ROZDZIELCZE z APARATEM ŁĄCZENIOWYM: użytkownik
wybiera rolę pola i dobiera do niej pojedynczy aparat. „Rodzina standardowa
producenta" jest atrapą katalogu. RMU traktowane jest jak zbiór luźnych szaf.
Mini-SLD rysuje cztery identyczne ikony różniące się podpisem.

POLE SN JEST KOMPLETNĄ JEDNOSTKĄ FUNKCJONALNĄ KONKRETNEJ RODZINY
ROZDZIELNICY. Aparat łączeniowy jest tylko jednym z jej elementów.

## 2. Hierarchia kanoniczna (CATALOG-FIRST)

```
PRODUCENT
  → RODZINA ROZDZIELNICY        (SwitchgearFamily)
    → WARIANT / TECHNOLOGIA     (atrybuty rodziny: architektura, medium)
      → TYP JEDNOSTKI FUNKCJONALNEJ (rola funkcjonalna)
        → KATALOGOWE POLE       (CatalogFunctionalUnit — kod katalogowy)
          → WYPOSAŻENIE FABRYCZNE  (kompozycja aparatów, required)
          → WYPOSAŻENIE OPCJONALNE (optional; reszta = NIEDOPUSZCZALNE)
            → PARAMETRY (Un, In, Ik, Ith, IAC, szerokość)
              → BOM → ENM → mini-SLD → globalny SLD
```

JEDNO ŹRÓDŁO PRAWDY ELEKTRYCZNEJ: instancja pola (FieldInstance) buduje BOM;
z BOM powstają terminale elektryczne i wpis ENM; mini-SLD kreatora i globalny
SLD renderują TEN SAM model (zakaz osobnej rekonstrukcji).

## 3. Encje (warstwa katalogowa, immutable)

STAN ZREALIZOWANY po scaleniu kanonu (2026-08-14) — sekcja opisuje encje
PAKIETU `network_model/catalog/switchgear/`, bo to jedyny kanon rodzin (§8).
Nazwy z pierwotnego szkicu (`SwitchgearArchitecture`, `CatalogFunctionalUnit`)
świadomie NIE powstały jako osobne byty: ich treść niosą już encje pakietu, a
drugi byt o tej samej treści byłby drugą ścieżką tej samej prawdy.

- `SwitchgearFamily` (pydantic): producent (`manufacturer_ref`), ref i nazwa
  rodziny, `insulation_type`, `construction_type`, `busbar_system`, napięcia
  SIECI z karty `network_voltages_kv` [kV] i klasy napięciowe URZĄDZENIA
  `um_classes_kv` [kV] (dwie RÓŻNE wielkości, §10), klasy
  `rated_current_options` [A],
  `short_time_current_options` [kA], słowniki `allowed_bay_kinds` /
  `allowed_apparatus_kinds` / `allowed_interlocks`, proweniencja
  (`source_refs`, `source_document_refs`, `source_version`) i `status` wg
  polityki `SLD_MV_BAY_TEMPLATE_SOURCE_POLICY.md`. Rodzina bez potwierdzonych
  parametrów ma `status='requires_catalog'` i NIE jest oferowana w
  konfiguratorze — predykat „wolno budować" ma jedno źródło
  (`list_offered_switchgear_families()`).
- TOR KONFIGURACJI zamiast osobnej architektury: `tor_konfiguracji`
  (`MODULARNY` | `BLOK_RMU` | `null`) jest polem WYLICZANYM z
  `construction_type` — jedno odwzorowanie `TOR_KONFIGURACJI_WG_KONSTRUKCJI`,
  pokrywające komplet wartości konstrukcji (test dwustronny). Rozróżnienie
  COMPACT/BLOCK RMU nie zmienia toru pracy projektanta, więc nie jest bytem.
- `CompleteMvBayTemplate` jest NOŚNIKIEM KATALOGOWEGO POLA (kompozycja nad
  `BayTemplate`): rodzina, funkcja pola (`BayKind`), rola, porty, wymagania
  zabezpieczeniowe i pomiarowe, lineage źródła, hash. Wyposażenie pola to
  `device_instances: list[BayDeviceInstanceTemplate]` — materializowane z
  kanonicznego szablonu PO filtrze słownika rodziny, więc pole nie ma dwóch
  list aparatów do rozjechania.
- `BayDeviceInstanceTemplate.status_wyposazenia`: FABRYCZNY | OPCJA. Aparat
  spoza listy pola jest NIEDOPUSZCZALNY — to brak wpisu, nie wartość statusu
  (pilnuje walidator). Pole jest WYMAGANE: domyślny status byłby zgadywaniem
  karty producenta.
- `FactoryConfiguration` + `FactoryConfigurationUnit` (dla rodzin o torze
  `BLOK_RMU`): rodzina, kod bloku, sekwencja jednostek (np. `L-L-T`), a dla
  jednostki — litera katalogowa, funkcja pola (`BayKind`) i aparatura
  (`ApparatusKind`), bo bloki różniące się wyłącznie aparatem jednostki (ABB
  SafeRing CCF vs CCV) to różne wyroby. Szerokość całkowita jest WYLICZANA z
  szerokości jednostek; gdy karta jej nie podaje, wynikiem jest jawny brak
  (`null`), nigdy zmyślony milimetr. RMU ≠ zbiór luźnych szaf — konfigurator
  RMU wybiera BLOK, potem doposaża jednostki.
- `FieldInstance` (warstwa projektu, NIE katalog): ref pola katalogowego +
  wybrane opcje → `zbuduj_bom()`. Instancja NIE dubluje parametrów katalogu.

## 4. Walidator rodziny (twarde błędy)

`family_validation` (API pakietu) — jedno źródło prawdy zgodności:
funkcja pola, aparat, napięcie, prąd, zwarcie, przynależność pola do rodziny,
blok fabryczny. Kombinacja spoza katalogu = HARD ERROR
(`NiezgodnoscKonfiguracjiError`) z polskim zdaniem — nigdy ciche przycięcie
ani dowolny dropdown. Każde sprawdzenie przechodzi przez wspólny predykat
`wymagaj_rodziny_oferowanej`, więc rodzina bez karty katalogowej nie wchodzi
bocznymi drzwiami przez pojedyncze wywołanie.
Aparat OEM innego producenta jest dopuszczalny wyłącznie przez jawną macierz
zgodności jednostki (nie przez ogólną listę aparatów).

## 5. Generator SLD pola

`FIELD MODEL → BOM → terminale elektryczne → mapowanie symboli IEC (kanon
ui/sld/v3/symbols) → mini-SLD → globalny SLD`. Zakaz rysowania aparatu
nieobecnego w BOM; zakaz pomijania aparatu obecnego w BOM. Pole TR rysuje
pełny tor: szyna → łącznik/CB → zabezpieczenie → uziemnik → przedział →
głowice → kabel → TR → strona nN (o ile elementy SĄ w BOM danej rodziny).

## 6. Dane katalogowe — polityka zero fabrykacji

Rodziny wprowadzamy z realnego portfolio producentów (ZPUE: TPM Air, TPM,
Rotoblok Air, Rotoblok, Rotoblok VCB, RELF, RELF 2S, RXD; ABB: SafeRing,
SafePlus, UniSec; Schneider: SM6, RM6, RM AirSeT; Siemens: 8DJH; dalsi wg
katalogu). Parametry wyłącznie klasowe wartości z publicznych katalogów
producenta (proweniencja w `source_reference`). Rodzina, dla której wartości
nie są potwierdzone kartą — `parametry_potwierdzone=False` i jawny status
„wymaga karty katalogowej" (przypięty testem: taka rodzina nie wchodzi do
ofert kreatora). Listy NIE są zaszywane w UI — UI czyta katalog przez API.

## 7. Etapy wykonania (osobiste, commit po etapie)

- S1: encje + walidator + pierwsza transza rodzin/jednostek + testy (KLASA:
  dwustronna kompletność, twarde błędy, zapadki polityki danych).
- S2: API (`/api/catalog/switchgear-families`, `/functional-units`,
  `/factory-configurations`) + macierz cyklu życia API.
- S3: przebudowa kroku 4 kreatora (nagłówek rodziny Un/In/Ik/technologia;
  tor MODULAR: komponowanie jednostek; tor RMU: blok fabryczny → jednostki →
  opcje; karta pola z wyposażeniem ✓/opcje; status VALID/INVALID rozdzielnicy).
- S4: Field SLD Generator (mini-SLD z BOM; ten sam model → globalny SLD).
- S5: FieldInstance → BOM → ENM (operacje domenowe konsumują jednostkę
  katalogową zamiast pary rola+aparat); migracja operacji kreatora.

Werdykt wizualny każdego etapu UI: właściciel (B-02).

## 8. ANEKS INTEGRACYJNY (2026-08-14, po pomiarze — decyzja nadzorcy)

POMIAR PO S1 wykazal ISTNIEJACY pakiet `network_model/catalog/switchgear/`
(1489 linii): SwitchgearFamily (pydantic; konstrukcja, izolacja, uklad szyn,
statusy zrodel verified/repo_verified/requires_catalog z polityka
`SLD_MV_BAY_TEMPLATE_SOURCE_POLICY.md`), Manufacturer, `CompleteMvBayTemplate`
(kompozycja nad BayTemplate: aparaty + porty + lineage zrodla + hash),
device_instance, apparatus_vocabulary, registry, canonical_fallback; 7 rodzin
(Rotoblok, e2ALPHA, UniGear ZS1, SafeRing, NXAIR, 8DJH, SM6-24); konsumenci:
`api/catalog.py` (trasa `GET /api/catalog/switchgear-families` JUZ ISTNIEJE),
`reference_engine` (pakiety producenckie z `switchgear_family_ref`),
`enm/domain_operations_v2`, `api/switchgear_config.py`.

WNIOSEK: luka wykazana przez wlasciciela lezy w (a) KREATORZE, ktory ignoruje
ten kanon (konsumowal atrape „rodzina standardowa"), (b) brakach kanonu:
architektura RMU + konfiguracje fabryczne blokow, status elementow
FABRYCZNY/OPCJA, twardy walidator familySupports, brakujace rodziny
(ZPUE: TPM, TPM Air, Rotoblok Air, Rotoblok VCB, RELF, RELF 2S, RXD;
ABB: SafePlus, UniSec; Schneider: RM6, RM AirSeT), (c) braku generatora
mini-SLD z BOM.

DECYZJA (KLASA, nie instancja — zakaz dwoch sciezek tej samej prawdy):
1. Pakiet `switchgear/` jest JEDYNYM kanonem rodzin. Modul S1
   `switchgear_families.py` zostaje WTOPIONY w pakiet i USUNIETY:
   dane rodzin (z kartami zweryfikowanymi 2026-08-14, w tym korekta RXD na
   izolacje powietrzna) przechodza do `families.py` w idiomie pakietu
   (statusy zrodel wg polityki, nie rownolegla flaga), architektura i
   `FactoryConfiguration` docho dza jako nowe elementy pakietu, walidator
   `familySupports` jako API pakietu, testy S1 przepiete na pakiet.
2. API: BEZ nowych rownoleglych tras rodzin — istniejaca
   `GET /api/catalog/switchgear-families` rozszerzana ADDYTYWNIE
   (architecture, konfiguracje fabryczne jako subzasob), macierz cyklu zycia
   aktualizowana.
3. Kreator (S3) konsumuje WYLACZNIE ten kanon; `CompleteMvBayTemplate` jest
   nosnikiem katalogowego pola; generator mini-SLD (S4) czyta BOM z szablonu
   pola; ENM (S5) przez `domain_operations_v2`.

Ta lekcja idzie do rejestru: moj wlasny S1 powtorzyl blad metodyczny
„instancja zamiast klasy" (nowy modul bez inwentarza istniejacego mechanizmu)
— wykryty pomiarem przed scaleniem czegokolwiek do kreatora, naprawiany
scaleniem kanonow, nie wspolistnieniem.

## 9. STAN PO SCALENIU (2026-08-14, karta SCALENIE-KANONU-ROZDZIELNIC)

ZROBIONE. Modul S1 `network_model/catalog/switchgear_families.py` USUNIETY;
pakiet `switchgear/` jest jedynym kanonem. Rejestr rodzin: 18 (7 dotychczasowych
+ 11 z transzy S1). Dolozone w pakiecie: tor konfiguracji wyliczany z
konstrukcji, `status_wyposazenia` (jeden predykat zamiast pary
`is_required`/`is_optional`), materializacja wyposazenia pola z kanonicznego
szablonu, `FactoryConfiguration` + rejestr 95 blokow (Siemens 8DJH 30,
ABB SafeRing 19, ZPUE TPM 18, Schneider RM6 15, ZPUE TPM Air 13 — rozbicie
z pomiaru rejestru, karta BLOKI-RMU-5-RODZIN 2026-08-14), walidator
`family_validation`, subzasob API `factory-configurations` i addytywne
`tor_konfiguracji` w `GET /api/catalog/switchgear-families`.

KOREKTY DANYCH WYKRYTE POMIAREM ZRODEL (zero fabrykacji):
- Rotoblok NIE zostal nadpisany parametrami z S1 (12/17,5/24 kV, 20 kA) — karta
  ZPUE potwierdza 15/20 kV i 16 kA/1 s; karta S1 byla szersza, ale NIEzweryfikowana.
- Konfiguracje TPM Air noszą nomenklature PRODUCENTA (L/T/W: LLT, LLL, ...),
  a nie wymyslone w S1 litery K.
- RXD pozostaje w izolacji powietrznej (korekta z GIS).
- ABB UniSec wchodzi jako `requires_catalog` z pustymi listami klas — publiczna
  strona portfolio nie podaje klas pradowych/zwarciowych rodziny.

DLUG JAWNY (przypiety testami, nie odlozony w ciszy):
- Rodziny o torze BLOK_RMU bez transkrybowanych blokow: WYLACZNIE ABB SafePlus
  i Schneider RM AirSeT (stan po karcie BLOKI-RMU-5-RODZIN: TPM 18, RM6 15 i
  8DJH 30 maja pelne rejestry z kart producentow). Uzasadnienie zrodlowe stoi
  w komentarzu pinu `RMU_BEZ_TRANSKRYBOWANYCH_BLOKOW`
  (`tests/network_model/catalog/test_switchgear_factory_configurations.py`):
  katalog ABB 1YVA000022 opisuje SafePlus modulowo, a karta RM AirSeT
  NRJCAT20014EN podaje wylacznie listy przykladowe z wielokropkiem — to nie
  jest zamkniety zestaw. Kazde uzupelnienie listy wymusza aktualizacje pinu
  ORAZ tego bulleta.
- Szerokosci jednostek blokow: REGULA (nie stan danych) — komplet szerokosci
  jednostek bloku daje `total_width_mm` jako sume (pin dwustronny: suma
  jednostek = szerokosc bloku z karty), brak chocby jednej szerokosci daje
  jawny `null`. Stan danych: 30 blokow 8DJH ma szerokosci z karty HA 40.2;
  TPM, TPM Air, RM6 i SafeRing pozostaja bez szerokosci jednostek w zrodlach
  publicznych.
- Kanoniczny szablon pola transformatorowego (`BAY_TEMPLATE_TRANSFORMER`) NIE
  ma glowicy kablowej, choc maja ja szablony liniowe. Uzupelnienie zmienia
  rysunek KAZDEGO pola transformatorowego na SLD, wiec wymaga werdyktu
  wizualnego wlasciciela (B-02) — zgloszone, nie wykonane samowolnie.
- Zaden kanoniczny szablon nie deklaruje dzis aparatu OPCJONALNEGO, wiec status
  OPCJA nie ma pokrycia w danych (mechanizm jest realny i przetestowany).
  Uzupelnienie wymaga kart katalogowych z lista wyposazenia opcjonalnego.
- Slownik `BayDeviceTemplate.kind` (10 rodzajow) NIE zna ROZLACZNIKA jako
  osobnego aparatu ani sygnalizacji obecnosci napiecia (VPIS). Etap S1 dokladal
  je jako LBS i VPIS. Skutek: pole jednostki RMU generowane z kanonu rysuje
  wylacznik albo odlacznik, nigdy rozlacznik, a VPIS nie istnieje na schemacie —
  choc slownik rodzin i `ApparatusKind` maja juz `switch_disconnector` i
  `voltage_indicator`. Uzupelnienie slownika szablonow zmienia rysunek pol na
  SLD, wiec — jak glowica kablowa pola TR — wymaga werdyktu wizualnego
  wlasciciela (B-02). Zgloszone, nie wykonane samowolnie.

## 10. STAN PO S5 (2026-08-14, karta S5-ENM-POLA — odbior niezalezny)

ZROBIONE. Operacja `add_sn_bay_from_catalog` (`enm/domain_operations_v2.py`,
resolver `enm/pole_katalogowe.py`): materializacja pola stacji z katalogu —
tor MODULARNY przez `complete_bay_template_ref`, tor BLOK_RMU przez
`factory_configuration_ref` + `factory_unit_index` (numer 1-based, nie litera —
blok LLT ma dwie jednostki L). Aparatura toru glownego jednostki bloku
ZASTEPUJE lacznik glowny katalogowego pola i niesie referencje JEDNOSTKI
(np. `ABB__SAFERING__CCF__U3__fuse_set`), nie zastapionego slotu — CCF i CCV
to rozne wyroby (pin regresji, potwierdzony iniekcja odbiorcza). `dry_run`
zwraca werdykt VALID/INVALID + podglad BOM bez mutacji; wykonanie deleguje do
istniejacej sciezki pisania `add_sn_bay` (jedna sciezka pisania). Dolozony
wpis `OperationSpec` w `domain/canonical_operations.py` (rejestr 42 operacji).
Domkniety dlug zastany: `bay_template_ref` wskazujace katalogowe pole rodziny
dawalo po cichu PUSTA liste aparatow — obie nomenklatury wchodza jednym
wejsciem z pelna walidacja rodziny (test regresji).

DLUG JAWNY S5 (do kolejki, patrz PLAN_DOKONCZENIA_100_2026-08-14 §3):
- V1 `_build_field_spec` (7 miejsc wywolan: GPZ, wstawianie stacji, sekcje)
  nadal buduje pola producenckie bez aparatow; przepiecie wymaga
  rozstrzygniecia, czy pola GPZ moga stac na rodzinie BLOK_RMU (test referencyjny
  buduje GPZ na SafeRing — kanal zakazany dla rodzin blokowych).
- Pole zrodlowe DER (`mv_source_field_primary_devices`) swiadomie poza
  resolverem: konfigurowane jawnie kontrolka-po-kontrolce, nie wybierane
  z katalogu rodziny.

DLUG NAPIECIOWY S5 — ZAMKNIETY (2026-08-14, karta K-J NORMALIZACJA-NAPIEC-RODZIN).
Pole `SwitchgearFamily.voltage_levels` USUNIETE. Rodzina deklaruje dwie rozne
wielkosci w dwoch polach, przepisane per rodzina ZE ZRODLA (18/18 rodzin):
`network_voltages_kv` — wiersz karty „napiecie nominalne sieci" / „napiecie
robocze"; `um_classes_kv` — wiersz „napiecie znamionowe (Ur)" / „najwyzsze
napiecie urzadzen (Um)" / „rated voltage". Karta Rotobloka podaje OBIE
(siec 15/20 kV przy klasach 17,5/24 kV) — to ta para uzasadnia rozdzielenie.
Lista pusta = karta danego wiersza nie ma (jawny brak, nigdy wartosc domyslna);
pin klasy w `test_switchgear_families.py` trzyma warunek „kazda rodzina ma
niepusta co najmniej jedna z dwoch list".

Regula dopasowania ma JEDNO zrodlo — `family_validation.czy_rodzina_obsluguje_napiecie`:
napiecie szyny Un pasuje, gdy Un jest na liscie napiec sieci ALBO (lista sieci
pusta i istnieje klasa Um >= Un; podstawa: PN-EN 62271-1 — napiecie znamionowe
urzadzenia to gorna granica napiecia sieci). Brak obu deklaracji = odmowa, nie
cicha zgoda. Walidacja jest WLACZONA w obu kanalach produkcyjnych:
`add_sn_bay_from_catalog` wola twarda brame `family_supports_voltage` po
rozwiazaniu planu katalogowego (tam znana jest rodzina rowniez dla toru
blokowego), a lista sprawdzen Reference Engine V1 (`reference_engine/compliance.py`,
kod `family.voltage`) RAPORTUJE ten sam predykat zamiast wlasnej reguly
„max(voltage_levels) >= napiecie". Iloczyn cech (rodzina sieciowa x klasowa x
bez danych) x (napiecie pasujace x niepasujace x brzegowe rowne Um) x (oba
kanaly) stoi w `tests/network_model/catalog/test_switchgear_napiecia_rodzin.py`.

Znalezisko uboczne transkrypcji (do osobnej decyzji katalogowej, NIE zmieniane
ta karta): oficjalny katalog ABB UniSec 1VFM200003 podaje komplet danych
(rated voltage 12/17,5/24 kV, prad szyn 630/800/1250 A), ktorych brakowalo
publicznej stronie portfolio — rodzina moglaby wyjsc ze statusu
`requires_catalog`. Promocja wymaga rownolegle przepisania pol katalogowych
rodziny (dzis UniSec nie ma ani jednego `CompleteMvBayTemplate`, wiec rodzina
oferowana nie zmaterializowalaby zadnego pola).
