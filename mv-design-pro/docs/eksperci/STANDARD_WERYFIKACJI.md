# Standard weryfikacji Rady Technicznej

## Rozróżnienie dowodów

**Kwalifikacja:** rejestr i skrypt wskazują właściwe kompetencje. Nie dowodzi to ani realizacji analizy, ani poprawności wyniku.

**Ocena techniczna:** kompetencje muszą zostać zastosowane do rzeczywistych danych modelu. Wymagane są granice analizy, dane wejściowe, metoda, obliczenia, jednostki i rozumowanie falsyfikujące.

**Weryfikacja normowa:** wymaga źródła, właściwego wydania, zakresu stosowania, konkretnego kryterium oraz przyporządkowania wartości i marginesu. Brak dostępnego tekstu normy należy jawnie zgłosić.

**Odbiór inżynierski:** test realistycznego przypadku — od konfiguracji obiektu przez solwer i interpretację do wyświetlenia i eksportu wyniku.

**Formalna zgodność:** test automatyczny, analiza AI lub symulacja nie zastępują dokumentu producenta, certyfikatu, pomiaru ani zatwierdzenia właściwego operatora.

## Minimalny rekord oceny

- Przedmiot, granice modelu, wariant i punkt sieci.
- Ekspert prowadzący i członkowie z ID rejestru; kto faktycznie wykonał ocenę.
- Parametry wejściowe, źródła, wydania dokumentów i braki.
- Właściwe równania i jawne wyniki pośrednie.
- Wynik liczbowy, jednostka, kryterium, margines i niepewność, jeśli stosowna.
- Status zgodny z `docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md` i wyjaśnienie.
- Sprawdzenie niezależne, kontrprzykłady, wyłączenia i ograniczenia.
- Dowód end-to-end w aplikacji, gdy zadanie obejmuje funkcję produktu.

## Krytyczne kontrole przykładowe

**Kabel SN:** długość, obciążalność skorygowana, ΔU, kabel i żyła powrotna, I²t, sposób ułożenia, współpraca EAZ.

**Stacja SN/nN:** szyny, pola, wyjścia przez zaciski, `Ur >= Um`, prądy znamionowe i zwarciowe, CT/VT, blokady, transformator.

**EAZ:** Z0 i układ neutralny, czułość i selektywność, czas, nasycenie CT, obwody wtórne, bank nastaw.

**NC RfG/WOS:** kategoria źródła, wymagania z właściwego okresu, model zwalidowany, próby, symulacje, certyfikaty — każda forma dowodu osobno.

**Jakość energii:** metoda, wartości dopuszczalne, harmonia/THD, asymetria, wahania, lokalizacja PCC, warunki pomiaru.

**W5/interfejs:** rzeczywista droga działania projektanta; poprawność doboru, dane, dostępne wyniki, edycja, diagnostyka, źródła, dowody, dopiero potem typografia i układ.

Nie wolno samodzielnie ogłosić akceptacji wizualnej B-02 ani wprowadzić zmian w rdzeniach B-01 bez zgody właściciela.
