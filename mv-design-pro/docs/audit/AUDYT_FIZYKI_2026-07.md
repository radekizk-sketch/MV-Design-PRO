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
| D | — | — | — |
| E | — | — | — |
| F | — | — | — |
| G | — | — | — |
| H | — | — | — |

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
