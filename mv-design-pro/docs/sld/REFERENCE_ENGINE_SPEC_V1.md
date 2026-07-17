# REFERENCE ENGINE — SPECYFIKACJA V1 (WIĄŻĄCA)

Status: WIĄŻĄCA (dyrektywa właściciela 2026-07-17: „Globalna integracja referencji SLD").
Właściciel kanonu: `docs/v12xx/KANON_V12_XX.md` (rejestr konfliktów: wpis V12K-060).
Powiązania: `SLD_CAD_SPEC_V3.md` §12 (kompozycja celki), `backend/src/network_model/catalog/switchgear/`
(rodziny rozdzielnic), `backend/src/enm/validator.py` (walidacja na żywo).

---

## §1. Zasada nadrzędna (pkt 12 dyrektywy)

Referencje (normy, rodziny rozdzielnic producentów, standardy OSD) są **źródłem prawdy
walidacyjnej** dla całego modułu SLD i kreatorów. Nie są inspiracją graficzną.

Egzekwowanie „jednego sposobu definiowania pól" (pkt 10):

1. **Profile pól** (skład wymagany/opcjonalny/zakazany + kolejność aparatów) żyją w
   wersjonowanych pakietach referencyjnych (`reference_engine/packs/*/pack.json`).
2. **Słownik konwencji §12.4** (`apparatusSequence.ts::apparatusSymbolsForRole`) oraz
   **kanoniczne szablony kreatora** (`catalog/bay_templates.py`, 10 szablonów) są
   IMPLEMENTACJAMI profili — ich zgodność z profilami wymusza test (czerwony CI przy
   rozjeździe, z negatywem-sabotażem). Rozjazd = defekt, nie „druga prawda".
3. **Dane użytkownika** (`Bay.primary_devices`) walidowane są NA ŻYWO przez walidator ENM
   (kody `reference.*`) — natychmiast przy każdej zmianie topologii, nie przy eksporcie.
4. **Dane rodzin producentów** (napięcia, prądy, dozwolone typy pól i aparatów) mają jedno
   źródło: `SWITCHGEAR_FAMILY_REGISTRY` (katalog). Pakiety producenckie NIE kopiują tych
   danych — trzymają wyłącznie `switchgear_family_ref`; silnik pobiera dane z katalogu.

## §2. Architektura

```
backend/src/reference_engine/
├── __init__.py          # publiczne API modułu
├── models.py            # Pydantic: ReferencePack / ReferenceFieldProfile / reguły / raport
├── registry.py          # ładowanie pakietów z packs/*/pack.json + mapowanie pole→profil
├── compliance.py        # silnik zgodności + Reference Score (czysta interpretacja, zero fizyki)
├── validation.py        # most do walidatora ENM (ValidationIssue, kody reference.*)
└── packs/
    ├── iec60617/pack.json           # norma symboli: słownik kind→symbol IEC (parytet z frontendem)
    ├── iec62271/pack.json           # norma rozdzielnic: PROFILE PÓL + blokada uziemnika
    ├── elektrometal_e2alpha/pack.json  # rodzina e²ALPHA + warstwa sterownicza e²TANGO (→§11)
    ├── siemens_8djh/pack.json
    ├── schneider_sm6/pack.json
    ├── abb_unigear/pack.json
    ├── abb_safering/pack.json
    └── osd_enea/pack.json           # standard sieci dystrybucyjnej Enea Operator
```

Warstwa: `reference_engine` to warstwa REFERENCJI (interpretacja danych modelu, zero fizyki,
zero mutacji modelu — analogicznie do warstwy Analysis). Konsumenci: walidator ENM (na żywo),
API (`/api/reference/*`), Inspektor ENM (zakładka „Referencje"), testy parytetu kreatora
i słownika §12.4, agenci AI/designer (pkt 9: pytają registry, nie zgadują).

## §3. Model danych i wersjonowanie (pkt 11)

`ReferencePack` (JSON, walidowany Pydantic przy ładowaniu):

| Pole | Znaczenie |
|---|---|
| `pack_id` | stabilny identyfikator (`iec62271`, `abb_safering`, …) |
| `kind` | `norm` \| `manufacturer` \| `osd` |
| `name_pl`, `version` | nazwa + wersja referencji (zmiana referencji = edycja JSON, bez przebudowy kodu) |
| `status` | kanon `SourceStatus` katalogu: `repo_verified` / `requires_catalog` / … |
| `source_document_refs` | URL-e/oznaczenia źródeł publicznych (reguła „nie fabrykuj danych producenta") |
| `switchgear_family_ref` | TYLKO pakiety `manufacturer` — ref do `SWITCHGEAR_FAMILY_REGISTRY` |
| `field_profiles` | TYLKO pakiet niosący profile (V1: `iec62271`) |
| `symbol_map` | TYLKO `iec60617`: kind aparatu → nazwa symbolu PL + `SymbolId` frontendu |
| `station_rules` | TYLKO `osd`: identyfikatory reguł stacyjnych zaimplementowanych w silniku |
| `notes_pl` | uczciwy opis pochodzenia i ograniczeń danych |

`ReferenceFieldProfile`:
- `profile_id`, `name_pl`,
- `required` (aparaty obowiązkowe — kind z `BayPrimaryDevice.kind`),
- `one_of_groups` (grupy alternatywne, np. funkcja łączeniowa toru `[LOAD_SWITCH, CB]`),
- `optional`, `forbidden`,
- `canonical_order` (szablon kolejności OD SZYNY W DÓŁ; sprawdzenie podciągiem na aparatach
  TORU GŁÓWNEGO — aparaty z definicji boczne ES/SA/VT poza sprawdzeniem kolejności, §18.1
  SLD_CAD_SPEC_V3 / V12K-033),
- `lateral_only` (aparaty, które NIE mogą leżeć w osi toru: ES, SURGE_ARRESTER —
  `placement` musi być `GROUND_BRANCH`/`OFF_PATH`).

## §4. Profile pól V1 (pakiet `iec62271`)

Kolejność zawsze od szyny w dół. Profile są zgodne (i egzekwowane testem) z §12.4
SLD_CAD_SPEC_V3 i z `bay_templates.py`:

| profile_id | required | one_of | canonical_order (tor główny) |
|---|---|---|---|
| `line_breaker` | DS, CB, CT, ES, CABLE_HEAD | — | DS→CB→CT→DS→CABLE_HEAD |
| `rmu_line` | ES, CABLE_HEAD | {LOAD_SWITCH, CB} | DS→LOAD_SWITCH→CB→CT→DS→CABLE_HEAD |
| `rmu_transformer` | ES, TRANSFORMER_DEVICE | {FUSE, CB} | DS→LOAD_SWITCH→CB→FUSE→CT→DS→CABLE_HEAD→TRANSFORMER_DEVICE |
| `transformer_fuse` | DS, FUSE, TRANSFORMER_DEVICE | — | jw. |
| `transformer_breaker` | DS, CB, TRANSFORMER_DEVICE | — | jw. |
| `measurement` | DS, VT | — | DS |
| `coupler` | DS, CB | — | DS→CB→CT→DS |
| `der_source` | DS, CB, CABLE_HEAD | — | DS→CB→CT→DS→CABLE_HEAD |
| `reserve` | DS | — | DS |
| `aux` | DS, FUSE | — | DS→FUSE |

`forbidden` minimalne i pewne (zero fałszywych alarmów): aparaty DER
(GENERATOR_*/PCS/BATTERY) w każdym profilu pola rozdzielczego; TRANSFORMER_DEVICE w polach
liniowych/pomiarowych/sprzęgłowych. Symbole mini-bloków DER frontendu (derPv/derBess/
derGenerator) są poza parytetem profili — to symbole źródła, nie stos aparatów pola
(udokumentowany wyjątek, patrz `apparatusSequence.ts` nagłówek).

## §5. Mapowanie pole→profil (jedno źródło)

`registry.profile_id_for_bay(bay_role, station_type)` — lustro frontendowego
`mapStationBayRoleToMiniRole`:

- `station_type == 'gpz'`: IN/OUT → `line_breaker`; TR → `transformer_breaker`;
  MEASUREMENT → `measurement`; COUPLER → `coupler`; OZE → `der_source`; FEEDER → `reserve`.
- stacje pozostałe (technologia RMU, V12K-031-A): IN/OUT → `rmu_line`;
  TR → `rmu_transformer`; MEASUREMENT → `measurement`; COUPLER → `coupler`;
  OZE → `der_source`.
- FEEDER (obie technologie) obejmuje dwa kanoniczne szablony — rozróżnienie
  deterministycznie z DANYCH pola: obecny bezpiecznik ⇒ `aux` (potrzeb
  własnych), inaczej `reserve` (rezerwowe).

Integracja kreatora (pkt 2/4 dyrektywy): generator szablonów rodzin
(`canonical_fallback._build_family_template`) filtruje aparaty bazowego
szablonu do słownika `allowed_apparatus_kinds` rodziny (wspólne mapowanie:
`catalog/switchgear/apparatus_vocabulary.py` — to samo, którego używa silnik
zgodności) — kreator nie może wygenerować pola z aparatem spoza rodziny
(np. CT w szablonach rodzin RMU SafeRing/8DJH). Transformator pola leży poza
celką — nigdy nie jest filtrowany.

## §6. Walidacja NA ŻYWO (pkt 3 dyrektywy)

Walidator ENM (`enm/validator.py::_check_warnings`) wywołuje
`reference_engine.validation.reference_validation_issues(enm)` przy KAŻDEJ walidacji —
czyli natychmiast po każdej operacji topologicznej (`POST /enm/ops` waliduje przed zapisem)
i przy `GET /enm/validate`. Zasady:

- Sprawdzana jest wyłącznie ŚCIEŻKA DANYCH (`bay.primary_devices` niepuste). Pusta lista =
  konwencja rysunkowa, która Z DEFINICJI wywodzi się z profili (parytet §8) — zero domysłu.
- Kody: `reference.bays.missing_required_apparatus`,
  `reference.bays.missing_switching_function`, `reference.bays.forbidden_apparatus`,
  `reference.bays.apparatus_order_mismatch`, `reference.bays.earth_switch_in_main_path`.
- Severity: `IMPORTANT` (ostrzeżenie, nie blocker — model policzalny, schemat niezgodny
  z referencją). Komunikaty PL z `FixAction` → `BayModal`.
- Pakiety producenckie NIE ostrzegają na żywo, dopóki pole/stacja nie jest związana z
  rodziną (`bay.bay_template_ref` z prefiksem `<FAMILY_REF>__`) — pełna ocena rodzin
  dostępna zawsze w raporcie zgodności (§7).

## §7. Silnik zgodności + Reference Score (pkt 7/8)

`compliance.evaluate_enm(enm, pack_ids=None)` → `ReferenceComplianceReport`:

- Per pole (ścieżka danych) i per pakiet: lista sprawdzeń `pass`/`fail` z powodem PL
  (pkt 7: „✓ zgodny z IEC 62271 / ✗ 8DJH: aparat CT spoza słownika rodziny").
- Sprawdzenia normowe: required / one_of / forbidden / kolejność / aparat boczny w osi /
  blokada uziemnika (wspólny predykat z W034 — `enm/interlock_rules.py`, jedna prawda).
- Sprawdzenia producenckie (dane rodziny Z KATALOGU): typ pola ∈ `allowed_bay_kinds`,
  aparaty ∈ `allowed_apparatus_kinds` (mapowanie kind→słownik rodziny udokumentowane w
  `compliance.py`; TRANSFORMER_DEVICE poza celką — pomijany), napięcie znamionowe
  rodziny ≥ napięcie sieci (dobór rozdzielnicy), oraz — gdy pakiet niesie
  `cell_configurations` (dane z publicznego katalogu producenta, z cytowaniem
  strona/tabela) — dopasowanie składu pola do KTÓREJKOLWIEK konfiguracji celki
  (`family.cell_match`: aparaty standardowe celki ⊆ pole ⊆ standard+opcje; brak
  danych celek = sprawdzenie nie istnieje — bramka danych).
- Sprawdzenia OSD (`station_rules`): V1 implementuje
  `osd.station.prefabricated_compact_preferred` (Zeszyt 1/2 standardu Enea Operator:
  stacja kompaktowa prefabrykowana jako rozwiązanie podstawowe dla nowych stacji SN/nN —
  ostrzeżenie, gdy `construction_type` stacji SN/nN jest znany i inny).
- **Reference Score** per pakiet: `round(100 · passed / applicable)`;
  `applicable == 0` → score `null` + status „nie dotyczy" (uczciwe, zero sztucznych 100%).
- Determinizm: findings sortowane (element_ref → rule_code), raport stabilny dla tego
  samego ENM (test determinizmu obowiązkowy).

## §8. Parytet i egzekwowanie jednego źródła (pkt 4/5/10)

1. **Frontend mirror**: `frontend/src/ui/sld/reference/iec62271.pack.json` +
   `iec60617.pack.json` — bajtowo identyczne z pakietami backendu; parytet egzekwuje test
   backendu `tests/reference_engine/test_pack_parity.py` (czerwony przy rozjeździe).
2. **Test zgodności §12.4** (`apparatusSequence.referenceParity.test.ts`): każdy stos
   konwencji `apparatusSymbolsForRole` spełnia swój profil (required ⊆ stos po mapowaniu
   symbol→kind, kolejność podciągiem, forbidden ∅, ES/SA lateralne wg
   `planApparatusSymbolIds`) + NEGATYW-SABOTAŻ (wstrzyknięty breaker do stosu rmu_line
   musi oblać test).
3. **Test zgodności kreatora** (`test_reference_packs.py`): wszystkie szablony
   `BAY_TEMPLATE_*` oraz szablony rodzin (`list_switchgear_solution_templates_for_manufacturer`)
   spełniają profile — kreator nie może wygenerować pola niezgodnego z referencją.
4. **Słownik symboli**: `symbol_map` pakietu `iec60617` = mapowanie
   `symbolIdForPrimaryDeviceKind` (test parytetu po obu stronach).
5. Wyrocznia geometrii `bay_template_probe` (buildScene) pozostaje bez zmian — pilnuje
   RENDERU; testy referencyjne pilnują DEFINICJI.

## §9. API i konsumenci (pkt 9/10)

- `GET /api/reference/packs` — lista pakietów (id, nazwa, kind, wersja, status, źródła).
- `GET /api/reference/packs/{pack_id}` — pełny pakiet.
- `GET /api/cases/{case_id}/reference/compliance[?packs=a,b]` — raport zgodności + score.
- Inspektor ENM, zakładka „Referencje": tabela score per pakiet + lista sprawdzeń ✓/✗.
- Agenci AI / kreatory / eksporty: WYŁĄCZNIE przez `reference_engine` (registry/API).
  Definiowanie składu pola poza pakietami = naruszenie V12K-060.

## §10. Render Profile (pkt 6) — stan V1 i PLAN

Model sceny jest niezależny od stylu (styl = czysta funkcja prezentacji od `SymbolId`).
V1 rejestruje JEDEN zaimplementowany profil renderowania: `iec_classic` (obecna biblioteka
`symbols/defs.ts`/`glyphs.tsx`, IEC 60617). Style producenckie (ETANGO/SM6/8DJH/UniGear/
SafeRing) wymagają ZWERYFIKOWANYCH wzorników graficznych producenta — zgodnie z regułą
„nie fabrykuj danych producenta" nie wolno ich zmyślić. Pozycja PLAN z warunkiem danych
(wpis w execplanie; dostarczenie wzorników = czysta praca nad danymi + glifami, bez zmiany
architektury).

## §11. Korekta faktograficzna: „e²TANGO" (uczciwość danych)

Dyrektywa właściciela wymienia „Elektrometal e²TANGO" jako rodzinę rozdzielnic.
Weryfikacja źródeł publicznych (2026-07-17): **e²TANGO to rodzina sterowników polowych /
zabezpieczeń** Elektrometal Energetyka (karta katalogowa K-3.2.8, e²TANGO-600/800/1000/1200);
rodziną ROZDZIELNIC SN tego producenta jest **e²ALPHA** (w katalogu repo jako
`ELEKTROMETAL__E2ALPHA`, `repo_verified`). Pakiet referencyjny nazwano zgodnie z prawdą
produktową: `elektrometal_e2alpha`, a sterowniki e²TANGO ujęto w nim jako referencję
warstwy zabezpieczeniowo-sterowniczej (`protection_control_refs`). Korekta zgłoszona
właścicielowi w raporcie rundy.

## §12. Wyrocznie i testy (obowiązkowe negatywy)

| Test | Gryzie gdy |
|---|---|
| `test_reference_packs.py::test_registry_loads_all_packs` | pakiet nie ładuje się / zła wersja / brak źródeł |
| `test_reference_packs.py::test_manufacturer_packs_bind_catalog_families` | ref do nieistniejącej rodziny |
| `test_reference_packs.py::test_bay_templates_comply_with_profiles` | kreator definiuje pole poza referencją |
| `test_reference_packs.py::test_family_solution_templates_comply` | szablon rodziny niezgodny z profilem |
| `test_pack_parity.py` | mirror frontendu ≠ pakiet backendu |
| `test_compliance_engine.py` (pozytyw + sabotaże) | brak required / zła kolejność / ES w osi / aparat spoza rodziny NIE wykryty |
| `test_reference_validation.py` (walidator, pozytyw + negatyw) | ostrzeżenia `reference.*` nie emitują się na żywo |
| `test_reference_engine_api.py` | endpointy łamią kontrakt |
| `apparatusSequence.referenceParity.test.ts` (+ sabotaż) | słownik §12.4 rozjeżdża się z profilami |
| determinizm raportu | ten sam ENM → różny raport |
