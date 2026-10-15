# System ochrony elektroenergetycznej -- Specyfikacja kanoniczna

**Status:** BINDING (normatywny)
**Wersja:** 1.0
**Data:** 2026-02-17
**Powiazanie:** SYSTEM_SPEC.md, ARCHITECTURE.md, IEC_IDMT_CANON.md, VENDOR_CURVES.md

---

## Spis tresci

1. [Model ochrony](#1-model-ochrony)
2. [Typy przekaznikow](#2-typy-przekaznikow)
3. [Krzywe TCC (Time-Current Characteristics)](#3-krzywe-tcc-time-current-characteristics)
4. [Walidacja selektywnosci](#4-walidacja-selektywnosci)
5. [Operacje domenowe ochrony](#5-operacje-domenowe-ochrony)
6. [White Box dla ochrony](#6-white-box-dla-ochrony)
7. [Powiazanie z analizami zwarciowymi](#7-powiazanie-z-analizami-zwarciowymi)
8. [Materialowe parametry CT/VT z katalogu](#8-materialowe-parametry-ctvt-z-katalogu)

---

## 1. Model ochrony

System ochrony w MV-DESIGN-PRO modeluje trzy kategorie aparatow pomiarowo-zabezpieczeniowych:
przekladniki pradowe (CT), przekladniki napieciowe (VT) oraz przekazniki zabezpieczeniowe (Relay).
Kazdy z tych elementow jest reprezentowany przez niezmienny (frozen) model domenowy.

### 1.1 CT -- Przekladnik pradowy (Current Transformer)

Przekladnik pradowy transformuje prad pierwotny strony SN na prad wtorny
proporcjonalny, dostepny dla ukladow pomiarowych i zabezpieczeniowych.

**Model domenowy:**

| Parametr | Typ | Jednostka | Opis |
|----------|-----|-----------|------|
| `id` | UUID | -- | Unikalny identyfikator przekladnika |
| `ratio_primary_a` | float | A | Prad znamionowy strony pierwotnej |
| `ratio_secondary_a` | float | A | Prad znamionowy strony wtornej (typowo 1 A lub 5 A) |
| `class` | string | -- | Klasa dokladnosci (np. "5P20", "10P10", "0.5") |
| `burden_va` | float | VA | Moc znamionowa obciazenia wtornego |
| `catalog_item_id` | string | -- | Referencja do pozycji katalogowej (opcjonalnie) |

**Przeliczenie pradow:**

$$
I_{wtorny} = I_{pierwotny} \cdot \frac{I_{n,wtorny}}{I_{n,pierwotny}}
$$

$$
I_{pierwotny} = I_{wtorny} \cdot \frac{I_{n,pierwotny}}{I_{n,wtorny}}
$$

**Przekladnia CT:**

$$
\theta_i = \frac{I_{n,pierwotny}}{I_{n,wtorny}}
$$

**Przyklad:** CT 400/5 A -- przekladnia $\theta_i = 80$, klasa 5P20.

**Implementacja referencyjna:** `domain.protection_engine_v1.CTRatio`

**Warunki walidacji:**
- `ratio_primary_a > 0`
- `ratio_secondary_a > 0` (typowo 1 lub 5)
- `burden_va > 0`

### 1.2 VT -- Przekladnik napieciowy (Voltage Transformer)

Przekladnik napieciowy transformuje napiecie strony SN na napiecie wtorne
proporcjonalne, dostepne dla ukladow pomiarowych i zabezpieczeniowych.

**Model domenowy:**

| Parametr | Typ | Jednostka | Opis |
|----------|-----|-----------|------|
| `id` | UUID | -- | Unikalny identyfikator przekladnika |
| `ratio_primary_v` | float | V | Napiecie znamionowe strony pierwotnej |
| `ratio_secondary_v` | float | V | Napiecie znamionowe strony wtornej (typowo 100 V lub 100/sqrt(3) V) |
| `class` | string | -- | Klasa dokladnosci (np. "0.5", "1.0", "3P") |
| `burden_va` | float | VA | Moc znamionowa obciazenia wtornego |
| `catalog_item_id` | string | -- | Referencja do pozycji katalogowej (opcjonalnie) |

**Przekladnia VT:**

$$
\theta_u = \frac{U_{n,pierwotny}}{U_{n,wtorny}}
$$

**Przyklad:** VT 15000/100 V -- przekladnia $\theta_u = 150$, klasa 0.5.

**Warunki walidacji:**
- `ratio_primary_v > 0`
- `ratio_secondary_v > 0`
- `burden_va > 0`

### 1.3 Relay -- Przekaznik zabezpieczeniowy

Przekaznik zabezpieczeniowy realizuje funkcje ochronne na podstawie sygnalow
z przekladnikow CT/VT. Kazdy przekaznik jest powiazany z polem rozdzielni
oraz z aparatem wykonawczym (wylacznikiem).

**Model domenowy:**

| Parametr | Typ | Opis |
|----------|-----|------|
| `id` | UUID | Unikalny identyfikator przekaznika |
| `relay_id` | string | Stabilny identyfikator (etykieta uzytkownika) |
| `type` | RelayType | Typ przekaznika (OVERCURRENT, EARTH_FAULT, DIRECTIONAL, DIFFERENTIAL) |
| `settings` | RelaySettings | Nastawy przekaznika (zaleznie od typu) |
| `tcc_curve_ref` | string | Referencja do krzywej TCC (kod krzywej IEC lub vendor) |
| `field_binding` | FieldBinding | Powiazanie z polem stacji |
| `breaker_binding` | BreakerBinding | Powiazanie z aparatem wykonawczym (wylacznik CB) |
| `ct_ratio` | CTRatio | Przekladnia pradowa CT przypisana do przekaznika |
| `manufacturer` | string | Producent przekaznika (opcjonalnie) |
| `model` | string | Model przekaznika (opcjonalnie) |

**FieldBinding:**

| Parametr | Typ | Opis |
|----------|-----|------|
| `field_id` | string | Identyfikator pola rozdzielni |
| `station_id` | string | Identyfikator stacji |

**BreakerBinding:**

| Parametr | Typ | Opis |
|----------|-----|------|
| `breaker_id` | string | Identyfikator wylacznika (CB) |
| `attached_cb_id` | string | Alias: ID aparatu wykonawczego do wyzwalania |

**Implementacja referencyjna:** `domain.protection_engine_v1.RelayV1`

**Niezmienniki:**
- Przekaznik MUSI byc powiazany dokladnie z jednym wylacznikiem (`breaker_binding`)
- Przekaznik MUSI miec przypisana przekladnie CT (`ct_ratio`)
- Nastawy przekaznika sa niezmienne (frozen) -- zmiana wymaga nowej instancji

---

## 2. Typy przekaznikow

### 2.1 NADPRADOWY (Overcurrent) -- funkcje ANSI 50/51

Przekaznik nadpradowy realizuje dwie podstawowe funkcje ochronne:
- **Funkcja 51 (I>):** Zabezpieczenie nadpradowe czasowe z charakterystyka zaleznoczasowa (IDMT)
- **Funkcja 50 (I>>):** Zabezpieczenie zwarciowe bezzwloczne lub z malym opoznieniem

#### 2.1.1 Funkcja 51 -- Zabezpieczenie nadpradowe czasowe (I>)

**Nastawy:**

| Nastawa | Parametr | Typ | Jednostka | Zakres | Opis |
|---------|----------|-----|-----------|--------|------|
| Prad rozruchowy | `Ipickup_a` | float | A | > 0 | Prog pobudzenia (strona wtorna CT) |
| Mnoznik czasowy | `time_dial` (TMS) | float | -- | 0.05 -- 10.0 | Time Multiplier Setting |
| Typ krzywej | `curve_type` | IECCurveType | -- | SI/VI/EI/LTI | Krzywa IEC 60255 |
| Czas resetowania | `reset_time_s` | float | s | >= 0 | Czas powrotu po zaniku pradu |
| Ograniczenie czasu | `max_time_s` | float | s | > 0 lub None | Maksymalny czas zadzialanis (opcjonalny clamp) |

**Krzywe IEC 60255-151 (BINDING):**

| Krzywa | Skrot | Stala A | Wykladnik B |
|--------|-------|---------|-------------|
| Standard Inverse | SI | 0.14 | 0.02 |
| Very Inverse | VI | 13.5 | 1.0 |
| Extremely Inverse | EI | 80.0 | 2.0 |
| Long Time Inverse | LTI | 120.0 | 1.0 |

**Implementacja referencyjna:** `domain.protection_engine_v1.Function51Settings`

#### 2.1.2 Funkcja 50 -- Zabezpieczenie zwarciowe (I>>)

**Nastawy:**

| Nastawa | Parametr | Typ | Jednostka | Opis |
|---------|----------|-----|-----------|------|
| Prad pobudzenia | `Iinstant_a` | float | A | Prog zadzialanis I>> (strona wtorna CT) |
| Czas zadzialanis | `t_trip_s` | float | s | Czas wyzwolenia (None = bezzwlocznie) |
| Aktywnosc | `enabled` | bool | -- | Czy funkcja 50 jest aktywna |

**Warunek zadzialanis:**

$$
I_{zmierzony} > I_{nastawa,I>>}
$$

Jesli warunek spelniony i `t_trip_s` jest zdefiniowany, wyzwolenie nastepuje
po czasie `t_trip_s`. Jesli `t_trip_s = None`, wyzwolenie jest bezzwloczne.

**Implementacja referencyjna:** `domain.protection_engine_v1.Function50Settings`

#### 2.1.3 Stopien I>>> (opcjonalny)

Trzeci stopien nadpradowy (high-set instantaneous), stosowany w specjalnych
konfiguracjach. Parametryzacja analogiczna do funkcji 50.

**Implementacja referencyjna:** `domain.protection_device.OvercurrentStageSettings` (stage_50_high)

### 2.2 ZIEMNOZWARCIOWY (Earth Fault) -- funkcje ANSI 50N/51N

Zabezpieczenie ziemnozwarciowe reaguje na skladowa zerowa pradu (I0).

#### 2.2.1 Funkcja 51N -- Zabezpieczenie ziemnozwarciowe czasowe (I0>)

**Nastawy:**

| Nastawa | Parametr | Typ | Jednostka | Opis |
|---------|----------|-----|-----------|------|
| Prad rozruchowy | `I0pickup_a` | float | A | Prog pobudzenia pradu zerowego |
| Mnoznik czasowy | `time_dial_0` (TMS) | float | -- | Time Multiplier Setting |
| Typ krzywej | `curve_type_0` | IECCurveType | -- | Krzywa IEC (SI/VI/EI/LTI) lub DT |
| Czas resetowania | `reset_time_0_s` | float | s | Czas powrotu |

**Warunek zadzialanis:**

$$
I_0 > I_{0,nastawa}
$$

Czas zadzialanis obliczany z krzywej IDMT analogicznie jak dla funkcji 51,
z podstawieniem pradu skladowej zerowej $I_0$ zamiast pradu fazowego.

#### 2.2.2 Funkcja 50N -- Zabezpieczenie ziemnozwarciowe szybkie (I0>>)

**Nastawy:**

| Nastawa | Parametr | Typ | Jednostka | Opis |
|---------|----------|-----|-----------|------|
| Prad pobudzenia | `I0instant_a` | float | A | Prog zadzialanis I0>> |
| Czas zadzialanis | `t_trip_0_s` | float | s | Czas wyzwolenia (None = bezzwlocznie) |
| Aktywnosc | `enabled` | bool | -- | Czy funkcja 50N jest aktywna |

**Implementacja referencyjna:** `domain.protection_device.OvercurrentProtectionSettings` (stage_51n, stage_50n)

### 2.3 KIERUNKOWY (Directional) -- opcjonalny

Zabezpieczenie kierunkowe nadpradowe (funkcja 67) reaguje na prad wyzszy od
progu nastawczego plynacy w okresloskim kierunku. Wymaga sygnalu napieciowego
z VT do okreslenia kierunku mocy zwarciowej.

**Status:** Opcjonalny, zarezerwowany do przyszlej implementacji.
Struktura `OvercurrentStageSettings` posiada pole `directional: bool`
przygotowane na te funkcjonalnosc.

**Wymagane dane dodatkowe:**
- Sygnal napieciowy z VT (referencja fazowa)
- Kat charakterystyczny MTA (Maximum Torque Angle)
- Strefa dzialania (forward/reverse)

### 2.4 ROZNICOWY (Differential) -- opcjonalny

Zabezpieczenie roznicowe (funkcja 87) porownuje prady wchodzace i wychodzace
z chronionej strefy (np. transformator, szyny zbiorcze).

**Status:** Opcjonalny, zarezerwowany do przyszlej implementacji.

**Wymagane dane dodatkowe:**
- Prady z CT po obu stronach chronionego obiektu
- Prad roznicowy: $I_{diff} = |I_1 - I_2|$
- Prad stabilizujacy: $I_{stab} = \frac{|I_1| + |I_2|}{2}$
- Charakterystyka roznicowa (progi, pochylenie)

---

## 3. Krzywe TCC (Time-Current Characteristics)

### 3.1 Definicja krzywych IEC 60255-151

Krzywe czasowo-pradowe IDMT (Inverse Definite Minimum Time) definiuja zaleznosc
czasu zadzialanis zabezpieczenia od wielokrotnosci pradu wzgledem nastawy rozruchowej.

**Formula ogolna (BINDING):**

$$
t = TMS \cdot \frac{K}{(I/I_s)^\alpha - 1}
$$

gdzie:
- $t$ -- czas zadzialanis [s]
- $TMS$ -- mnoznik czasowy (Time Multiplier Setting), bezwymiarowy, $TMS > 0$
- $K$ -- stala krzywej (bezwymiarowa)
- $\alpha$ -- wykladnik krzywej (bezwymiarowy)
- $I$ -- prad zwarciowy (mierzony) [A]
- $I_s$ -- prad rozruchowy (nastawa pickup) [A]

**Wielokrotnosc pradowa:**

$$
M = \frac{I}{I_s}
$$

### 3.2 Parametry krzywych (BINDING)

| Krzywa | Oznaczenie | K | alpha | Zrodlo |
|--------|------------|-----|-------|--------|
| Standard Inverse | SI | 0.14 | 0.02 | IEC 60255-151:2009 Tabela 1 |
| Very Inverse | VI | 13.5 | 1.0 | IEC 60255-151:2009 Tabela 1 |
| Extremely Inverse | EI | 80.0 | 2.0 | IEC 60255-151:2009 Tabela 1 |
| Long Time Inverse | LTI | 120.0 | 1.0 | IEEE C37.112-2018 |

### 3.3 Definicje poszczegolnych krzywych

#### SI (Standard Inverse) -- Normalna odwrotna

$$
t = TMS \cdot \frac{0{,}14}{(I/I_s)^{0{,}02} - 1}
$$

Charakterystyka: lagodna zaleznosc czasu od pradu. Roznica czasow miedzy
niskimi a wysokimi wielokrotnosciami pradowymi jest stosunkowo niewielka.

#### VI (Very Inverse) -- Bardzo odwrotna

$$
t = TMS \cdot \frac{13{,}5}{(I/I_s) - 1}
$$

Charakterystyka: silniejsza zaleznosc czasu od pradu. Czas maleje odwrotnie
proporcjonalnie do wielokrotnosci pradowej.

#### EI (Extremely Inverse) -- Ekstremalnie odwrotna

$$
t = TMS \cdot \frac{80{,}0}{(I/I_s)^2 - 1}
$$

Charakterystyka: bardzo silna zaleznosc czasu od pradu. Przy duzych
wielokrotnosciach pradowych czas zadzialanis jest bardzo krotki.

#### LTI (Long Time Inverse) -- Dlugoczasowa odwrotna

$$
t = TMS \cdot \frac{120{,}0}{(I/I_s) - 1}
$$

Charakterystyka: wolna krzywa z dlugimi czasami zadzialanis.
Stosowana dla zabezpieczen przed przeciazeniem.

### 3.4 Warunki dzialania

**Warunek zadzialanis (trip):**

$$
M > 1 \quad \Leftrightarrow \quad I > I_s
$$

Przekaznik zadziala (wyzwoli wylacznik) tylko wtedy, gdy prad zmierzony
przekracza nastawe rozruchowa.

**Warunek braku zadzialanis (no-trip):**

Jesli $M \leq 1$, przekaznik NIE zadziala. Wartosc zwracana: `None` (brak tripa),
stan: `NO_TRIP`.

**Zachowanie graniczne:**

$$
\lim_{M \to 1^+} t = +\infty
$$

Przy prądzie rownym nastawie rozruchowej czas zadzialanis daży do nieskonczonosci.
Jest to matematycznie poprawne zachowanie.

### 3.5 Wlasciwosci matematyczne

**Monotonicznosc:** Dla ustalonych TMS, K, alpha i $M_1 < M_2$ gdzie $M_1, M_2 > 1$:

$$
t(M_2) < t(M_1)
$$

Funkcja czasu zadzialanis jest scisle malejaca dla $M > 1$.

**Liniowosc TMS:**

$$
t(TMS = k) = k \cdot t(TMS = 1)
$$

TMS skaluje czas zadzialanis liniowo.

### 3.6 Deterministyczne wyliczanie

**NIEZMIENNIK:** Te same nastawy (TMS, K, alpha, I_s) i ten sam prad zwarciowy I
zawsze produkuja identyczna krzywa TCC.

Wymagania:
- Obliczenia w arytmetyce IEEE 754 double precision (64-bit float)
- Wyniki zaokraglane do 6 miejsc po przecinku
- Brak wartosci NaN lub Inf w danych wyjsciowych
- Serializacja JSON kanoniczna (posortowane klucze, konsekwentne formatowanie)

**Implementacja referencyjna:** `domain.protection_engine_v1.iec_curve_time_seconds()`

### 3.7 Cache krzywych TCC

Obliczone krzywe TCC sa cachowane w snapshocie analizy ochrony pod kluczem
`tcc_curves_cache`. Cache jest indeksowany parą (relay_id, curve_type).

**Struktura cache:**

```
tcc_curves_cache:
  <relay_id>:
    curve_type: "SI" | "VI" | "EI" | "LTI"
    parameters:
      K: float
      alpha: float
      TMS: float
      I_s: float
    points:
      - { M: float, t_s: float }
      - ...
    fingerprint: SHA-256(canonical_input)
```

**Inwalidacja cache:** Cache jest nieważny, gdy zmienia sie jakakolwiek nastawa
przekaznika lub parametry krzywej. Inwalidacja jest automatyczna na podstawie
porownania fingerprint.

---

## 4. Walidacja selektywnosci

### 4.1 Zasada selektywnosci

Selektywnosc (selectivity / grading) oznacza, ze w przypadku zwarcia
wylacza je tylko ten wylacznik, ktory jest najblizej miejsca zwarcia.
Zabezpieczenia kolejno wyzsze (blizsze zrodla) dzialaja z coraz wiekszym
opoznieniem jako rezerwa.

### 4.2 Wymagany odstep czasowy (CTI)

Wymagany odstep czasowy pary jest suma skladnikow kryteriow projektowych koordynacji
(`application.analyses.protection.coordination.models.CoordinationConfig`, jawnych w wyniku
w `summary.kryteria` i przy kazdej parze jako `required_margin_s`):

$$
\Delta t_{min} = t_{wyl} + t_{wybieg} + t_{zapas}
$$

Wartosci domyslne: czas wlasny wylacznika 0,05 s, wybieg przekaznika 0,05 s, zapas 0,10 s
(razem 0,20 s); projektant podaje wlasne w zadaniu koordynacji (`config`). Kryteria nie sa
progami pasm werdyktu — koordynacja nie wydaje werdyktow (zakaz P-06).

### 4.3 Algorytm koordynacji E-28 (karta BIEG-ZABEZPIECZEN-Z-MODELU)

```
WEJSCIE:
  - model sieci (ENM) z urzadzeniami i nastawami (protection_assignments, D-21),
  - bieg zwarciowy MAKSYMALNY i MINIMALNY policzone dla TEJ SAMEJ sieci
    (siec_biegu_zgodna_z_modelem — odcisk sieci bez zabezpieczen),
  - bieg rozplywu (opcjonalny — prady robocze wylacznikow),
  - pary wskazane (opcjonalne) i kryteria (opcjonalne).

ALGORYTM:
  1. Jedna sciezka oceny (application.analyses.protection.ocena_nadpradowa) na obu biegach:
     strefa kazdego urzadzenia z topologii modelu (skladowa za wylacznikiem od strony
     zasilania), prad przekaznika = bilans pradow galezi na granicy klastra zacisku
     (rozplyw pradu zwarciowego biegu), czas = najszybszy pobudzony stopien
     (rdzen IEC 60255).
  2. Pary (nadrzedne, podrzedne): z zawierania stref (strefa podrzednego jest wlasciwym
     podzbiorem strefy nadrzednego; bezposrednie nadrzedne = najmniejsza obejmujaca strefa;
     dwie rowne najmniejsze = odmowa pary z kandydatami) albo wskazane jawnie i sprawdzone
     TYM SAMYM predykatem zawierania.
  3. Dla kazdej pary i KAZDEGO punktu zwarcia w strefie podrzednego (bieg maksymalny):
        t_pod = t(I_pod), t_nad = t(I_nad)   — kazde urzadzenie przy WLASNYM pradzie,
        stan pary: ODSTEP / NADRZEDNE_NIE_POBUDZA / PODRZEDNE_NIE_ZADZIALA /
                   ZADNE_NIE_ZADZIALA (fakt, kto zadziala),
        Delta t = t_nad − t_pod (gdy oba zadzialaja).
     Punkt pokazywany dla pary: NAJMNIEJSZY odstep (brak zadzialania podrzednego = −inf,
     nadrzedne sie nie pobudza = +inf); punkty z danymi niewiarygodnymi (ALF przekladnika)
     pominiete z przyczyna.
  4. Czulosc (bieg minimalny) i przeciazalnosc (bieg rozplywu) — ilorazy obok wymaganych.

WYJSCIE:
  - SelectivityCheck dla kazdej pary: czasy, prady, odstep, wymagany odstep, stan pary,
    zdanie z liczbami (notes_pl); SensitivityCheck i OverloadCheck z ilorazami,
  - podsumowanie liczbami (najmniejszy odstep, najmniejsze ilorazy, liczba braków),
  - BEZ werdyktu pary i BEZ werdyktu ogolnego (zakaz P-06).
```

### 4.4 Formuła odstepu czasowego

Dla pary (nadrzedne U, podrzedne D) przy zwarciu w punkcie strefy D:

$$
\Delta t = t_U(I_U) - t_D(I_D)
$$

gdzie $I_U$, $I_D$ — prady przekaznikow w tym samym punkcie zwarcia (moga sie roznic, gdy
miedzy wylacznikami przylaczone sa zrodla). Wartosc wymagana $\Delta t_{min}$ wg §4.2 stoi
obok liczby; ocene podejmuje projektant.

### 4.5 Konwencja znakow

- **Dodatni odstep** ($\Delta t > 0$): nadrzedne dziala pozniej od podrzednego — kolejnosc zgodna z zasada §4.1
- **Ujemny odstep** ($\Delta t < 0$): nadrzedne dziala wczesniej od podrzednego
- **Odstep zero** ($\Delta t = 0$): przekazniki dzialaja jednoczesnie

### 4.6 Wynik koordynacji

**Implementacja referencyjna:**
- `application.analyses.protection.coordination.analyzer.OvercurrentCoordinationAnalyzer`,
- `domain.protection_device.SelectivityCheck` / `SensitivityCheck` / `OverloadCheck` / `StanPary`,
- trasa `POST /api/protection-coordination/projects/{project_id}/run` (ekran E-28, raport PDF/DOCX).

Testy przypinajace brak werdyktu: `backend/tests/application/analyses/protection/coordination/
test_overcurrent_coordination.py` (porownanie punktu, podsumowanie, punkt pary),
`backend/tests/e2e/test_protection_exports_deterministic.py` (raport bez kolumny werdyktu).

### 4.7 Pary selektywnosci

Pary wynikaja jednoznacznie z topologii (zawieranie stref urzadzen) albo sa wskazane jawnie
przez projektanta (P-05 w brzmieniu karty BIEG-ZABEZPIECZEN-Z-MODELU: „wskazuje projektant albo
wynikaja jednoznacznie z przypisania"). Niejednoznacznosc daje nazwana odmowe z kandydatami
(`para_niejednoznaczna`), para wskazana wbrew topologii — odmowe `para_sprzeczna_z_topologia`,
para z urzadzeniem bez oceny — `para_bez_oceny`; nigdy domyslny wybor.

**Niezmienniki (przypiete testami `pary_z_topologii` / `pary_jawne`):**
- Para zawiera dwa rozne urzadzenia; oba maja ocene jednej sciezki,
- Pary z topologii i pary wskazane zgodne z topologia sa rowne (jeden predykat zawierania).

---

## 5. Operacje domenowe ochrony

Ponizsze operacje stanowia kompletny interfejs domenowy do zarzadzania
aparatura ochronna w modelu sieci.

### 5.1 add_ct -- Dodanie przekladnika pradowego do pola

**Sygnatura:**

```
add_ct(
    field_id: str,
    ratio_primary_a: float,
    ratio_secondary_a: float,
    accuracy_class: str,
    burden_va: float,
    catalog_item_id: str | None = None
) -> CT
```

**Warunki wstepne:**
- Pole `field_id` MUSI istniec w modelu sieci
- `ratio_primary_a > 0`
- `ratio_secondary_a > 0` (typowo 1 lub 5)
- `burden_va > 0`

**Efekt:** Tworzy nowa instancje CT i przypisuje ja do wskazanego pola stacji.

### 5.2 add_vt -- Dodanie przekladnika napieciowego do pola

**Sygnatura:**

```
add_vt(
    field_id: str,
    ratio_primary_v: float,
    ratio_secondary_v: float,
    accuracy_class: str,
    burden_va: float,
    catalog_item_id: str | None = None
) -> VT
```

**Warunki wstepne:**
- Pole `field_id` MUSI istniec w modelu sieci
- `ratio_primary_v > 0`
- `ratio_secondary_v > 0`
- `burden_va > 0`

**Efekt:** Tworzy nowa instancje VT i przypisuje ja do wskazanego pola stacji.

### 5.3 add_relay -- Dodanie przekaznika (pole albo wylacznik liniowy)

Karta BIEG-ZABEZPIECZEN-Z-MODELU (2026-09-30, decyzja D-21): urzadzenia i nastawy zabezpieczen
zyja w MODELU sieci (`ProtectionAssignment` z lista `settings`). Kontrakt payloadu i struktura
nastaw: `docs/domain/ENM_OP_CONTRACTS_CANONICAL_FULL.md` §4.13.

**Kotwica (dokladnie jedna):** pole rozdzielcze (`bay_ref`) albo wylacznik liniowy POZA polem
(`breaker_ref`, wstawiony `insert_section_switch_sn` z `switch_type="WYLACZNIK"`; przynaleznosc
aparatu do pola rozstrzyga jedna regula `enm/wylaczniki_liniowe.py::pole_aparatu`). Przekladnik
(`add_ct`) przyjmuje te same kotwice.

**Nastawy:** opcjonalne przy dodaniu — brak = przypisanie z nazwanym brakiem nastaw (ocena
wstrzymuje wtedy WYLACZNIE to urzadzenie, z akcja naprawcza). Prog w jednostce strony
przekladnika (`threshold_unit`: `A_WTORNY`/`A_PIERWOTNY`, PZ-09); zakresy katalogu z podstawa
(krotnosc In albo A wtorne) sprawdza jedna funkcja `catalog/zakresy.py`.

### 5.4 update_protection_settings -- Zapis nastaw zabezpieczenia w modelu

`update_protection_settings(protection_ref, settings)` — nastepca skasowanej zaslepki
`update_relay_settings`. Nastawy sprzeczne (np. TMS przy `DT`, zwloka przy krzywej zaleznej,
jednostka spoza slownika) sa odrzucane kodem `relay.settings_invalid`; niekompletne sa przyjmowane,
a brak nazywa ocena. Zmiana nastaw zmienia odcisk modelu — wynik oceny zabezpieczen staje sie
nieaktualny, ale bieg zwarciowy NIE (odcisk sieci bez zabezpieczen
`enm/hash.py::hash_sieci_bez_zabezpieczen` jest jedynym kryterium ponownego uzycia biegu
zwarciowego). Pisarz nastaw w sciezce projektanta: edytor `EdytorNastawZabezpieczenia`
(ekran „Zabezpieczenia i automatyka" E-27 oraz karta elementu na schemacie).

### 5.5 Operacje skasowane

`update_relay_settings`, `link_relay_to_field` (zaslepki z odmowa) i `validate_selectivity`
(pary z kolejnosci listy, prad 10 × nastawa) skasowane w karcie BIEG-ZABEZPIECZEN-Z-MODELU;
`calculate_tcc_curve` — w karcie W3-A. Bramka wskrzeszenia:
`scripts/legacy_public_path_guard.py` (`FORBIDDEN_W3A_FUNCTION_NAMES`).

### 5.6 Jedna sciezka oceny nadpradowej

`application/analyses/protection/ocena_nadpradowa.py` — jedyne miejsce oceny zabezpieczen
nadpradowych fazowych (bieg `protection_sn`, koordynacja E-28, czas wylaczenia pola i galezi,
porownanie A/B, raport):

1. nastawy z modelu rozwiazane na strone pierwotna przez przekladnie przekladnika
   (`network_model/pochodne`),
2. strefa urzadzenia z topologii modelu (strona bez zrodla zasilania); punkty zwarcia strefy
   (`punkty_zwarcia_strefy`) = szyny strefy z wierszem biegu SC oraz ZACISK POLA za
   wylacznikiem (szyna pomocnicza toru pola, karta POLA-W-TORZE), ktorego Ik'' i rozplyw sa
   wierszem szyny pola po stronie zasilania (`enm.tor_pola.szyna_raportowa` — to samo zrodlo co
   pakiet nastaw); zacisk pomocniczy raportowany pod szyna TEJ strefy nie jest drugim punktem;
   znaczniki TCC koordynacji czytaja ten sam punkt wyniku,
3. prad przekaznika = bilans pradow galezi klastra zacisku za wylacznikiem z rozplywu
   zwarciowego biegu (zrodlo: wklady galeziowe rdzenia IEC 60909); prad nieliczbowy albo strona
   dolna transformatora = nazwana odmowa,
4. czas stopnia wylacznie z rdzenia `network_model/solvers/protection_iec60255.py` (B-01);
   czas urzadzenia = najszybszy pobudzony stopien,
5. wiarygodnosc wzgledem granicy dokladnosci przekladnika (ALF · I1n, IEC 61869-2) — wynik
   niewiarygodny nie jest liczba zapasu,
6. rekord werdyktu wyjasnialnego (`werdykt`) dla kazdej pary (urzadzenie, punkt strefy).

### 5.7 Koordynacja E-28

`POST /api/protection-coordination/projects/{project_id}/run` z identyfikatorami biegow
(MAX, MIN, rozplyw). Pary stopniowania z zagniezdzenia stref (jawne pary sprawdzane tym samym
predykatem; niejednoznacznosc = odmowa z kandydatami). Selektywnosc w kazdym punkcie strefy
urzadzenia podrzednego (bieg MAX, prady przekaznikow z jednej sciezki), czulosc z najmniejszego
pradu przekaznika w biegu MIN wobec najczulszego stopnia, przeciazalnosc z pradu roboczego
wylacznika z biegu rozplywu. Krzywe TCC = czas urzadzenia z rdzenia w siatce pradow.

---

## 6. White Box dla ochrony

Wszystkie obliczenia ochrony MUSZA byc w pelni audytowalne zgodnie z zasada
WHITE BOX (patrz: SYSTEM_SPEC.md). Ponizej zdefiniowano wymagane formaty
dokumentacji obliczeniowej.

### 6.1 Format LaTeX-only

Wszystkie formuly matematyczne w dokumentacji obliczeniowej MUSZA byc
zapisane w formacie LaTeX, w blokach `$$...$$`.

**Uzycie nazewnictwa polskiego w notatkach, angielskiego w symbolach matematycznych.**

### 6.2 Definicja krzywej -- szablon White Box

$$
t = TMS \cdot \frac{K}{(I/I_s)^\alpha - 1}
$$

**Podstawienie (przyklad dla SI, TMS=0.3, I_s=100 A, I=500 A):**

$$
t = 0{,}3 \cdot \frac{0{,}14}{(500/100)^{0{,}02} - 1} = 0{,}3 \cdot \frac{0{,}14}{5^{0{,}02} - 1}
$$

$$
5^{0{,}02} = 1{,}032789
$$

$$
t = 0{,}3 \cdot \frac{0{,}14}{1{,}032789 - 1} = 0{,}3 \cdot \frac{0{,}14}{0{,}032789} = 0{,}3 \cdot 4{,}269689 = 1{,}280907 \text{ s}
$$

### 6.3 Czas zadzialanis -- pelne podstawienie

Kazdy wynik czasu zadzialanis MUSI zawierac:

1. **Formula ogolna** -- wzor krzywej z symbolami
2. **Dane wejsciowe** -- wartosci liczbowe nastaw i pradu zwarciowego
3. **Podstawienie** -- wzor z wstawionymi wartosciami liczbowymi
4. **Obliczenia posrednie** -- kazdy krok obliczeniowy z wynikiem
5. **Wynik koncowy** -- czas zadzialanis z jednostka [s]
6. **Weryfikacja jednostek** -- potwierdzenie poprawnosci wymiarowej

**Struktura trace (ProtectionTraceStep):**

```json
{
  "step": "iec_curve_evaluation",
  "description_pl": "Obliczenie czasu zadzialanis krzywej IEC SI",
  "inputs": {
    "formula": "t = TMS * A / (M^B - 1)",
    "standard": "IEC 60255-151:2009",
    "curve_type": "IEC_STANDARD_INVERSE",
    "A": 0.14,
    "B": 0.02,
    "TMS": 0.3,
    "I_secondary": 6.25,
    "I_pickup_secondary": 1.25,
    "M": 5.0
  },
  "outputs": {
    "M_power_B": 1.032789,
    "denominator": 0.032789,
    "base_time_s": 4.269689,
    "trip_time_s": 1.280907,
    "result": "TRIP"
  }
}
```

### 6.4 Odstepy czasowe par -- tabela White Box

Tabela par (nadrzedne/podrzedne) z liczbami — bez kolumny werdyktu (zakaz P-06):

| Para | Nadrzedne | Podrzedne | $I_D$ [A] | $t_U$ [s] | $t_D$ [s] | $\Delta t$ [s] | $\Delta t_{min}$ [s] | Kto zadziala |
|------|-----------|-----------|-----------|-----------|-----------|----------------|----------------------|--------------|
| P1 | R-GPZ-01 | R-SN-01 | 5000 | 1.281 | 0.854 | 0.427 | 0.200 | oba (odstep) |
| P2 | R-GPZ-01 | R-SN-02 | 3000 | 1.850 | 1.233 | 0.617 | 0.200 | oba (odstep) |
| P3 | R-SN-01 | R-OZE-01 | 2000 | 0.854 | 0.712 | 0.142 | 0.200 | oba (odstep) |

**White Box trace dla odstepu:**

$$
\Delta t = t_{nad}(I_{nad}) - t_{pod}(I_{pod})
$$

$$
\Delta t = 1{,}281 - 0{,}854 = 0{,}427 \text{ s} \qquad (\Delta t_{min} = 0{,}200 \text{ s})
$$

Slad (`trace_steps`, krok `selektywnosc`) niesie wszystkie punkty strefy podrzednego pary
(`SelectivityCheck.to_dict()` kazdego punktu) i punkty pominiete z przyczyna.

### 6.5 Determinizm White Box

**NIEZMIENNIK:** Te same nastawy przekaznikow produkuja identyczny White Box
(identyczny trace, identyczne formuly, identyczne wyniki liczbowe).

Determinizm jest zapewniony przez:
- Kanoniczne sortowanie wynikow (po relay_id, po point_id)
- Zaokraglanie do 6 miejsc po przecinku
- Sygnature SHA-256 danych wyjsciowych (deterministic_signature)

---

## 7. Powiazanie z analizami zwarciowymi

### 7.1 Zrodlo danych zwarciowych

Analiza ochrony NIE wykonuje obliczen zwarciowych samodzielnie.
Korzysta z wynikow solvera IEC 60909 (warstwy Solver) poprzez referencje
`sc_run_id` do zakonczonego przebiegu obliczen zwarciowych.

**BINDING:** Analiza ochrony = warstwa interpretacji (Analysis Layer).
NIE zawiera fizyki zwarciowej -- jedynie interpretuje wyniki solvera.

### 7.2 Prady zwarciowe odniesione do nastaw

Dla kazdego przekaznika system porownuje prady zwarciowe z progami nastaw:

| Prad zwarciowy | Symbol | Opis | Porownanie z nastawa |
|----------------|--------|------|---------------------|
| Prad poczatkowy zwarcia symetrycznego | $I_k''$ | Wartosc skuteczna poczatkowego pradu zwarcia | $I_k'' / \theta_i$ vs $I_{pickup}$ |
| Prad udarowy | $i_p$ | Wartosc szczytowa pradu zwarciowego | Informacyjnie |
| Prad cieplny | $I_{th}$ | Rownowazny prad cieplny | Porownanie z wytrzymaloscia cieplna |

### 7.3 Warunki czulosci (sensitivity)

Zabezpieczenie MUSI reagowac na minimalne prady zwarciowe w strefie chronionej.

**Warunek czulosci:**

$$
k_c = \frac{I_{k,min}}{\theta_i \cdot I_{nastawa}} \geq 1{,}2
$$

gdzie:
- $k_c$ -- wspolczynnik czulosci (wymagany $\geq 1{,}2$, zalecany $\geq 1{,}5$)
- $I_{k,min}$ -- minimalny prad zwarciowy w strefie chronionej [A]
- $\theta_i$ -- przekladnia CT
- $I_{nastawa}$ -- nastawa rozruchowa (pickup) po stronie wtornej CT [A]

**Bez werdyktu (zakaz P-06, karta BIEG-ZABEZPIECZEN-Z-MODELU):** koordynacja E-28 podaje
iloraz $k_c$ liczony z NAJMNIEJSZEGO prądu przekaźnika w strefie urządzenia (bieg
zwarciowy minimalny, prąd gałęzi przez przekładnik — nie $I_k''$ szyny) i progu PIERWOTNEGO
najczulszego stopnia ($\theta_i \cdot I_{nastawa}$), obok wartości wymaganej z kryteriów
projektowych (`CoordinationConfig.sensitivity_ratio_required`, domyślnie 1,5) i zdania
z liczbami. Ocenę liczby zostawia projektantowi — pasma „PASS / MARGINAL / FAIL" skasowane.

**Implementacja referencyjna:** `application.analyses.protection.coordination.analyzer`
(`_czulosc`) → `domain.protection_device.SensitivityCheck` (`ratio`, `required_ratio`,
`notes_pl`).

### 7.4 Warunki selektywnosci I>> (funkcja 50)

Nastawa I>> MUSI byc wyzsza od maksymalnego pradu zwarciowego w sasiednim
obszarze chronienia (selektywnosc nadpradowa):

$$
I_{nastawa,I>>} \geq k_b \cdot \frac{I_{k,max}(nastepne\_zabezpieczenie)}{\theta_i}
$$

gdzie:
- $k_b$ -- wspolczynnik selektywnosci (typowo $k_b = 1{,}1 \ldots 1{,}3$)
- $I_{k,max}(nastepne\_zabezpieczenie)$ -- maksymalny prad zwarciowy
  w punkcie instalacji nastepnego zabezpieczenia [A]

**Implementacja referencyjna:** kryterium DOBORU nastawy I>> metodą Hoppela
(`application.protection_settings.engine.ProtectionSettingsEngine`, `InstantaneousSettings`,
`k_b`) — nie sprawdzenie koordynacji E-28 (dawne klasy sprawdzeń I>> skasowane przy konwergencji
metodyk nastaw, W3-C2).

### 7.5 Wytrzymalosc cieplna

Nastawa I>> MUSI zapewniac ochrone cieplna przewodow:

$$
I_{nastawa,I>>} \leq k_{bth} \cdot \frac{I_{th,dop}}{\theta_i}
$$

gdzie:
- $k_{bth}$ -- wspolczynnik wytrzymalosci cieplnej
- $I_{th,dop}$ -- dopuszczalny prad cieplny przewodu [A]

**Implementacja referencyjna:** kryterium DOBORU nastawy I>> metodą Hoppela
(`application.protection_settings.engine.ProtectionSettingsEngine`, `ThermalWithstandResult`,
`k_bth`).

### 7.6 Raport wystarczalnosci nastaw

System generuje raport porownujacy nastawy z pradami zwarciowymi,
odpowiadajac na pytanie: czy nastawy sa wystarczajace dla danych
pradow zwarciowych?

**Elementy raportu koordynacji (PDF/DOCX, `network_model/reporting/protection_report_*`):**
1. Podsumowanie liczbami -- najmniejszy odstep czasowy par i najmniejsze ilorazy czulosci
   i przeciazalnosci obok wartosci wymaganych, liczba sprawdzen bez wyznaczonej wartosci
2. Tabela czulosci -- iloraz $I_{min}/I_s$ i wymagany
3. Tabela selektywnosci -- $t_{pod}$, $t_{nad}$, odstep i wymagany odstep (CTI)
4. Tabela przeciazalnosci -- iloraz $I_s/I_{rob}$ i wymagany
5. Zdania z liczbami w jezyku polskim (`notes_pl`) pod kazda tabela

Raport NIE zawiera werdyktu ogolnego ani kolumny werdyktu (zakaz P-06).

---

## 8. Materialowe parametry CT/VT z katalogu

### 8.1 CT -- Przekladnik pradowy (pozycja katalogowa)

Katalog (Type Library) przechowuje materialowe parametry CT dostepne
do wyboru przez uzytkownika.

| Parametr | Typ | Jednostka | Opis |
|----------|-----|-----------|------|
| `catalog_item_id` | string | -- | Unikalny identyfikator pozycji katalogowej |
| `version` | string | -- | Wersja pozycji katalogowej |
| `manufacturer` | string | -- | Producent |
| `model` | string | -- | Model / seria |
| `ratio_primary_a` | float | A | Prad znamionowy strony pierwotnej |
| `ratio_secondary_a` | float | A | Prad znamionowy strony wtornej (1 A lub 5 A) |
| `accuracy_class` | string | -- | Klasa dokladnosci (np. "5P20", "10P10", "0.2S") |
| `burden_va` | float | VA | Moc znamionowa obciazenia wtornego |
| `knee_point_v` | float | V | Napiecie punktu kolanowego (knee point) |
| `rated_short_time_current_ka` | float | kA | Znamionowy prad krotkotrwaly wytrzymywany |
| `rated_dynamic_current_ka` | float | kA | Znamionowy prad dynamiczny |
| `insulation_level_kv` | float | kV | Poziom izolacji |

**Klasy dokladnosci CT (typowe):**

| Klasa | Zastosowanie |
|-------|-------------|
| 0.2S, 0.5S | Pomiarowe (rozliczeniowe) |
| 0.5, 1.0 | Pomiarowe (ogolne) |
| 5P10, 5P20 | Zabezpieczeniowe (blad < 5% do ALF*In) |
| 10P10, 10P20 | Zabezpieczeniowe (blad < 10% do ALF*In) |

**Punkt kolanowy (knee point):**

Napiecie, przy ktorym rdzen CT zaczyna sie nasycac. Wazne dla oceny
poprawnosci dzialania zabezpieczen przy duzych pradach zwarciowych.

$$
V_{knee} > I_{k,max} \cdot (R_{ct} + R_{obciazenie})
$$

### 8.2 VT -- Przekladnik napieciowy (pozycja katalogowa)

| Parametr | Typ | Jednostka | Opis |
|----------|-----|-----------|------|
| `catalog_item_id` | string | -- | Unikalny identyfikator pozycji katalogowej |
| `version` | string | -- | Wersja pozycji katalogowej |
| `manufacturer` | string | -- | Producent |
| `model` | string | -- | Model / seria |
| `ratio_primary_v` | float | V | Napiecie znamionowe strony pierwotnej |
| `ratio_secondary_v` | float | V | Napiecie znamionowe strony wtornej |
| `accuracy_class` | string | -- | Klasa dokladnosci (np. "0.5", "1.0", "3P") |
| `burden_va` | float | VA | Moc znamionowa obciazenia wtornego |
| `rated_voltage_factor` | float | -- | Wspolczynnik napieciowy (typowo 1.2 lub 1.9) |
| `insulation_level_kv` | float | kV | Poziom izolacji |
| `connection_type` | string | -- | Typ polaczenia ("phase-to-phase", "phase-to-ground") |

**Klasy dokladnosci VT:**

| Klasa | Zastosowanie |
|-------|-------------|
| 0.2, 0.5 | Pomiarowe (rozliczeniowe) |
| 1.0, 3.0 | Pomiarowe (ogolne) |
| 3P, 6P | Zabezpieczeniowe |

### 8.3 Powiazanie katalogu z modelem

Uzytkownik wybiera pozycje katalogowa (CT lub VT), a system automatycznie
wypelnia parametry modelu domenowego na jej podstawie. Uzytkownik moze
nadpisac parametry (override), ale pozycja katalogowa pozostaje jako referencja
do audytu.

**Sciezka wyboru:**
1. Uzytkownik otwiera katalog CT/VT
2. Filtruje pozycje wg producenta, przekladni, klasy
3. Wybiera pozycje
4. System tworzy instancje CT/VT z parametrami katalogowymi
5. Uzytkownik moze nadpisac poszczegolne parametry (opcjonalnie)

---

## Dodatek A: Referencje normatywne

1. **IEC 60255-151:2009** -- Measuring relays and protection equipment -- Part 151: Functional requirements for over/under current protection
2. **IEC 60255-3:1989** (zastapiona) -- Electrical relays -- Part 3: Single input energizing quantity measuring relays with dependent or independent time
3. **IEEE C37.112-2018** -- IEEE Standard for Inverse-Time Characteristics Equations for Overcurrent Relays
4. **IEC 60044-1** -- Instrument transformers -- Part 1: Current transformers
5. **IEC 60044-2** -- Instrument transformers -- Part 2: Inductive voltage transformers
6. **IEC 61869-2** -- Instrument transformers -- Part 2: Additional requirements for current transformers (zastepuje 60044-1)
7. **IEC 61869-3** -- Instrument transformers -- Part 3: Additional requirements for inductive voltage transformers (zastepuje 60044-2)

## Dodatek B: Slownik terminow

| Termin polski | Termin angielski | Skrot | Opis |
|---------------|-----------------|-------|------|
| Przekladnik pradowy | Current Transformer | CT | Transformuje prad SN na prad wtorny |
| Przekladnik napieciowy | Voltage Transformer | VT | Transformuje napiecie SN na napiecie wtorne |
| Przekaznik zabezpieczeniowy | Protection Relay | -- | Urzadzenie realizujace funkcje ochronne |
| Nastawa rozruchowa | Pickup current | I_s, I_pickup | Prog pobudzenia zabezpieczenia |
| Mnoznik czasowy | Time Multiplier Setting | TMS | Skaluje czas zadzialanis krzywej IDMT |
| Krzywa czasowo-pradowa | Time-Current Characteristic | TCC | Zaleznosc t = f(I) |
| Selektywnosc | Selectivity / Grading | -- | Hierarchia dzialania zabezpieczen |
| Czulosc | Sensitivity | -- | Zdolnosc wykrycia minimalnego zwarcia |
| Margines czasowy | Time margin | delta_t | Roznica czasow sasiadujacych stopni |
| Wylacznik | Circuit Breaker | CB | Aparat wykonawczy (wykonuje polecenie z przekaznika) |
| Pole rozdzielni | Switchgear bay / Field | -- | Sekcja rozdzielni z aparatura |
| Prad zwarciowy | Fault current | I_k | Prad plynacy w trakcie zwarcia |
| Prad udarowy | Peak short-circuit current | i_p | Wartosc szczytowa pradu zwarciowego |
| Prad cieplny | Thermal equivalent current | I_th | Rownowazny prad cieplny |
| Punkt kolanowy | Knee point | V_knee | Granica nasycenia rdzenia CT |

## Dodatek C: Mapa implementacji

| Element specyfikacji | Modul implementacyjny | Plik |
|---------------------|----------------------|------|
| Model CT (CTRatio) | domain.protection_engine_v1 | `backend/src/domain/protection_engine_v1.py` |
| Model przekaznika (RelayV1) | domain.protection_engine_v1 | `backend/src/domain/protection_engine_v1.py` |
| Nastawy nadpradowe | domain.protection_device | `backend/src/domain/protection_device.py` |
| Analiza ochrony (wyniki) | domain.protection_analysis | `backend/src/domain/protection_analysis.py` |
| Koordynacja selektywnosci | ~~domain.protection_coordination_v1~~ | skasowany w W1 (2026-09-09) (0 konsumentow produkcyjnych); implementacja = wycinek W4 mapy |
| Krzywe vendor | domain.protection_vendors | `backend/src/domain/protection_vendors.py` |
| Silnik ochrony (execute) | domain.protection_engine_v1 | `backend/src/domain/protection_engine_v1.py` |
| Obliczanie IEC IDMT | domain.protection_engine_v1 | `backend/src/domain/protection_engine_v1.py` |
| Trace emitter | ~~application.trace_emitters~~ | skasowany 2026-09-10 (klaster ślad v2 bez konsumenta; ślad kanoniczny = white_box_trace + application/proof_engine) |
| API ochrony | api.protection_engine_v1 | `backend/src/api/protection_engine_v1.py` |

---

## Historia dokumentu

| Wersja | Data | Autor | Zmiany |
|--------|------|-------|--------|
| 1.0 | 2026-02-17 | MV-DESIGN-PRO Team | Poczatkowa specyfikacja kanoniczna systemu ochrony |
