# Indeks punktów normy do kontroli — IEC 60909-0:2016

**Jak czytać:** numer *drukowany* jest podany w stopce angielskiego tekstu normy, numer *PDF* to numer strony w dostarczonym 82-stronicowym pliku. Dla sprawdzonych stron przesunięcie wynosi **+8**. Indeks częściowo oparty na spisie treści skanu; opis merytoryczny punktów 6.9 i 7.2.1 zweryfikowano bezpośrednio na stronach.

| Punkt | Strona drukowana | Strona PDF | Przedmiot weryfikacji |
|---|---:|---:|---|
| 5.1–5.3 | 16–20 | 24–28 | zasady i założenia metody oraz źródło napięcia zastępczego |
| 6.1–6.4 | 23–28 | 31–36 | impedancje sieci, transformatorów i linii |
| 6.8 | 33 | 41 | elektrownie wiatrowe z generatorem asynchronicznym/DFIG |
| **6.9** | **35** | **43** | **jednostki z przekształtnikiem pełnej mocy; bezpośrednio sprawdzone** |
| 7.1.2 | 41 | 49 | zwarcie maksymalne i minimalne |
| 7.1.3 | 42 | 50 | udział silników asynchronicznych |
| **7.2.1** | **43** | **51** | **wzory (33), (34); bezpośrednio sprawdzone** |
| 7.2.2–7.2.3 | 44–46 | 52–54 | transformatory i jednostki elektrowniane |
| 7.3–7.5 | 47–49 | 55–57 | zwarcia dwufazowe i jednofazowe |
| 8.1–8.4 | 49–52 | 57–60 | prąd udarowy |
| 9.1–9.2 | 53–57 | 61–65 | prąd wyłączalny |
| 11.1–11.3 | 58–62 | 66–70 | prąd zwarciowy ustalony |
| Aneks A | 68 | 76 | współczynniki i metody pomocnicze |
| Aneks B | 69 | 77 | macierze impedancyjne i admitancyjne |

## Precyzyjne wskazania

### Pkt 6.9, PDF s. 43

- Wkład jednostki z pełnym przekształtnikiem do sieci składowej zgodnej jest modelowany źródłem prądowym.
- Wartość źródła dla odpowiedniego rodzaju zwarcia pochodzi z danych wytwórcy.
- Dla zwarć niesymetrycznych dane składowej przeciwnej zależą od konstrukcji i sterowania.
- Uwaga o nieskończonej impedancji składowej zerowej dotyczy **jednostki PF opisanej w punkcie**, nie wszystkich źródeł sieciowych.

### Pkt 7.2.1, PDF s. 51

- Wzór (33): podstawowa zależność dla początkowego prądu zwarciowego, zastępczego źródła napięciowego i impedancji w miejscu zwarcia.
- Wzór (34): wyznaczanie maksymalnego początkowego prądu zwarcia trójfazowego z udziałem jednostek z pełnym przekształtnikiem.
- `Z_ij` to moduły właściwych elementów macierzy impedancyjnej układu składowej zgodnej; `Z_ii` odpowiada węzłowi zwarcia. `I_skPFj` dotyczy wkładu określonego we właściwym punkcie przyłączenia jednostki i dla właściwych warunków.
- **Nie** zastępować transferu impedancyjnego sumą arytmetyczną mocy zwarciowych. **Nie** utożsamiać tej sumy z prądem w każdym odcinku sieci.

### Zasada świadomego zakresu

Zapis o `Z0 = ∞` właściwy dla jednostki z pełnym przekształtnikiem **nie** jest domyślną wartością dla równoważnika sieci 110/SN, gdy brakuje jego parametrów składowej zerowej. W tym drugim przypadku trzeba rozpoznać grupę połączeń TR i rzeczywistą topologię oraz zgłosić brak wymaganej danej.

**Wydanie 2026:** bez pełnej treści nowej edycji nie deklarować równoważności punktów lub wzorów z wydaniem 2016.
