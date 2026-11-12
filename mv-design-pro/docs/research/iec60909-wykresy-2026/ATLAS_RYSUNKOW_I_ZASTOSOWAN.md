# Atlas rysunków IEC 60909-0:2016 — zweryfikowany na załączonym skanie

**Paginacja:** 82-stronicowy PDF, numery liczone od 1. Drukowane strony angielskiego tekstu = PDF − 8. Dane normowe poniżej mają pierwszeństwo przed poprzednimi propozycjami, jeśli zawierały omyłkowo oznaczone osie.

| Rysunek | PDF / drukowana | Podstawa i osie oryginału | Reguła stosowania w MV-DESIGN-PRO |
|---|---|---|---|
| **7** | 46 / 38 | Mapa rodzaju zwarcia dającego najwyższy początkowy prąd. **X = \(Z_{(2)}/Z_{(1)}\), Y = \(Z_{(2)}/Z_{(0)}\)**; relacje rezystywne i reaktancyjne jako założenie jednakowych kątów \(Z_1,Z_2,Z_0\). | Mapa **tylko**, gdy kąty impedancji składowych są zgodne z założeniem; w pozostałych przypadkach porównanie obliczonych \(I_k''\) dla 3F/2F/1F/2F+ziemia w tabeli/słupkach, bez mapy rys. 7. |
| **12** | 58 / 50 | Współczynnik \(\kappa\) dla toru szeregowego, lewe X=\(R/X\), prawe X=\(X/R\), równanie (57). | Już dostępna charakterystyka. Bez kolejnego ekranu. Weryfikować metodę dla sieci promieniowych i oczkowych oddzielnie. |
| **13** | 62 / 54 | \(\mu\) (0,5–1) względem stosunku **\(I''_{kG}/I_{rG}\) lub \(I''_{kM}/I_{rM}\)**, serie dla **\(t_{\min}=0{,}02;0{,}05;0{,}10;\ge0{,}25\,s\)**; pkt 9.1. | Pokazywać **dla właściwych maszyn**. Wykres \(I_b\) względem czasu wolno pochodnie wyznaczać tylko przy dostępnych normowych zależnościach i poprawnym modelu. Nie stosować \(\mu\) jako uniwersalnego mnożnika PV/BESS. |
| **14** | 63 / 55 | \(q\) maszyn asynchronicznych względem **\(P_{rM}/p\) [MW na parę biegunów]**, oś logarytmiczna, serie dla \(t_{\min}\); pkt 9.1.2, wzór (69); jeśli obliczenie daje \(q>1\), przyjąć \(q=1\). | Widok zależny od obecności silnika asynchronicznego i parametrów \(P_{rM}\) oraz liczby par biegunów. **DFIG ma osobny model**, nie przeliczać automatycznie współczynnikiem \(q\) silnika. |
| **15** | 68 / 60 | \(\lambda_{\min}\), \(\lambda_{\max}\) dla **generatorów synchronicznych z wirnikiem cylindrycznym**; serie 1/2, zmienne \(I''_{kG}/I_{rG}\), \(x_{dsat}\), pkt 11. | Tylko właściwy generator synchroniczny i znane parametry. Serie 1/2 oraz zakres charakterystyk wybierać wg normy, nie arbitralnie. |
| **16** | 68 / 60 | \(\lambda_{\min}\), \(\lambda_{\max}\) dla **generatorów synchronicznych jawnobiegunowych**; analogiczne osie i serie. | Nie mieszać z rys. 15; nie stosować do pełnych przekształtników. |
| **18** | 74 / 66 | \(m\) — składowa **nieokresowa**, X = **\(fT_k\)**, rodzina krzywych \(\kappa\); pkt 12, wzory (110–112); sposób programowy w aneksie A. | Obliczać z parametrów wybranej analizy, pokazywać wkład \(m\) i jawny czas zwarcia \(T_k\); nie odczytywać parametrów z pikseli rysunku. |
| **19** | 75 / 67 | \(n\) — składowa **okresowa**, X = **\(T_k\) [s]**, rodzina krzywych opisana **\(I''_k/I_k\)**; sposób programowy w aneksie A. | \`n=1\` może być uzasadnione dla określonych zwarć odległych od generatora, lecz nie jest uniwersalnym założeniem dla wszystkich sieci z maszynami. |

## Wielkości cieplne (pkt 12, PDF s. 74–75)

Przy jednym zwarciu, w warunkach właściwych dla rozpatrywanej metody:
- \(I_{th}=I_k''\sqrt{m+n}\);
- \(J=\int i^2(t)\,dt = I_{th}^2 T_k\), jednostka np. \(\mathrm{kA^2s}\).
- Dla wielu zwarć konieczne uwzględnienie sumy odpowiednich całek i czasów, a nie dowolna suma prądów.

**Ograniczenia źródłowe na s. 75:** norma pozwala zwykle na \(n=1\) przy zwarciach odległych od generatora; dla zwarć odległych trwających \(T_k\ge0{,}5s\) dopuszcza \(m+n=1\); dla bezpieczników i wyłączników ograniczających prąd rzeczywistą całkę Joule’a należy brać z charakterystyki ograniczającej aparatu, jeśli zmienia ona wynik.

## Weryfikacja błędnej wcześniejszej propozycji

W poprzedniej odpowiedzi użytkownikowi zaproponowano oś X \(Z_0/Z_1\), Y \(Z_2/Z_1\) dla rys. 7. **To błąd.** Prawidłowo X \(Z_2/Z_1\), Y \(Z_2/Z_0\). Nie propagować poprzedniej wersji do kodu, dokumentacji ani testów.

## Prawa autorskie

Nie dołączać skanu IEC, jego reprodukcji ani digitalizacji punktów krzywych do publicznego repo. Własne algorytmy i oryginalne wizualizacje muszą bazować na legalnie dostępnym, sprawdzonym tekście i dopuszczonych metodach obliczeniowych.
