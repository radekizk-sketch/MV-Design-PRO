# GPZ 110/SN — AIS: potwierdzony tekst §13 i karta wdrożenia dla Opusa

**Weryfikacja: 13.11.2026.** Opracowanie własne na podstawie oficjalnej dokumentacji; nie jest kopią PDF i nie zastępuje oryginału przy formalnym audycie.

## Źródło
ENEA Operator, „Stacje elektroenergetyczne 110 kV. Zeszyt 1. Stacje dwutransformatorowe 110 kV/SN”, wersja **02.2023–2**, obowiązuje od **02.04.2024**. Podstawa: **§13, s. 23–26**, **Załącznik 2** (schemat zasadniczy rozdzielnicy SN), **Z.7** (funkcjonalny schemat pola transformatora, strona SN).

Bezpośredni adres PDF, jeśli ponownie będzie dostępny:
https://www.operator.enea.pl/media/675/stacje-elektroenergetyczne-110-kv-zeszyt-1-stacje-dwutransformatorowe-110-kvsn-obowiazuje

**Ten plik ma pozwolić Opusowi kontynuować pracę bez dostępu do strony ENEA.** Wątpliwości wykraczające poza te ustalenia oznaczać jako wymagające weryfikacji, a nie dopowiadać z pamięci.

## Potwierdzona decyzja w §13

1. Rozdzielnica SN GPZ 110/SN jest jednosystemowa i dwusekcyjna. Standard opisuje warianty technologii izolacji, w tym **izolację powietrzną**.
2. W **uzasadnionych przypadkach**, np. przy rozbudowie istniejącej rozdzielnicy powietrznej, dopuszcza się AIS.
3. Dla rozdzielnicy z izolacją powietrzną standard wymienia **dwie alternatywy**: **wyłącznik stały z odłącznikiem szynowym** lub **wyłącznik poziomo wysuwny z wózkiem** (§13, s. 23–24).
4. Po wysunięciu członu wysuwnego należy wyeliminować dostęp do części obwodów pod napięciem. Wymagana konstrukcja pola: zamknięta, łukoodporna, łukochronna i przedziałowa.
5. Schemat zasadniczy **całej rozdzielnicy** jest wskazany w **Załączniku 2**. W AIS dopuszcza się odmienną wzajemną kolejność przekładników prądowych i napięciowych niż w schematach referencyjnych; ich obciążenia należy dobrać obliczeniowo.
6. Dla sieci SN o napięciu nominalnym do 20 kV rozdzielnica ma mieć napięcie znamionowe **24 kV**.
7. Fizyczna szerokość celki zasadniczo **60–80 cm**, a dla pól TR i łącznika szyn dopuszczalnie do **100 cm**. Nie są to wymiary renderowania w pikselach.
8. Przedziały celki: kablowy, łączników, szyn, obwodów pomocniczych. Blokady mechaniczne i elektryczne muszą wykluczać niedozwolone czynności łączeniowe (wyłącznik, odłącznik, wózek, uziemnik).
9. §13 opisuje również blokady łączników trójpołożeniowych, **jeśli występują**. Nie stanowi to jednak podstawy do zastąpienia dwóch wymienionych konstrukcji AIS jedynym szablonem „łącznik trójpołożeniowy”. Nie interpretować tego ani jako ogólnego zakazu łączników trójpołożeniowych, ani jako dopuszczenia dowolnego takiego układu AIS.
10. Sekcje oznaczać **A/B**, a pola numerować zgodnie z rzeczywistym układem jedno- lub dwurzędowym.
11. Wymagane są pola pomiaru napięcia dla obu sekcji oraz rozwiązania umożliwiające uziemianie pól i szyn stałymi uziemnikami.
12. Przekładniki napięciowe w polach liniowych, transformatorowych i pomiarowych powinny umożliwiać przyłączenie, odłączenie i uziemienie bez demontażu. §13 wskazuje, że przekładników napięciowych nie należy wyposażać we wkładki bezpiecznikowe.

## Wniosek normowy i produktowy

**Nie odrzucać całego GPZ tylko dlatego, że brak szablonu pola transformatorowego AIS.**

W modelu GPZ należy zachować stację, sekcje, pola, identyfikatory, CT/VT i EAZ; zablokować jedynie zatwierdzenie konkretnego pola/konfiguracji do analiz, dopóki użytkownik nie wybierze i nie skonfiguruje odpowiedniego układu aparatury. Nie udawać, że niekompletny tor zapewnia fizyczne zasilanie.

**AIS-01 — wyłącznik stały + odłącznik szynowy.**
Wspólny istniejący model urządzeń; osobne tożsamości wyłącznika, odłącznika i uziemnika, rzeczywiste stany i blokady. Nie tworzyć przewodu omijającego aparat.

**AIS-02 — wyłącznik poziomo wysuwny z wózkiem.**
Człon wysuwny i jego stany to nie to samo, co odłącznik trójpołożeniowy. Stany, blokady i geometria wynikają z prawdziwego typu rozdzielnicy, danych katalogowych oraz §13. Nie wymyślać producenta, stanów pośrednich ani napędów.

Dla obydwu wariantów zachować funkcje i właściwe wyposażenie pola transformatorowego na podstawie Z.7 oraz faktycznej konfiguracji aparatury. **Z.7 jest wzorcem funkcjonalnym, a nie potwierdzonym odrębnym rysunkiem pola AIS.** Źródło §13 wskazuje **Załącznik 2** jako schemat zasadniczy rozdzielnicy. Dokładną kolejność urządzeń w danej rozdzielnicy AIS zweryfikować również w jej rzeczywistym katalogu.

## Wymagany komunikat kreatora

„Rozdzielnica SN: izolacja powietrzna. Nie wybrano wykonania pola transformatorowego. Wybierz wyłącznik stały z odłącznikiem szynowym albo wyłącznik poziomo wysuwny z wózkiem. Podstawa: ENEA Operator, Zeszyt 1, §13, s. 23–24.”

Oddzielny komunikat dla braku uzasadnienia: „Dla rozdzielnicy SN z izolacją powietrzną określ uzasadnienie zastosowania. Podstawa: ENEA, Zeszyt 1, §13.”

Brak danych katalogowych i blokad: **odmowa zatwierdzenia konfiguracji pola** z podaniem wymaganych danych, nie usunięcie GPZ.

## Testy odbioru AIS-01…AIS-10

| Test | Wymagane zachowanie |
|---|---|
| AIS-01 | Poprawny wariant stały nie jest odrzucany z uwagi na izolację AIS. |
| AIS-02 | Poprawny wariant wysuwny może być wybrany, z odrębną tożsamością członu i aparatu. |
| AIS-03 | Brak wariantu pola pozostawia GPZ i jego pola w modelu; blokuje zatwierdzenie konkretnej konfiguracji. |
| AIS-04 | Model i UI odrzucają niedozwolone otwarcie odłącznika pod obciążeniem bez właściwej sekwencji. |
| AIS-05 | Model odrzuca niebezpieczne uziemienie aktywnego toru. |
| AIS-06 | W grafie i na SLD nie ma obejścia wyłącznika/odłącznika fikcyjnym przewodem. |
| AIS-07 | Zmiana rodzaju izolacji nie usuwa CT/VT, EAZ, grup nastaw ani ID pól. |
| AIS-08 | Zapis/odczyt, inspektor, kreator, SLD i eksport zachowują typ oraz stan aparatury. |
| AIS-09 | Kreator przechowuje uzasadnienie AIS; bez niego nie deklaruje pełnej zgodności z wzorcem ENEA. |
| AIS-10 | Kontrakt danych odróżnia sprawdzone wymagania §13 od szczegółów wymagających rzeczywistego katalogu aparatu i rysunku. |

## Granice i odpowiedzialność

- Kontynuować **istniejącą kartę GPZ**, bez przebudowy od podstaw, bez alternatywnego silnika i bez projektowania rozdzielnicy WN.
- Kontrakt SLD wykorzystuje istniejący computeLayout oraz kanoniczne symbole; nie tworzyć drugiego renderera.
- §13 **nie potwierdza** konkretnego rysunku pt. „pole transformatorowe AIS”, producenta konkretnego wózka ani pełnej kolejności aparatów każdego wariantu. Nie wymyślać ich.
- Uzgodnić z wykonawcą pól SN i integracją CT/VT; zaktualizować odpowiedni wiersz jedynego PLANS.md dopiero przy właściwym wdrożeniu.
- B-02 bez zmian — odbiór należy do właściciela.

**Podstawy do ponownej kontroli w oryginale:** §13 s. 23–26; Załącznik 2; Z.7.
