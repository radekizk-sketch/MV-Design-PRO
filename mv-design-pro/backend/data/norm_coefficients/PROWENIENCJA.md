# Współczynniki normowe — prowieniencja i status weryfikacji

Plik `norm_coefficients_ieee1584_iec60853.json` zawiera dane współczynników dostarczone
przez właściciela (2026-05-29) dla modułów D-01 (Arc Flash) i D-06f (obciążalność cykliczna
kabli). Przeniesiony z efemerycznego katalogu uploadów do repozytorium dla trwałości
(kontener jest reclaimowany przy bezczynności — dane muszą być w repo).

## Hierarchia prowieniencji (KRYTYCZNE — nie zawyżać)

| Tier | Znaczenie |
|------|-----------|
| `dane niekompletne` | brak danych |
| **`open-source / audit-pending`** | liczy realny wynik z implementacji open-source; **NIE** zweryfikowane wobec licencjonowanej normy; bramka OSD blokuje użycie **certyfikowane** bez weryfikacji/akceptacji |
| `verified` | zweryfikowane wobec zakupionej kopii IEEE/IEC |

## IEEE 1584-2018 (klucz `ieee_1584_2018`) — D-01 Arc Flash

- **Tablice 1/2/3/4/5/7** (prąd łuku Iarc k1..k10; korekta zmienności; energia/AFB k1..k13
  przy 600/2700/14300 V; korekta obudowy b1..b3).
- **Prowieniencja:** wartości z **open-source'owej implementacji MIT `rwl/arcflash`**
  (GitHub), odwołującej się do kalkulatorów IEEE DataPort. **NIE są to wartości
  z licencjonowanej IEEE Std 1584-2018.**
- **STATUS: `open-source / audit-pending`.** Do obliczeń **certyfikowanych/audytowych**
  wymagana weryfikacja z licencjonowaną kopią IEEE Std 1584-2018. Zakres ważności modelu:
  208 V–15 kV, 3-fazowe; poza zakresem (>15 kV) metoda Ralph Lee (publiczna, osobna ścieżka).
- Źródła (klucz `sources`): oficjalna strona IEEE SA, IEEE DataPort, surowe tablice
  `rwl/arcflash` (table1.rs … table7.rs).

## IEC 60853 (klucz `iec_60853`) — D-06f obciążalność cykliczna

- **NIE jest to „jedna tablica stałych".** IEC 60853 to METODA obliczania obciążalności
  cyklicznej i awaryjnej kabli. Plik zawiera **rejestr parametrów** (M, μ, Y_i, θ_r, γ,
  T1–T4, ΔT4, δ, L, D_e, Q, T_A/T_B, I_em, K_em …) z polami `source_kind`
  (computed/input/library) oraz **szablony** struktur (profil obciążenia, model cieplny,
  wyniki). Większość parametrów jest **computed** — „nie hardkodować globalnie".
- **Prowieniencja:** rejestr dostarczony przez właściciela; metoda wg IEC 60853-1:1985 /
  -2:1989 / -3:2002 (IEC Webstore). Buduje się NA istniejącym IEC 60287 (stacjonarnym).
- **STATUS:** struktura/metoda publiczna (budowana); wartości wejściowe (konstrukcja kabla,
  sieć cieplna, profil) → wynik liczony. Brak wejść → `dane niekompletne`.

## Zasada

Moduły D-01/D-06f ładują współczynniki z TEGO pliku (jedyne źródło danych normowych),
z jawnym tagiem prowieniencji na każdym wyniku. ZAKAZ zmyślania/uzupełniania wartości
spoza tego pliku — brakujący współczynnik to `dane niekompletne`, nie placeholder-liczba.
