# PROGRAM MAGISTRALA MAX — katalogi kabli/przekrojów, parametry normowe, realna sieć (V12K-070)

**Status:** BINDING (dyrektywa właściciela 2026-07-20, zrzut IMG_8271: „magistrale
potrzebują rozbudowy o wykorzystanie katalogów bazy typów kabli i przekrojów; przetestuj
wszystkie parametry normowe do obliczeń w zależności od kabel czy napowietrzna; kreator
musi umożliwiać budowanie realnej sieci a nie pojedynczego odcinka; dodaj do kanonu, opcja
MAX").
**Zakres:** kreator `ui2/kreatory/magistrala` + operacja `continue_trunk_segment_sn` +
katalog kabli/linii + downstream (rozpływ ΔU/straty, zwarcie, obciążalność).

## 1. Audyt wielosoczewkowy (rekonesans kodu, nie z pamięci)

### Co JEST (mocne)
- **Katalog bogaty.** `CableType`: r/x/**c_nf_per_km**, rated_current_a, voltage_rating_kv,
  **cross_section_mm2**, conductor_material, insulation_type, standard, max_temperature_c,
  number_of_cores, **żyła powrotna** (cross-section, materiał, R20, **Jth/Ith 1 s** dla
  zwarć doziemnych). `LineType`: r/x/**b_us_per_km**, rated_current_a, cross_section_mm2,
  conductor_material, standard, max_temperature_c, voltage_rating_kv.
- **Backend materializuje kompletnie i normowo różnicująco.**
  `_apply_materialized_branch_fields` (domain_operations.py): kabel `c_nf_per_km` →
  `b_siemens_per_km = 2πf·C`; linia `b_us_per_km` → `b_siemens_per_km`; składowa zerowa
  r0/x0/b0; **przekrój + żyła powrotna Jth/Ith** (zwarcie doziemne); liczba żył; materiał.
- **Podgląd ΔU z backendu** (R1, `cable-voltage-drop-preview`) — R/X/długość/prąd/cosφ.

### Braki (GAP)
- **GAP-MAG-1 (front pod-wykorzystuje katalog).** `parametryZKatalogu` (magistralaModel)
  ekstrahuje TYLKO r/x/rated_current/voltage — GUBI c_nf/b_us, przekrój, materiał,
  izolację, normę, temp max, Ith żyły powrotnej. `paramReadout` pokazuje 3 pola (R/X/Iznam).
  Projektant nie widzi parametrów normowych właściwych dla typu (kabel vs napowietrzna).
- **GAP-MAG-2 (brak jawnego doboru przekroju).** Picker miesza typy; brak filtra po
  przekroju i podpowiedzi doboru (obciążalność ≥ prąd, ΔU ≤ limit, wytrzymałość zwarciowa
  cieplna Ith ≥ prąd zwarciowy·√t).
- **GAP-MAG-3 (pojedynczy odcinek, nie sieć).** `continue_trunk_segment_sn` dodaje JEDEN
  odcinek + zacisk końcowy, po czym kreator się zamyka; łańcuchowanie przez `next_step`
  otwiera OSOBNĄ operację (modal za modalem). Brak spójnego buildera realnej magistrali
  (ciąg wielu odcinków + stacje/ZK/rozgałęzienia/odbiory bez zamykania okna).

## 2. Parametry normowe per kabel/napowietrzna (kontrakt obliczeń)

| Parametr | Kabel | Linia napowietrzna | Do obliczenia |
|----------|-------|--------------------|---------------|
| R Ω/km | ✅ | ✅ | ΔU, straty, Ik |
| X Ω/km | ✅ (niższe) | ✅ (wyższe) | ΔU, Ik |
| Pojemność C / susceptancja B | **C [nF/km]** → B=2πf·C (prąd ładowania) | **B [µS/km]** (mała) | rozpływ (model π), prąd ładowania |
| Obciążalność Iz [A] | ✅ (grunt/ułożenie) | ✅ (chłodzenie powietrzem, wyższa) | dobór przekroju |
| Przekrój [mm²] | ✅ | ✅ | dobór, Ith |
| Materiał żyły (Cu/Al) | ✅ | ✅ | Ith, R(temp) |
| Izolacja (XLPE/PVC/EPR) | ✅ → temp max | — | temp max, Ith |
| Temp max °C | ✅ (90 XLPE / 70 PVC) | ✅ (wyższa, np. 80) | Ith |
| **Żyła powrotna Jth/Ith 1 s** | ✅ (ekran — zwarcie doziemne) | — (brak żyły powrotnej) | Ik1f cieplne |
| Składowa zerowa r0/x0/b0 | ✅ | ✅ | zwarcie doziemne |

Reguła: parametry i ich obecność zależą od rodzaju (kabel ma C + żyłę powrotną; linia ma B,
brak żyły powrotnej). Wartości liczbowe ZAWSZE z katalogu; wynik z solvera (ZERO fizyki w UI).

## 3. Fazy (opcja MAX)

- **M1 — Katalog + parametry normowe (front surfacing).** `parametryZKatalogu` niesie
  wszystkie pola per typ; `paramReadout` pokazuje parametry normowe warunkowo (kabel: przekrój/
  R/X/C/Iz/temp/materiał/izolacja/Ith żyły powrotnej; linia: przekrój/R/X/B/Iz/temp/materiał).
  Panel teorii rozbudowany o różnice kabel↔napowietrzna. Testy modelu potwierdzają ekstrakcję
  per typ. **(ta runda)**
- **M2 — Builder realnej sieci. ✅ WDROŻONE (V12K-071).** Wybór „Kolejny odcinek" NIE zamyka
  okna: koniec właśnie dodanego odcinka staje się startem następnego (`kontekstKontynuacji`),
  formularz resetuje długość/nazwę (typ zostaje), a panel „Magistrala w budowie" pokazuje rosnącą
  listę odcinków (rodzaj · typ · przekrój · długość) + łączną długość. Akcja główna „Dodaj
  odcinek"; „Anuluj" po pierwszym odcinku zmienia się w „Zakończ budowę" (zamyka + wraca do SLD).
  Elementy na końcu (stacja/ZK/słup) nadal łańcuchują realną operację. Każdy odcinek = realna
  `continue_trunk_segment_sn` w modelu (bez shadow-modelu, bez zmiany kontraktów).
- **M3 — Dobór przekroju (asystent). ✅ WDROŻONE (V12K-072).** Panel „Ocena doboru przekroju"
  interpretuje wartości backendu/katalogu: obciążalność (prąd roboczy ≤ Iz), spadek napięcia
  (ΔU ≤ limit 5%) — ze stanami OK / „Do sprawdzenia" / „Podaj prąd i długość" i konkretnym
  komunikatem naprawczym. Skumulowany spadek ΔU całego ciągu w panelu „Magistrala w budowie"
  (suma odcinków) z ostrzeżeniem po przekroczeniu limitu. Wytrzymałość cieplna Ith ≥ Ik·√tk —
  wskazówka (pełne sprawdzenie po biegu zwarciowym; katalog podaje Ith żyły powrotnej). ZERO
  fizyki: UI porównuje policzone przez solver ΔU i katalogowe Iz z kryteriami, nic nie liczy.

**Program zamknięty: M1 ✅ M2 ✅ M3 ✅** (wszystkie 3 dyrektywy z IMG_8271 zrealizowane).

## 4. Reguły (spójne z kanonem)
- ZERO fizyki w UI; wartości z katalogu, wynik z solvera. FROZEN Result API, ui/sld/**,
  determinizm. Reużycie: istniejące operacje domenowe, `rama/PanelTeorii`, `rama/wykresPomoc`.
- Kontrakt ekranu prowadzącego (FLOW §0.3): po co / z czego / co daje; uczciwe stany zerowe.
