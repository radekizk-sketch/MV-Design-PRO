# Macierz odbioru — wydania IEC 60909-0

**Wyniki referencyjne muszą pochodzić z niezależnego rachunku lub normowych przykładów, a nie z aktualnego solvera.**

| Test | Dane / sytuacja | Oczekiwany rezultat |
|---|---|---|
| A01 | To samo ENM, dwa profile | Dwa niezależne przypadki, identyczna migawka ENM, dwa identyfikatory standardów |
| A02 | Nieznane wydanie | `BLOCKER`, brak wywołania solvera |
| A03 | Profil IEC 2026 bez audytu normy | `BLOCKER`, brak etykiety zgodności |
| A04 | nN: tolerancje ±6% i ±10% | Oddzielne reguły c, bez zgadywania tolerancji |
| A05 | Zerowa lub brakująca pojemność B0 | Odrębny status danych `0` vs `brak` |
| A06 | 2016, niski ZN, współczynnik ziemnozwarciowy 1.4000 | Sprawdzić granicę warunku ścisłego |
| A07 | 2016, niski ZN, współczynnik ziemnozwarciowy 1.4001 | Reguła z 5.2(f) aktywna pod warunkiem dowiedzionych danych |
| A08 | 2026 1F w izolowanej SN | Brak deklaracji IEC 60909-0, osobna metoda |
| A09 | Sieć promieniowa SN 3F | `I''k` w miejscu uszkodzenia = suma zespolona wkładów gałęzi zgodnie z KCL |
| A10 | Sieć pierścieniowa z NOP otwartym/zamkniętym | Rzeczywisty rozpływ prądów gałęziowych zgodny z topologią |
| A11 | Transformator SN/nN ze zmianą zaczepu | Zmiana fizycznie uzasadniona, zgodne bazy jednostek |
| A12 | 1F/2F+Z, grupa Dy(n) | Poprawna blokada/przepływ zerowej składowej według połączeń |
| A13 | Przekształtnik bez katalogowych danych zwarciowych | Brak cichego `k_CIS=1.2` lub innego arbitralnego parametru |
| A14 | PV + BESS + turbina FW | Wszystkie wkłady źródeł i fazory, bez skalarnych proporcji |
| A15 | Zmiana profilu po obliczeniu | Unieważnienie wyników, White-Box, EAZ, SLD i eksportu |
| A16 | Niepoprawne dane 2026 / brak danych | Brak automatycznego fallbacku do 2016 |
| A17 | Report/PDF/JSON | Identyfikator normy, edycja, hash modelu i katalogu, wersja solvera, status zgodności |
| A18 | Metody max/min i prądy udarowe/wyłączalne | Oddzielne niezależne testy z pełnym śladem współczynników |
| A19 | Determinizm | Dwa uruchomienia na tym samym wejściu → zgodny z kanonem fingerprint |
| A20 | Katalog i zapis/odczyt projektu | Brak utraty wydania po ponownym uruchomieniu systemu |

**Kryterium PASS**: wynik liczbowy z tolerancją uzasadnioną analitycznie, porównany z niezależnym źródłem. Test sprawdzający wyłącznie snapshot poprzedniej liczby nie wystarcza.

**Zakaz**: uznanie zielonego CI bez testów modelu fizycznego za potwierdzenie zgodności z IEC 2026.

## Wymagane testy drugiego stopnia — blokada odbioru

| ID | Test | Warunek |
|---|---|---|
| RT01 | Zwarcie daleko od generatora, R/X=0.02, 50 Hz, tb=0.1 s | Ib pozostaje prądem symetrycznym, bez wkładu DC; aktualna formuła daje +11.94% |
| RT02 | Ten sam przypadek z tb=0.02 s | Aktualna formuła daje +30.06% — test definicji Ib |
| RT03 | Dwa fazory 100 A o kątach 0 i 120 stopni | Bilans zespolony: 100 A, nie suma modułów 200 A |
| RT04 | Pierścień SN, dwa źródła, pojemności poprzeczne | KCL zespolony w każdym węźle, spójne przekładnie i znaki prądów |
| RT05 | 0.4 kV, tolerancja 10% i 6% | Weryfikacja cmax/cmin i korekt impedancji dla obu wariantów IEC 2016 |
| RT06 | Dwa modele przy 50 i 60 Hz | Zanik DC, ω, m/n policzone z jawnej częstotliwości |
| RT07 | Z0 z izolowaną częścią grafu | Brak wyników z uziemienia numerycznego 1e6 pu jako elementu fizycznego |
| RT08 | B0 w S/km versus C0 w F/km | Jawne przeliczenie z uwzględnieniem ω i konwencji składowych |
| RT09 | Raport i proof Ith | IEC 2016 rozdział 14 i załącznik A; 2026 rozdział 14 i załącznik B |
| RT10 | Referencje IEC TR 60909-4:2021 | Wyniki użyte jako odniesienie 2016, nigdy jako wyłączny dowód 2026 |

Nie dopuszczać testu sprawdzającego jedynie, czy solver odtwarza swój dawny wynik. Potrzebne niezależne obliczenia i tolerancja wynikająca z analizy błędów.
