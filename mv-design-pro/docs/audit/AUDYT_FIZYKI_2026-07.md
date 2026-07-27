# AUDYT FIZYKI, MATEMATYKI I WIEDZY INŻYNIERSKIEJ — 2026-07

**Status:** BINDING (dyrektywa właściciela 2026-07-24: „za dużo błędów … wykonaj dogłębny
audyt i naprawę całego systemu pod kątem poprawności fizyki, matematyki, wiedzy
inżynierskiej"). Dokument jest jednocześnie PROMPTEM audytu i rejestrem jego wykonania.

---

## 1. Dlaczego ten audyt

W jednej sesji (2026-07-24) przy odbiorze jednej karty znaleziono **sześć** defektów
fizyki, z których każdy unieważniał wyniki w swoim torze:

| # | Defekt | Skutek |
|---|--------|--------|
| 1 | Zasilanie systemowe zwierane uziemieniem idealnym | moc zwarciowa sieci **nie wchodziła do obliczeń wcale** |
| 2 | Wkład źródeł przekształtnikowych bez przeniesienia | 15 mikroźródeł 0,4 kV → 21,5 kA na szynie 15 kV |
| 3 | Mieszanie per-unit z SI w wkładach gałęziowych | niespójne moduły prądów |
| 4 | Główna szyna GPZ wykluczona z celów zwarcia | brak podstawowej wielkości projektowej |
| 5 | Pominięty człon zmiany bazy napięciowej transformatora | Ik″ zaniżony o 9,3 %, cicho |
| 6 | Sieć zwarciowa nie znała zaczepu | rozpływ i zwarcie widziały DWA różne transformatory |

**Wspólny mianownik nie jest przypadkowy.** Żaden z tych defektów nie został wykryty przez
~6700 testów backendu, bo dominujący wzorzec testu brzmi: *„policz i sprawdź, czy wyszła
liczba, która wyszła poprzednio"*. Taki test blokuje regresję, ale **nie weryfikuje fizyki** —
utrwala ją, także gdy jest błędna. Dwa testy wprost utrwalały defekt (asertowały, że węzeł
zasilający *musi* dać nieprawdopodobny prąd; że „techniczność" szyny wynika ze wzorca
identyfikatora).

## 2. Zasada naczelna audytu

> **Weryfikacja przez NIEZALEŻNY rachunek, nigdy przez utrwaloną liczbę.**

Wynik solvera uznaje się za zweryfikowany wyłącznie wtedy, gdy zgadza się z wartością
policzoną **inną drogą**:

1. **rozwiązanie analityczne** przypadku granicznego (obwód, który da się policzyć ręcznie),
2. **wzór normowy** zastosowany wprost do danych wejściowych (IEC 60909, 60255, 60364…),
3. **niezmiennik fizyczny** (bilans mocy, prawa Kirchhoffa, niezmienniczość mocy przy
   zmianie bazy, symetria, monotoniczność względem parametru),
4. **rachunek kontrolny w innej reprezentacji** (np. składowe symetryczne vs faza).

Zgodność z poprzednim wynikiem to test REGRESJI, nie test poprawności. Oba są potrzebne,
ale test regresji **nigdy** nie zastępuje weryfikacji.

## 3. Taksonomia defektów — czego konkretnie szukać

Wzorce wyprowadzone z sześciu znalezisk; każdy obszar audytu przechodzi przez tę listę.

| Kod | Wzorzec | Pytanie kontrolne |
|-----|---------|-------------------|
| **W1** | Pominięty człon zmiany bazy | Czy każda wielkość w pu jest odniesiona do TEJ SAMEJ bazy? Czy przy zmianie bazy występują OBA człony (mocy i napięcia²)? |
| **W2** | Mieszanie jednostek | Czy w jednym wyrażeniu nie mnoży się pu przez SI? Czy jednostki po obu stronach równania się zgadzają? |
| **W3** | Parametr przyjmowany i ignorowany | Czy każdy argument funkcji jest naprawdę użyty? (grep po nazwie w ciele) |
| **W4** | Brak przeniesienia przez przekładnię | Czy wielkość z innego poziomu napięcia jest przeliczana (prąd ÷ϑ, impedancja ×ϑ²)? |
| **W5** | Byt fikcyjny w modelu | Czy solver liczy na węzłach/gałęziach, które nie mają odpowiednika w modelu? |
| **W6** | Prezentacja steruje fizyką | Czy zakres obliczeń nie zależy od flag widoczności/rysowania? |
| **W7** | Bramka numeryczna na złej wielkości | Czy próg jest nałożony na wielkość niezależną od skali/jednostek? |
| **W8** | Test utrwalający defekt | Czy test sprawdza fizykę, czy tylko powtarza poprzedni wynik? Czy fixtura wyraża intencję w DANYCH, czy w nazwie? |
| **W9** | Rozjazd modeli między analizami | Czy ten sam element ma ten sam model we wszystkich solverach (transformator w PF i SC, grupa połączeń, zaczep)? |
| **W10** | Niedomknięty bilans | Czy suma wkładów = całość? Czy prawa Kirchhoffa domykają się numerycznie? |

## 4. Obszary audytu

Kolejność wg ryzyka × zasięgu konsekwencji projektowych.

| Fala | Obszar | Zakres |
|------|--------|--------|
| **A** | Zwarcia symetryczne (IEC 60909) | Z-bus, Z_Q, K_T, κ, ip, ith, ib, wkłady źródeł i gałęzi, c-factor |
| **B** | Składowe symetryczne i zwarcia niesymetryczne | Z0/Z1/Z2, grupy połączeń, 1F, 2F, 2F-Z, uziemienie punktu neutralnego |
| **C** | Rozpływ mocy | Y-bus, NR/GS/FD, bilans mocy, straty, zaczep, regulacja OZE, PV→PQ |
| **D** | Zabezpieczenia (IEC 60255) | charakterystyki I-t, nastawy, koordynacja, czasy, kierunkowość |
| **E** | Spadki napięć, straty, energia | ΔU, obciążalność, straty obciążeniowe i jałowe |
| **F** | Uziemienia i bezpieczeństwo (IEC 60364) | napięcia dotykowe/krokowe, pętla zwarcia, rezystancja uziomu |
| **G** | Arc flash, wytrzymałość, dobór aparatury | energia łuku, Icw/Idyn, weryfikacja termiczna i dynamiczna |
| **H** | Warstwa interpretacji | czy analizy nie liczą fizyki; czy przenoszą wielkości bez zniekształcenia |

## 5. Metoda wykonania jednej fali

1. **Inwentaryzacja** — wypisz wszystkie wzory i przekształcenia w obszarze (plik:linia).
2. **Przypadek referencyjny** — zbuduj obwód o rozwiązaniu analitycznym; policz ręcznie,
   niezależnie od kodu.
3. **Pomiar** — porównaj; zapisz błąd względny.
4. **Lista kontrolna W1–W10** — przejdź świadomie, punkt po punkcie.
5. **Naprawa u źródła** — nigdy przez korektę wyniku ani obejście w warstwie wyżej.
6. **Test weryfikacyjny** — trwały, z dowodem liczbowym w komentarzu (skąd wartość
   referencyjna i dlaczego jest poprawna). Trafia do `tests/physics_audit/`.
7. **Re-baseline** — wyłącznie z dowodem, że nowa wartość jest poprawna.
8. **Rejestr** — wpis V12K-* + aktualizacja tabeli w §6.

## 6. Rejestr wykonania

| Fala | Stan | Znaleziska | Wpis |
|------|------|-----------|------|
| A | ZAMKNIĘTA | 6 defektów (patrz §1), wszystkie naprawione | V12K-184, V12K-186 |
| B | ZAMKNIĘTA | **0 defektów** — wszystkie niezmienniki zachodzą | — |
| C | ZAMKNIĘTA | **3 defekty** (W1, W9 + hunting OLTC) — naprawione, re-baseline | V12K-187 |
| D | ZAMKNIĘTA | charakterystyki **czyste**; 1 defekt werdyktu kryteriów | V12K-188, V12K-189 |
| E | ZAMKNIĘTA | wzory **dokładne**; 1 luka: brak kierunku mocy (wzrost napięcia) | V12K-190 |
| G | ZAMKNIĘTA | **4 defekty** (W3×3, W9) — najcięższy: I_th rdzennego solvera bez m,n | V12K-192 |

### Fala B — składowe symetryczne: wynik

Sprawdzone niezmienniki analityczne (nie utrwalone liczby); wszystkie zachodzą
z dokładnością maszynową:

| Niezmiennik | Błąd |
|---|---|
| `Ik2/Ik3 = √3/2` dla Z1 = Z2 (tożsamość ścisła) | 1,1·10⁻¹⁴ % |
| `Ik2 = c·Un/\|Z1+Z2\|` | 0,0 % |
| `Ik3 = c·Un/(√3·\|Z1\|)` | 2,2·10⁻¹⁴ % |
| `Ik1 = √3·c·Un/\|Z1+Z2+Z0\|` (Z0 = 0,5·Z1 / Z1 / 3·Z1) | ≤ 2,2·10⁻¹⁴ % |
| **`Ik1 = Ik3` przy Z0 = Z1** (tożsamość ścisła) | 2,2·10⁻¹⁴ % |
| Z1 = Z2 w sieci biernej | dokładnie |

### Fala C — rozpływ mocy: znaleziska

**C-1 (W1) — jedna baza napięciowa dla całej sieci.** `_build_ybus_ohm` składa
admitancje w siemensach, każdą na **własnym** poziomie napięcia gałęzi, a
`build_ybus_pu` mnożyła całą macierz przez **jedno** `z_base` z napięcia slacka.
Poprawne wyłącznie dla sieci jednonapięciowej. Skutek w układzie odpowiadającym
realnemu projektowi (slack na szynie SN GPZ, odbiór za transformatorem stacji
15/0,4 kV):

```
dU na odbiorze nN:  ręcznie 17,70 V  |  solver 0,01 V   → 1406,2×  =  (15/0,4)²
```

**Warunek spadku napięcia u odbiorcy — podstawowa weryfikacja projektowa — był
liczony 1406× za mało; każdy projekt „przechodził".** Analogicznie zaniżone były
straty (52,6× w sieci 110/15) i wszystkie wielkości pochodne (obciążalność,
profil napięcia, ocena OZE).

**C-2 (W9) — rozjazd modeli WEWNĄTRZ solvera.** Y-bus czytała zaczep z modelu
(`tap_changer` → `tap_position` → nakładka), a tor przepływów gałęziowych
**wyłącznie** z nakładki `tap_ratios`. Przy pracującym OLTC przepływy przestawały
być spójne z rozwiązanymi napięciami.

Naprawa: skalowanie każdej gałęzi jej własnym ilorazem baz `(U/U_ref)²` +
przekładnia poza-znamionowa szyn (spójnie z falą A) + jedna funkcja
`_resolve_tap_ratio` dla Y-bus i przepływów. Sieci jednonapięciowe pozostają
**bit-identyczne** (iloraz = 1,0).

### Fala D — zabezpieczenia (IEC 60255): wynik

**Charakterystyki czasowo-prądowe — zero defektów.** Sprawdzone wobec wartości
podręcznikowych `t = TMS·A/(M^B − 1)` oraz niezmienników:

| Sprawdzenie | Wynik |
|---|---|
| SI: M=2 → 10,029 s; M=10 → 2,971 s | błąd ≤ 1,3·10⁻⁵ % |
| VI: M=2 → 13,5 s; M=10 → 1,5 s | dokładnie |
| EI: M=2 → 26,667 s; M=10 → 0,808 s | błąd ≤ 2,4·10⁻⁵ % |
| M ≤ 1 ⇒ brak zadziałania (nie ekstrapolacja) | poprawnie |
| monotoniczność t(I) na każdej krzywej | zachowana |
| liniowość względem TMS | dokładnie (0,0 %) |
| niezmienniczość skali (I i I_pickup ×100) | dokładnie (0,0 %) |
| porządek EI < VI < SI przy dużej krotności | zachowany |

**D-1 — werdykt kryterium nie sprawdzał kryterium.** `_check_selectivity` i
`_check_sensitivity` wydawały `PASS`, gdy **dane wejściowe są dodatnie** — nigdy
nie porównywały wyznaczonych granic ze sobą:

```python
if i_min_primary > 0 and ik_max_next > 0:
    verdict = PASS          # nastawa I_nast nie jest z niczym porownywana
```

Werdykt **ogólny** był poprawny, bo bramkuje go `window_valid` (I_max > I_min),
więc decyzja nie była fałszowana. Ale przy pustym oknie — czyli gdy **żadna
nastawa nie spełnia obu warunków naraz** — raport pokazywał „Selektywność: PASS"
i „Czułość: PASS" obok werdyktu ogólnego FAIL. Projektant nie miał z czego
odczytać, które kryteria się wykluczają ani o ile, a to jest dokładnie ta
informacja, która prowadzi do decyzji (zmiana przekroju, nastawy czasowej,
podział odcinka). Naprawa: przy pustym oknie FAIL dostaje kryterium wyznaczające
dolną granicę oraz to, które wyznaczyło górną, wraz z deficytem w kA i osobnym
krokiem śladu `setting_window_conflict`.

### Fala E — spadki napięć i straty: wynik

**Wzory — zero błędów.** Zweryfikowane rachunkiem niezależnym:

| Sprawdzenie | Błąd |
|---|---|
| `ΔU = √3·I·(R·cosφ + X·sinφ)` (3 przypadki) | 0,00 % |
| `I = P/(cosφ·√3·U)`, `S = P/cosφ` | 0,00 % |

**E-1 — brak kierunku mocy: podgląd nie umiał pokazać WZROSTU napięcia.**
Przelicznik znał wyłącznie „odbiór indukcyjny": `sinφ = √(1−cos²φ)` zawsze dodatni,
walidacja odrzucała `cosφ ≤ 0` oraz `I < 0`. Zwracał więc **zawsze spadek** — a
jest używany także przez dobór kabla toru DER (`der_selection_preview`), gdzie moc
czynna płynie w przeciwną stronę i napięcie w punkcie przyłączenia **rośnie**.
Przy przyłączaniu generacji to właśnie wzrost jest głównym ograniczeniem, więc
kryterium „ΔU% ≤ dopuszczalne" sprawdzało nie tę wielkość, co trzeba.

Naprawa: dwa niezależne znaki — `s_P` (kierunek mocy czynnej) przy członie
`R·cosφ` i `s_Q` (charakter mocy biernej) przy członie `X·sinφ`. Niezależność jest
istotna: falownik oddaje moc czynną i **jednocześnie** może pobierać bierną — na
tym polega regulacja Q(U). Dowód liczbowy (I = 100 A, 5 km, cosφ = 0,95):

| przypadek | ΔU | |
|---|---|---|
| odbiór indukcyjny | +158,68 V | spadek (bez zmian, bit w bit) |
| odbiór skompensowany | +104,59 V | mniejszy spadek |
| OZE pobierające Q | −104,59 V | **wzrost tłumiony regulacją** |
| OZE oddające Q | −158,68 V | **wzrost największy** |

Kryterium doboru kabla DER sprawdza teraz `|ΔU%|`, więc odrzuca kabel zarówno przy
zbyt dużym spadku, jak i przy zbyt dużym wzroście.
| F | — | — | — |
| H | — | — | — |

### Fala G — arc flash, wytrzymałość, dobór aparatury: wynik

**Wzory arc flash IEEE 1584-2018, ścieżka HV/SN (600 V<U≤15 kV) — dokładne.**
Zweryfikowane pełnym niezależnym przeliczeniem od zera (Eq.1, Eq.2, Eq.3-6, Eq.7-10,
Eq.16-18, reimplementacja z surowych współczynników tablicy produkcyjnej, NIE przez
wywołanie kodu repo) na przypadku VCB, 13,8 kV, I_bf=25 kA, t=200 ms, G=152 mm,
D=914,4 mm:

| Wielkość | repo | rachunek niezależny | błąd względny |
|---|---|---|---|
| I_arc | 23,2481 kA | 23,248058 kA | 1,8·10⁻⁶ % |
| E | 7,0585 cal/cm² | 7,058543 cal/cm² | 6,1·10⁻⁶ % |
| AFB | 2830,5882 mm | 2830,588240 mm | 1,4·10⁻⁸ % |

(rozbieżności wyłącznie z zaokrąglenia do 4 miejsc w warstwie prezentacji repo).

**G-1 (W7) — granica ważności I_bf dla HV/SN dziedziczyła próg LV.** Jeden wspólny
przedział 500 A–106 kA stosowany do WSZYSTKICH klas napięcia; norma (zweryfikowana
wobec referencyjnej implementacji open-source rwl/arcflash, `i_arc.rs::i_arc()`)
wymaga 200 A–65 kA dla 600 V<U≤15 kV — INNEGO niż dla U≤600 V (500 A–106 kA). Dla
narzędzia klasy SN to błąd na GŁÓWNYM zakresie zastosowania: punkty SN 200–500 A
błędnie trafiały do ścieżki Ralpha Lee (mniej dokładnej niż IEEE 1584), punkty
65–106 kA błędnie liczyły się ścieżką IEEE mimo bycia poza normą.

**G-2 (W3) — brak korekty Eq.25 dla układów ≤600 V (parametr napięcia rzeczywistego
ignorowany).** Ścieżka LV liczyła KAŻDE napięcie ≤600 V tak, jakby wynosiło dokładnie
600 V (interpolacja klamrowała do wartości kotwy 600 V bez korekty). Dowód liczbowy
(VCB, I_bf=20 kA, G=32 mm, Tab.1@600V produkcyjne): I_arc,600(Eq.1)=16,2723 kA;
poprawka Eq.25 przy rzeczywistym U=208 V daje I_arc=8,7294 kA — różnica −46,35%
względem stanu sprzed naprawy (błąd malejący z napięciem: −8,34% przy 480 V, 0% przy
dokładnie 600 V).

**G-3 (W3, drobny) — wysokość obudowy VCB > 1244,6 mm.** Tab.6 IEEE 1584-2018 wymaga
STAŁEGO limitu 49" dla WYSOKOŚCI konfiguracji VCB (nasycenie EES); repo stosowało
identyczną transformację eq.11/12 jak dla szerokości/VCBB/HCB — różnica do −36% EES
przy niskich napięciach (asymptota zbiega do ok. −2% przy 15 kV).

**G-4 (W9, KRYTYCZNY) — I_th rdzennego solvera IEC 60909 pomijał współczynniki m,n.**
`short_circuit_core.py::compute_post_fault_quantities` liczył
`ith_a = ikss·sqrt(tk_s)` — wymiarowo niespójne (sqrt(sekundy)·prąd ≠ prąd) i
sprzeczne z formułą JUŻ udokumentowaną jako wiążąca w TYM SAMYM repo
(`docs/proof/NORMATIVE_COMPLETION_PACK_IEC_60909.md` §4.7,
`docs/proof_engine/EQUATIONS_IEC60909_SC3F.md` EQ_SC3F_008: I_th=I_k''·√(m+n)) i już
poprawnie zaimplementowana w warstwie proof engine dla SC1 — rozjazd modeli (ta sama
wielkość fizyczna, dwa różne wzory w dwóch warstwach tego samego repo). Rdzenny
solver (FROZEN `ShortCircuitResult.ith_a`) zasila equipment_proof, protection_insight,
normative/OSD i pakiet dowodowy SC3F (który do tej naprawy wyświetlał podstawienie
`sqrt(m+n)` NIESPÓJNE z faktyczną, wyświetlaną liczbą `ith_ka` za każdym razem, gdy
tk_s≠1s — biały box łamał własną zasadę spójności podstawienia).

Dowód liczbowy (fixture solvera, κ=1,9251): t_k=1 s → I_th/I_k''=1,06227 (m=0,12841);
t_k=4 s → I_th/I_k''=1,01592 (m=0,03210) — MALEJE z czasem (składowa DC zanika), a NIE
rośnie jak przy defekcie (`sqrt(4)/sqrt(1) = 2×`). Naprawa: postać zamknięta m (norma,
publiczna, analogiczna do już istniejącej formuły κ w tym samym module) + n=1 (daleko
od generatora — udokumentowane ograniczenie modelu, patrz „Sprawy do decyzji
produktowej"). m_factor/n_factor niesione addytywnie na `ShortCircuitResult` i
przekazane do pakietów dowodowych SC3F, żeby podstawienie White Box było spójne z
wyświetlanym wynikiem.

**Bez defektów:** I_arc (nie I_bf) poprawnie użyty w energii incydentu (x3 i x4);
konwersja cal/cm²↔J/cm² (4,184) poprawna; Idyn porównywane z i_p (prąd szczytowy),
NIE z I_k'' (skuteczny) — potwierdzone w `equipment_proof/generator.py` i
`protection_insight/builder.py`; równoważność energetyczna I²t dla Ith/Icw przy różnych
czasach odniesienia (`Ith_req²·t_k ≤ Icw²·t_cw`) już poprawnie zaimplementowana w
`equipment_proof/generator.py::_check_ith`; brak fabrykacji Icw/Idyn przy braku danych
katalogowych — honest FAIL zamiast wartości domyślnej.

### Fala H — wytrzymałość zwarciowa przewodu (IEC 60949): wynik

**H-1 (W3) — kryterium ZAKODOWANE, ale nigdy nie wywoływane w doborze kabla.**
`_cable_candidates()` (ścieżka `api/grid_source_preview.py` → `propose_mv_cable`) nie
przepisywała z rekordu katalogu ani `ith_1s_a`, ani `jth_1s_a_per_mm2`, mimo że
`CableCandidate` te pola miał, a solver miał gotowe kryterium i gotowy komunikat
odrzucenia `wytrzymalosc_zwarciowa_niewystarczajaca`.

POMIAR PRZED: kryterium sprawdzalne dla **0 z 63** kandydatów kablowych.
POMIAR PO: **55 z 63** kończy się werdyktem PASS/FAIL.

Skutek inżynierski defektu: kandydat przechodził dobór na dwóch kryteriach
(obciążalność długotrwała, spadek napięcia) i nikt nie sprawdzał trzeciego —
normowego i w sieciach SN często wiążącego. Kabel poprawny prądowo i napięciowo
mógł zostać zniszczony pierwszym zwarciem.

**H-2 (W3) — osiem PRODUKCYJNYCH typów katalogu nie ma danych cieplnych.**
YHAKXS AL 50/95/120/150/240 (Telefonika) oraz YHKXS CU 95/150/240 (Bitner,
Telefonika) nie podają ani Ith(1 s), ani Jth(1 s). Podają natomiast materiał żyły
i temperaturę zwarciową 250 °C.

ROZSTRZYGNIĘCIE: k wyprowadzane ze wzoru IEC 60949 § 4, gdy katalog milczy o obu
wielkościach. Granica wobec zakazu zgadywania: zakazane jest przyjęcie materiału,
którego kabel nie podaje; dozwolone jest zastosowanie wzoru normy do materiału,
który kabel **deklaruje** — stałe Qc/β/ρ₂₀ są tablicową własnością *nazwanego*
materiału, tak samo jak ρ_Cu przy rezystancji żyły miedzianej.

KONTROLA POPRAWNOŚCI WZORU wobec wartości, które **ten sam katalog** podaje wprost
dla bliźniaczych typów (najmocniejszy dostępny dowód: liczba nie pochodzi z kodu,
a musi zgodzić się z niezależnym zapisem tablicowym):

| Materiał (XLPE 90→250 °C) | wzór IEC 60949 | katalog wprost | błąd |
|---|---|---|---|
| Aluminium | 94,553 A·√s/mm² | 94 | +0,59 % |
| Miedź | 142,874 A·√s/mm² | 143 | −0,09 % |

Wyniku **nie zaokrąglamy** do wartości tablicowych — to byłaby niejawna korekta.
Zamiast tego źródło k jest zawsze nazwane (`zrodlo_k`), a dowód przy wyprowadzeniu
pokazuje wzór i stałe, nie `k = Jth(1 s)`.

**Pierwszeństwo katalogu jest bezwarunkowe** — także gdy wzór dałby wartość
korzystniejszą. Karta producenta może uwzględniać ograniczenia, których rachunek
adiabatyczny nie widzi (osprzęt, głowice, warunki ułożenia).

**Pozostaje niesprawdzalnych 8 typów** — brakuje im temperatury roboczej (θ_i),
a `CableType.max_temperature_c` ma domyślną wartość klasy 90,0, więc ścieżka
obiektowa **maskuje** ten brak, podczas gdy ścieżka rekordowa raportuje go uczciwie.
Wyprowadzenie θ_i z tego defaultu byłoby derywacją ze zgadniętej danej, więc tego
nie robimy. Do uzupełnienia z kart producentów albo przez usunięcie defaultu —
zapis długu, nie obejście.

## 7. Kryterium odbioru audytu

Fala jest zamknięta, gdy:

- każdy wzór w obszarze ma **test weryfikacyjny oparty na niezależnym rachunku**
  (nie na utrwalonej liczbie), z dowodem w komentarzu;
- lista kontrolna W1–W10 przeszła świadomie, a wynik przejścia jest zapisany;
- wszystkie znalezione defekty są naprawione u źródła (nie obejściem);
- pełna regresja warstwy + guardy + determinizm są zielone;
- wpis w rejestrze konfliktów zawiera dowód liczbowy.

**Audyt nie jest zamknięty, dopóki którakolwiek fala nie ma testu weryfikacyjnego** —
brak testu oznacza, że obszar jest chroniony wyłącznie przed regresją, a nie przed błędem.
