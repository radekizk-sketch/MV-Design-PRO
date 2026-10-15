# Odbiór scenariusza „stacja SN/nN 630 kVA” — mapa luk (2026-10-15)

Status: WIĄŻĄCY dla kart wdrożenia dyrektywy nadrzędnej właściciela 2026-10-15
(`docs/domain/KONTRAKT_PROWADZENIA_PROJEKTANTA.md` §6, konflikt `V12K-351`).
Źródła: przejście scenariusza na żywej aplikacji (prawdziwy backend, natywne kliki, ok. 80
zrzutów w scratchpadzie sesji) i mapa zdolności z kodu (plik:linia), HEAD `2690bca8c`.

## 1. Wynik przejścia

| Krok | W UI | Główna przyczyna |
|---|---|---|
| 1 Dobór z katalogów | częściowo | szablon stacji dokłada CT/VT/przekaźnik do pola z bezpiecznikiem; rodzina rozdzielnicy miesza producentów; „dobór automatyczny” nie wybiera jedynego szablonu pola; nazwa stacji przepada; reklozer domyślnie w GPZ |
| 2 Schemat | częściowo | każde pole rysowane jako wyłącznik; brak bezpiecznika; etykiety pól przesunięte; Q9 za transformatorem; strona nN = symbol „nN” bez aparatów i odpływów; portal nN 404 (ref z „/”); menu SN na szynie nN |
| 3 Kable | SN tak, nN nie | brak dróg UI do odpływów/kabli nN; kable nN klasyfikowane jako SN (inspektor, drzewo, katalog) |
| 4 Rozpływ | tak | brak U w kV/V, I w A, ΔU odpływu; kolejność szyn przypadkowa |
| 5 Zwarcia | częściowo | 1F zablokowane — kable nN bez R0/X0 i Ith w katalogu |
| 6 Obciążalność, ΔU | częściowo | obciążenie względem In katalogowego, nie Iz′; **I²t kabli nN = 0 „SPEŁNIA”**; sprzeczne progi napięcia (0,95 p.u. vs 10 %) |
| 7 Ochrona przeciwporażeniowa | nie | TT/IT `NotImplementedError`; brak RCD w katalogu/ENM; brak pola RA |
| 8 Zabezpieczenia | nie | przekaźniki z kreatora nie trafiają do modelu; Hoppel nie widzi transformatora za kablem; brak biegu c_min w UI; brak selektywności nN i doboru zabezpieczenia transformatora |
| 9 Zmiana przekroju nN | nie w UI | katalog SN zamiast nN przy zmianie typu |
| 10 Skutek zmiany | częściowo | A/B działa dla SN; stare Ik″ na SLD przy wynikach nieaktualnych; Δ kąta w %; Q odbiorów = 0 w A/B |

## 2. Karty wdrożenia

| Karta | Zakres |
|---|---|
| PROWADZENIE-KREATORY (rozszerzona) | pkt 1 kreatora stacji, przekaźniki z kreatora do modelu, surowe ID w UI, I_B magistrali z backendu |
| PROWADZENIE-AUTO-BACKEND (rozszerzona) | wyposażenie pola z rodzaju aparatu, zero dopisanych odbiorów, trwałe usuwanie, nazwy, rodzaj stacji z topologii |
| PROWADZENIE-OBLICZENIA (rozszerzona) | szum ewidencyjny pierwszego planu (run_id, rewizje, wiarygodność, kody E-/W-/B-), tabela zwarć bez przewijania |
| OBIEKT-KABEL-NN | kabel nN jako obiekt: obliczenia w inspektorze, warunki ułożenia, dobór przekroju z wariantami, dowód z elementu, tożsamość nN |
| OCHRONA-PRZECIWPORAZENIOWA-TT-RCD | SWZ TN/TT/IT wg PN-HD 60364-4-41, RCD w katalogu i modelu, RA, UT, warianty; Z0 i Ith kabli nN |
| ZABEZPIECZENIA-NN-I-TRANSFORMATORA | selektywność nN i SN/nN, dobór HH i I>/I>> transformatora (prąd załączenia z charakterystyki producenta, §3), TCC, c_min z UI, Hoppel do transformatora, karta pola |
| V126-INRUSH-SEPARACJA | odcięcie wyników 63/k i blokady 87T rdzenia V12.6 od prezentacji, raportu i doboru; strażnik nawrotu |
| OBCIAZALNOSC-IZ-PRIM | jedno źródło Iz′ dla rozpływu, nakładki, doboru, magistrali |
| STRONA-NN-PROJEKTOWANIE | strona nN na schemacie SLD V3 i w projekcji nN, menu nN, trasy z refem „/”, liczniki z modelu |
| SLD-POLA-SYMBOLIKA | symbol pola z aparatu (PN-EN 60617), etykiety, Q9, LOD, trasa kabla, nagłówek 1440 px |
| WYNIKI-SPOJNOSC | I²t „poza drogą zwarcia”, jedno źródło progów napięcia (W3-J), U/I/ΔU w jednostkach projektowych, nakładka przy wynikach nieaktualnych, wybór biegu, A/B |

## 3. Decyzja właściciela 2026-10-15 (B-01) — prąd załączenia transformatora

Rdzeń V12.6 (`network_model/solvers/v126_academic.py`) pozostaje bez zmian; zastąpienie 8,0
inną sztywną krotnością odrzucone. Zależność `second_harmonic_percent = 63/k` i wynik
`blocking_87t_recommended` nie są metodą wyznaczania udziału drugiej harmonicznej — nie wolno
ich używać do konfiguracji EAZ ani doboru 87T; karta V126-INRUSH-SEPARACJA odcina je od
prezentacji, raportu i doboru (strażnik nawrotu). Dobór zabezpieczenia transformatora: prąd
załączenia z charakterystyki producenta konkretnego transformatora; bez niej — analiza
wariantowa z jawnie przyjętą krotnością i czasem trwania, która nie jest podstawą końcowego
zatwierdzenia nastaw. Zakres doboru: In, prąd załączenia i jego przebieg czasowy,
charakterystyka zabezpieczenia, prądy zwarciowe, czułość, selektywność, wytrzymałość cieplna —
na charakterystykach czasowo-prądowych. Zadanie nie blokuje odbioru scenariusza.

## 4. Kryterium odbioru

Ponowne przejście wszystkich 10 kroków natywnymi klikami na żywej aplikacji, bez obejść przez
API, ze zrzutami w obu motywach; werdykt wizualny — właściciel (B-02).
