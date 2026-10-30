# MV-DESIGN-PRO — przekładniki CT, VT oraz Ferrantiego (30.10.2026)

## Podstawy

Dwie klasy wpisów, których NIE wolno mieszać:
- **Wymaganie ENEA / profil referencyjny:** definiuje zadany pomiar, przekładnię, klasę, moc i wytrzymałość; nie jest ofertą ani kompletną kartą konkretnego aparatu.
- **Rodzina producenta:** dopuszczalne kombinacje z publikacji producenta. Dopóki nie ma osobnego numeru zamówieniowego/DTR, status nadal REFERENCYJNY_V1. NIE nazywamy jej potwierdzonym wyrobem.

W bazie wyjściowej było **14 przekładników CT** (12 modeli referencyjnych plus 2 sieciowe ENEA 5/B) oraz **13 VT**.
Po aktualizacji PR #511: **103 CT** (70 wcześniej, 13 kanonicznych ENEA wieloprzekładniowych, 3 ENEA nN i 17 ABB KOKM 1), **37 VT** (6 nowych ENEA 5/E-F, 9 ABB UDZ 24-1, 3 ESITAS VTB i 6 RITZ VES) oraz **5 Ferranti 3I0** w osobnym katalogu.
Liczby dotyczą katalogu z gałęzi bazowej PR #508; PR jest na nią nałożony.

**Aktualizacja 30.10.2026:** zał. 5/A-D wymaga przekładników
**50–100/5 i 200–400/5 A jako pojedynczych typów wieloprzekładniowych**,
a nie dwóch osobnych SKU. Kanoniczne rekordy mają `primary_taps_a`;
typy jednozakresowe zachowano pod tymi samymi ID, bez oznaczenia
`LEGACY`. **Są poprawne dla istniejących urządzeń i innych funkcji**;
ich zgodność z nowym PPE ENEA ocenia się osobno.
Wybór aktywnego zaczepu i podkreślenie na SLD realizuje Opus, a nie
katalog. Szczegóły i testy: [ENEA_CT_WIELOPRZEKLADNIOWE_I_ZACZEPY_2026.md](ENEA_CT_WIELOPRZEKLADNIOWE_I_ZACZEPY_2026.md).

## ENEA Operator — przekładniki prądowe

Źródło: [Standard ENEA „Układy pomiarowe energii elektrycznej”,
wersja 05.2022-2, obowiązująca od 02.04.2024, załącznik 5/A–F, s. 25–31](https://www.operator.enea.pl/media/698/uklady-pomiarowe-energii-elektrycznej-obowiazuje-od-02042024pdf.pdf).

| Załącznik | Typ | Przekładnie | Rdzeń rozliczeniowy | Ith/1s |
|---|---|---|---|---|
| 5/A | wsporcze rozdzielcze, BKR | 100/5/5, /5/5/5 | 0,2S, FS5, 10 VA | 16 kA |
| 5/A | linia | 200–400/5/5, /5/5/5, /5/5/5/5 | 0,2S, FS5, 10 VA | 16 kA |
| 5/A | transformator | 800, 1000, 1200, 1600 /5/5/5/5 | 0,2S, FS5, 10 VA | 16 kA |
| 5/B | sieciowe pole pomiarowe | 5/5 lub 15/5 | 0,2S, FS5, 5 VA | 2 lub 8 kA |
| 5/B | sieciowe pole liniowe | 50–100/5/5 lub /5/5/5, 200–400/5/5 lub /5/5/5 | 0,2S, FS5, 5 VA | 8 kA |
| 5/B | słup linii SN | 5/5, 15/5, 50–100/5 | 0,2S, FS5, 5 VA | 2 lub 8 kA |
| 5/C | toroidalne rozdzielcze | BKR 100/5/5; linia 200–400/5 do /5/5/5; TR 800/1200/5/5/5/5 | 0,2S, FS5, 10 VA | 16 kA |
| 5/D | toroidalne sieciowe | 200–400/5/5 | 0,2S, FS5, 5 VA | 8 kA |

**Uwaga o izolacji toroidów 5/C–D:** standard podaje **24/0,72 kV**,
tj. napięcie sieci i izolację przekładnika toroidalnego. Pole `um_kv`
samego toroidu to 0,72 kV, nie 24 kV; nie wolno na tej podstawie
uznawać go za przekładnik izolujący tor SN.

**Rdzenie pozostałe:** normatywny wyciąg wskazuje, że ich pełna specyfikacja leży w odrębnych standardach pól. Nie dopisywano im fikcyjnie 5P20, ALF, Rct czy klas. W rekordzie `core_count` to liczba rdzeni z przekładni, a `secondary_cores` zawiera WYŁĄCZNIE parametry podane jednoznacznie w źródle.

### Dodatkowe zasady IRiESD

Dla nowych/modernizowanych rozliczeniowych CT **FS ≤ 5**. Przewidziane w IRiESD odstępstwo dotyczy **pozostawienia istniejących FS>5 w modernizowanych układach**, jeżeli spełnione są pozostałe wymagania; nie jest ogólną zgodą na dobór nowego FS10.

Kryteria prądowe względem mocy umownej: klasa 0,5 — 20–120% In; klasa 0,2/0,5S — 5–120%; klasa 0,2S — 1–120%. Obciążenie wtórne CT/VT w układzie rozliczeniowym powinno mieścić się w 25–100% znamionowego, z wyjątkiem wyraźnie dopuszczonego VT 0–10 VA. Warunki przyłączenia i kategoria układu są nadrzędne. Źródło: [IRiESD ENEA v2.3, pkt II.4.7.1.13–15](https://operator.enea.pl/uploads-ev2/Operator/teczka-prasowa/Komunikaty/2024/15.11.2024/5_RiESD_tj.%20od%201.07.2025_zmiany_pkt2i3_KA38.pdf). Karta 45/2026 (od 5/19.10.2026) dotyczy przede wszystkim sprzedaży rezerwowej, nie deklaruje zmiany tych wymagań.

## ENEA VT: trzy wtórne to nie otwarty trójkąt

Załącznik 5/E (pola rozdzielcze) i 5/F (pola pomiarowe odbiorcy) podają profile 6/15/20 kV, trzy wtórne o przekładni **0,1/√3 kV**. Taki zapis nie uprawnia do dodania `0,1/3 kV` ani uznania klasy 3P za uzwojenie resztkowe. Dlatego pole `has_residual_winding` dla PROFILU WYMAGAŃ pozostaje nieokreślone, dopóki konfiguracja aparatu nie zostanie wybrana, a trzy uzwojenia opisano osobno.

Nie zmienia to niezależnego rysunku ENEA Z.11.1: tam należy odczytać rzeczywisty schemat każdego uzwojenia i ich połączenia, a nie wnioskować po nazwie klasy 3P.

## ABB UDZ 24-1 — rodzina producenta

Źródło: [ABB UDZ 24-1](https://new.abb.com/medium-voltage/pl/aparatura/przekladniki-i-sensory/produkty/przekladniki-wnetrzowe-napieciowe-iec/przekladnik-napieciowy-jednobiegunowy-wnetrzowy-typu-udz-24-1) oraz karta 1VLC000774.

9 konfiguracji doborowych (3 napięcia 6/15/20 kV × 3 warianty uzwojeń):
- **Pomiarowe:** 100/√3 V, 40 VA, kl. 0,2, bez resztkowego.
- **Pomiarowe i resztkowe:** 100/√3 V, 20 VA, kl. 0,2 + 100/3 V, 30 VA, kl. 3P. Łączne obciążenie 50 VA, nie przekracza limitu ABB dla klasy 0,2.
- **Pomiarowe i resztkowe:** 100/√3 V, 50 VA, kl. 0,5 + 100/3 V, 30 VA, kl. 3P, obciążenie łączne 80 VA (poniżej pułapu 125 VA dla kl. 0,5).

U_m = 24 kV, izolacja 24/50/125 kV, Fv=1,9 przez 8 h. Otwartym trójkątem jest **połączenie uzwojeń resztkowych trzech przekładników jednofazowych**, nie wartość klasy 3P.

**Ważne:** kombinacje są dozwolone przez zakres kart rodzinnych, lecz nie oznaczają istnienia zamawialnego SKU bez potwierdzenia producenta. Stąd `REFERENCYJNY_V1`, nie `ZWERYFIKOWANY`.

## ABB TPU — wykonania producenta, a nie profile ENEA

Na podstawie [ABB „Przekładniki prądowe TPU 4x.xx, 5x.xx i 6x.xx”,
wydanie 05.2014, str. 35, tabela standardowych wykonań TPU 6x.xx](https://library.e.abb.com/public/a30bcdbdd6e74381b444c9356675fb28/TPU-katalog-09052014_LR.pdf)
dodano **17 jednoznacznych konfiguracji** 24 kV: przekładnie 20–3200/5/5 A,
dwa rdzenie **0,5 FS5 (pomiarowy) + 5P10/5P15 (zabezpieczeniowy)**,
znamionowe moce 15–30 VA i odpowiadające jednemu wierszowi
wytrzymałości Ith/Idyn. Są to udokumentowane standardowe wykonania
z katalogu 2014 — **nie gwarancja dostępności w roku 2026**.

**W szczególności nie wolno podmieniać 0,5 FS5 na 0,2S FS5:**
takie wykonanie nie jest automatycznie właściwym doborem do nowego
rozliczeniowego układu ENEA. Karty producenta i wymagania operatora
są dwoma niezależnymi kryteriami.

Dodatkowo wprowadzono **1 przykład rzeczywistej tabliczki ABB TPU 70.63**
z oficjalnej instrukcji 1VLM000610 rev. 27: 100//1/1/1/5 A,
4 osobne rdzenie (5P20, 0,2S FS5, 5P40, 0,2S FS5),
Um=36 kV, Ith=16 kA/1 s i Idyn=40 kA.
Rezystancje wtórne Rct≤1 Ω oraz Rct≤2 Ω dotyczą dwóch KONKRETNYCH
rdzeni zabezpieczeniowych, nie całego CT. To egzemplarz z ilustracji
instrukcji, nie potwierdzony obecny numer zamówieniowy.
[Źródło ABB](https://library.e.abb.com/public/be6ececc53e049c7a172e37fc04a8453/Instruction_Current%20and%20Voltage%20Instrument%20Transformers_1VLM000610%20Rev.27%20en.pdf).

## Ferranti 3I0 — osobna rodzina

Nie przenosimy czujników ziemnozwarciowych do zwykłej listy CT fazowych (1 A/5 A). Ich przekładnia `1/120` lub `1/470` jest zwojowa/czujnikowa, nie tabliczkowym CT fazowym `120/1` lub `470/1`.

- Schneider CSH120/CSH200/CSH300, okna 120/196/291 mm, współpraca z Sepam. Źródło: [instrukcja Sepam](https://download.schneider-electric.com/files?p_Doc_Ref=PCRED301005EN) i [zasady montażu](https://www.se.com/ie/en/faqs/FA86757/).
- ABB IO1s/IFW, typowe 1/120 lub 1/100, uzwojenie testowe 5/10 zwojów, cieplne **10 kA / 5 s**, konstrukcja IFW z rdzeniem dzielonym. Źródło: [katalog ABB](https://library.e.abb.com/public/9ec0e942183d4a40b26153d12e58476e/ABB-przekladniki%20nn_PL_noweA%28217B%29_05.03.pdf).
- Wymóg ENEA stacji 110/SN: Ferranti w przedziale kablowym, osiowość przepustu, kabel/kable i dodatkowe złącze testowe wyprowadzone na listwę obwodów wtórnych.

Nie wszystkie czujniki CSH mają potwierdzone dodatkowe złącze wymagane przez ENEA; przy doborze do GPZ potrzebna osobna ocena tej cechy. Dane nieznane NIE są wypełniane zmyślonymi liczbami.

Przeglądarka typów w frontendzie prezentuje rdzenie CT i uzwojenia VT
jako oddzielne pozycje z mocą, klasą, FS/ALF i połączeniem.
Ferranti ma własną kategorię oraz znajduje się w zbiorczej
bibliotece przekładników — **nie** jest modelowany jako CT fazowy.

## Nowi producenci z rynku polskiego

Osobny katalog `/api/catalog/instrument-transformer-families` obejmuje **49
rodzin 15 producentów**, m.in. KPB Intra, RITZ, Arteche, ALCE Elektrik,
ESITAS, PLESSE, ZWARPOL, PFIFFNER, MBS, Łukasiewicz-ITR,
SPIE Energotest i ZELISKO, a teraz także **TESAR Polska, KONČAR
i POLCONTACT WARSZAWA**. Osiem kolejnych rodzin udokumentowano
bez tworzenia sztucznych kombinacji zakresów. Są to rodziny doborowe, bez wymyślonych
tabliczek CT/VT. Dodatkowe trzy zidentyfikowane typy VT ESITAS
VTB10/20-K z polskiej oferty zostały włączone do listy VT.

Szczegóły, źródła i zasady w:
`docs/catalog/PRODUCENCI_PRZEKLADNIKOW_POLSKA_2026.md`.

## Technika wdrożenia i Ubuntu

- `get_default_mv_catalog().list_ct_types()`: 103 modele CT fazowe/profile wymagań, w tym 13 wieloprzekładniowych z `primary_taps_a`.
- `get_default_mv_catalog().list_vt_types()`: 37 VT.
- `GET /api/catalog/ferranti-types`: 5 osobnych sensorów 3I0; 57 rodzin 15 producentów w katalogu doborowym.
- Nowe opcjonalne pola `secondary_cores`, `core_count`, `um_kv`, `primary_taps_a`, `secondary_windings`, `primary_connection` są przekazywane `from_dict → to_dict → REST` bez naruszania starych rekordów.
- Dotychczasowe ID CT/VT nie są zmieniane, tylko dodano nowe.
- Odbiór: `bash scripts/catalog_audit_ubuntu.sh` (wymaga Python 3.11 i zależności repo).

**Nie oznaczać 103 CT jako 103 pełnych produktów producenta.** Większość nowych profili to formalne wymagania standardu ENEA. Prawdziwy wybór produkcyjny potrzebuje DTR/numeru zamówieniowego potwierdzającego wszystkie rdzenie, uzwojenia, Ith, Idyn, ALF/FS i rzeczywiste obciążenie.
