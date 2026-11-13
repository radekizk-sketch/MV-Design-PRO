# Biblioteka typowych pól SN, zabezpieczeń i automatyk — zatwierdzone rozwiązania

**Status: ZWERYFIKOWANE I DOPUSZCZONE (wzorce projektowe właściciela).** P1 = tom pierwotny, P2 = tom wtórny. Identyfikatory REF-* nie odtwarzają rzeczywistej numeracji pól. To mapa cech produktu i logiki, nie instrukcja ruchowa.

## Typy pól — połączenie modelu elektrycznego, aparatury i EAZ

| ID | Typ pola | Aparatura i powiązanie | Funkcje i zależności |
|---|---|---|---|
| REF-F01 | Pole pomiaru napięcia SN | celka AIS, człon wysuwny VT, 3 jednofazowe VT i oddzielne uzwojenia, pomiar napięć sekcji | 27, 59, 59N / U0, 81U i SCO/SPZ-SCO; nie wymaga fikcyjnego CB w samym polu VT |
| REF-F02 | Pole liniowe odpływowe | wyłącznik próżniowy, uziemnik, CT, VT, przekładnik Ferrantiego, IED | 50/51, zabezpieczenie ziemnozwarciowe konduktancyjne, SPZ, LRW, blokowanie ZS; kontrola napięcia na linii |
| REF-F03 | Pole liniowe dwukierunkowe z generacją OZE/BESS | REF-F02 z kierunkowością i blokadą napięcia zwrotnego | odrębne grupy nastaw „bez generacji” i „z generacją”, 27/59, 81U/81O, df/dt, SCO zależne od kierunku prądu, OWG od TR |
| REF-F04 | Pole transformatorowe SN GPZ | CB, odpowiednie CT i VT, połączenie transformatora WN/SN | 50/51, przeciążenie, ZS/LRW, SZR i sprzęgło, wyłączenie pól generacyjnych (OWG); bez projektowania strony WN |
| REF-F05 | Pole zespołu uziemiającego z dławikami gaszącymi | transformator uziemiający, dławiki, aparatura odpowiednia do obwodów kompensacji | zabezpieczenia dławików, AWSCz, dwustopniowe gazowo-przepływowe, kontrola U0, blokowanie przełączeń dławików |
| REF-F06 | Pole wyłącznikowe istniejącej rozdzielni podlegające modernizacji | aparat i obwody pierwotne mogą pozostać z zachowaniem identyfikatorów | wymiana IED, modernizacja wtórnych, zachowanie istniejących nastaw dopóki przewidziano ich przeniesienie |

Pochodzenie: P1:12–19 i 29–35; P2:9–21,48–52. Dokumentacja referencyjna potwierdza **różne konfiguracje tego samego IED i CT/VT dla różnych ról pola**. Nie powielać jednego szablonu we wszystkich polach.

## EAZ — szablony grup nastaw (nie zawierają rzeczywistych nastaw obiektu)

| Profil | Wielkości zapisane w konfiguratorze | Typowe zależności |
|---|---|---|
| EAZ-LIN | I>, I>>, G0/Y0 lub 3I0, t, charakterystyka, przekładnia CT, kierunkowość | SPZ, LRW, ZS, blokowanie wyłączenia ziemnozwarciowego przy trybie sygnalizacji |
| EAZ-GEN | EAZ-LIN + U<, U>, f<, f>, df/dt, 3U0, t, nadzór fazowy | tryb z generacją, blokowanie załączenia od napięcia zwrotnego, OWG, zależne od kierunku SCO |
| EAZ-TR | I>, Ip>, I>>, t, CT i obciążenia, funkcje sprzęgła/sekcji | ZS, LRW, SZR, OWG i awaryjne wyłączenie pola transformatora |
| EAZ-PN | napięcia fazowe i międzyfazowe, U<, U>, U0>, częstotliwości SCO, opóźnienia | pomiar sekcji, współpraca z automatyką podczęstotliwościową i ponownym załączeniem |
| EAZ-ZU | I>>, I>, I0>, U0>, czasy AWSCz, nastawy dławików, parametry transformatora uziemiającego | uwzględniać położenie zaczepów dławików, stany odstawienia, gaz/przepływ, blokady aparatury |

Zasada: próg ma **wartość, jednostkę, stronę pierwotną/wtórną, bazę odniesienia, czas, kryterium kierunkowe, stan dostawienia, tor pomiarowy, konfigurację IED i źródło nastawy**. W bazie zachować, czy rzeczywiste rozwiązanie korzysta z nastaw przenoszonych z istniejącego pola, czy nowo określonych. Parametry bez definicji pierwotna/wtórna są błędem modelu.

## Automatykę modelować jako relacje, a nie zestaw kodów w ramce

- **ZS**: logika blokowania zabezpieczenia szyn pobudzeniem funkcji odpływowej; rozróżnić pobudzenie, czas, działanie na CB i status „odstawiona/dostawiona”.
- **LRW**: pobudzenie od wyłączenia bez potwierdzenia zaniku prądu/otwarcia CB, powiązanie z polem i strefą oraz możliwością odstawienia.
- **SPZ**: rzeczywista logika automatyki i jej blokad, nie samo słowo „SPZ” obok wyłącznika.
- **SCO / SPZ po SCO**: odrębne stopnie; tryb lokalny i zdalny; stan aktywności względem warunków sieci.
- **OWG**: zdarzenie awaryjnego wyłączenia TR inicjuje odłączenie bezpośrednio zasilanych z sekcji pól generacyjnych. Sterowanie planowe TR nie jest równoważne awaryjnemu OWG.
- **Napięcie zwrotne**: kontrola strony linii przy otwartym CB i warunkowe zezwolenie na zamknięcie. Stan logiczny i widoczna informacja o blokadzie muszą odpowiadać tej samej wersji grafu.
- **AWSCz**: logika zadziałania i stan kompensacji mają referencję do transformatora uziemiającego i dławika, a nie dowolnego odpływu.

## CT/VT — wzorce zgodne z rolą pola

- Profil CT ochronny: jedno uzwojenie/rdzeń 5P20 (prąd znamionowy wtórny 5 A) z wyodrębnionym sprawdzeniem ALF, obciążenia i nastawy przekładni.
- Profil CT pomiarowy+ochronny: odrębne rdzenie 0,2S FS5 i ochronny 5P20; nie traktować klasy zabezpieczeniowej jako pomiarowej.
- Profil VT pomiarowy: trójuzwojeniowy, klasy i moce VA inne niż w polu liniowym z generacją; kontrola sposobu połączenia, zabezpieczenia obwodu i zgodności ze standardem danego wydania.
- Profil VT EAZ: 3 jednofazowe VT i trzy uzwojenia wtórne; nie tworzyć otwartego trójkąta, jeśli konkretna konfiguracja ma wyłącznie połączenia gwiazdowe.
- Ferranti: oddzielny tor pomiaru składowej zerowej z orientacją/rdzeniem i rzeczywistym połączeniem do IED.

Wszystkie powyższe role i konfiguracje z dokumentacji P1/P2 są **dopuszczonymi referencjami**. Ewentualne różnice względem nowego projektu wyrażają się zakresem stosowalności i adaptacją, nie odrzuceniem materiału.

## Czego nie kopiować

Nie publikować pełnych tablic z rzeczywistymi progami i czasami EAZ ani dokładnych powiązań torów wyłączających, list zacisków, łączy i telemechaniki konkretnej stacji. Nie stosować wartości liczbowych ze źródła jako domyślnych nastaw nowych projektów. Opracować **syntetyczne wektory testowe**, pozwalające wykryć błędny przelicznik CT, jednostki, brak opóźnienia, sprzeczność stanu NO i niezgodność grup trybów.
