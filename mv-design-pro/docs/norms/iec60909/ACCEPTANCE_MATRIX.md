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
