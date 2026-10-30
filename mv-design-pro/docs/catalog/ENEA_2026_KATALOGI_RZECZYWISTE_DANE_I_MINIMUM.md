# Katalogi MV-DESIGN-PRO — ENEA 2026, źródła i kompletność danych

Stan roboczy: 30.10.2026. Ten dokument jest instrukcją konsumpcji **istniejącego**
backendowego `CatalogRepository`, nie nową bazą danych ani obietnicą pełnej
weryfikacji wszystkich kart producentów.

## Najważniejsza korekta ENEA

Standard ENEA Operator „Elektroenergetyczne linie kablowe średniego napięcia”,
wersja **03.2026**, obowiązuje od **01.07.2026**, uchwała **202/2026**,
pkt **4.2.2, tablica 3**:

- U0/U = 12/20 kV;
- dopuszczone rodziny: XUHAKXS1, XnUHAKXS1, XRUHAKXS1 i XnRUHAKXS1;
- przekroje żyły roboczej **70/150/240 mm²**, żyły powrotnej **25 mm²**.

Źródło pierwotne:
https://www.operator.enea.pl/media/4774/uslugi-dystrybucyjne/elektroenergetyczne-linie-kablowe-sn-obowiazuje-od-01072026pdf.pdf

**ENEA określa typoszereg dopuszczony do stosowania, nie podaje kompletnych
danych elektrycznych każdego konkretnego produktu.** Dane wyrobu muszą pochodzić
z jego karty producenta.

### Warianty z dokumentacji NKT

NKT, `XRUHAKXS1 12/20 kV`, `CTL00109 rev. 4`, str. 1–3:
https://sklep.enexon.pl/amfile/file/download/file/708137/product/8814/

| NKT 1×…/25 | R20 Ω/km | C μF/km | L w trójkąt mH/km | Iz w ziemi trójkąt A | Ith fazy 1s kA | Ith powrotnej 1s kA |
|---|---:|---:|---:|---:|---:|---:|
| 70 | 0,443 | 0,19 | 0,42 | 260 | 6,6 | 5,0 |
| 150 | 0,206 | 0,25 | 0,37 | 398 | 14,2 | 5,0 |
| 240 | 0,125 | 0,29 | 0,35 | 523 | 22,7 | 5,0 |

Iz **nie jest stałą obciążalnością w każdych warunkach**. Dotyczy NKT:
temperatura gruntu 20°C, rezystywność cieplna gruntu 1,0 K·m/W,
głębokość 0,7 m, współczynnik obciążenia 0,7, kable w trójkąt.
X jest obliczone dla f=50 Hz z udokumentowanego L.
R0/X0 w obecnym silniku wynika z jawnych założeń, nie z pomiarów NKT.

Wprowadzono sześć nowych modeli — trzy warianty XRUHAKXS1 i trzy XUHAKXS1:
`cable-enea-2026-nkt-{xruhakxs1|xuhakxs1}-{70|150|240}-25`.

NKT, `XUHAKXS1 12/20 kV`, `CTL00352 rev. 1`, str. 1–2:
https://sklep.enexon.pl/amfile/file/download/file/845270/product/236262/
Parametry R20/C/L/Ith/Iz dla tych trzech przekrojów są identyczne z powyższymi
według **odrębnej karty** CTL00352. Różnica w wykonaniu/uszczelnieniu
powoduje, że są to **osobne typy**, z własnym źródłem.
**Bez zmiany identyfikatorów** historycznych: cztery modele
`cable-enea-operator-*` są zachowane dla projektów, ale oznaczone
jako **referencyjne poza tabelą 3 ENEA 2026**. Nie wolno ich przedstawiać jako
aktualnie dopuszczone w standardzie ENEA.


### Przekładniki prądowe CT — standard ENEA

ENEA „Układy pomiarowe energii elektrycznej”, wersja 05.2022-2,
obowiązuje od 02.04.2024, **załącznik 5/B**, s. 27/36:
https://www.operator.enea.pl/media/698/uklady-pomiarowe-energii-elektrycznej-obowiazuje-od-02042024pdf.pdf

| Profil rdzenia pomiarowego SN | Klasa | S_n [VA] | FS | I_th [kA/1 s] | Um [kV] |
|---|---|---:|---:|---:|---:|
| 5/5 A | 0,2S | 5 | 5 | 2 | 24 |
| 15/5 A | 0,2S | 5 | 5 | 8 | 24 |

Dwa rekordy `ct_enea_2024_{5|15}_5_02s_fs5` to profile **wymagań ENEA**,
nie kompletne modele wyrobu ABB/Arteche. Parametr `idyn` wyprowadzono
z relacji 2,5·Ith i jawnie opisano. Rezystancja Rct, typ obudowy i
pozostałe rdzenie wymagają DTR. Nie przypisano fikcyjnego producenta.
W szczególności **FS5** dotyczy rdzenia pomiarowego; nie należy go
automatycznie stosować do rdzenia zabezpieczeniowego 5P.

## Zasięg standardu ENEA — ważna korekta projektowa

**Standard katalogowy ENEA obowiązuje podczas projektowania własnej sieci i urządzeń
OSD, w zakresie wynikającym z konkretnego dokumentu. Nie oznacza to, że instalacja
odbiorcy od punktu przyłączenia do jego stacji SN/nN jest ograniczona do trzech
przekrojów wskazanych w tab. 3.** Po stronie odbiorcy należy dopuścić wszystkie
wyroby odpowiednie do napięcia, sposobu ułożenia i obliczeń, z uwzględnieniem
warunków przyłączenia, ochrony i norm. Jeżeli granica własności i eksploatacji
nie pokrywa się z punktem przyłączenia — zastosowanie wymaga oceny konkretnego
odcinka; nie można klasyfikować go wyłącznie po nazwie „przyłącze”.

### Rozszerzenie wyboru SN — NKT i Tele-Fonika

Wszystkie poniższe pozycje są w **jednym** istniejącym
`get_default_mv_catalog().list_cable_types()`, bez osobnego frontendowego
katalogu; istniejące typy zachowują ID:

- **NKT XRUHAKXS1 12/20 kV**: pełna tabela **16 wariantów przekroju żyły
  roboczej / żyły powrotnej**, w tym 50/16, 120/25, 120/50,
  150/50, 240/50, 300/25/50, 400/25/50, 500/25, 630/25/35/50.
  Trzy z nich (70/25, 150/25, 240/25) są już wśród 6 wariantów ENEA,
  więc dodano **13 nowych** bez dublowania rekordów.
  Źródło: NKT `CTL00109 rev. 4`:
  https://sklep.enexon.pl/amfile/file/download/file/708137/product/8814/
- **Tele-Fonika XRUHAKXS (Al) i XRUHKXS (Cu) 12/20(24) kV**:
  **27 nowych wariantów**: Al 50–1000 mm² (13 wierszy),
  Cu 35–1000 mm² (14 wierszy), z konkretnymi ekranami 16/25/35/50 mm².
  R20, R20 ekranu, C, L, Iz i Ith pochodzą z odpowiednich wierszy
  `TFK WIND ENERGY CABLES, Clean Energy Edition II, 2025`,
  strony drukowane 40–45. Wariant referencyjny obciążalności:
  trójkąt, ekrany uziemione obustronnie, grunt 20°C, 0,7 m, 1 K·m/W.
  https://www.tele-fonika.com/storage/file/core_files/2025/3/27/7459739d043ef898b9ecd655bc593b07/Clean%20Energy%20ENG.pdf
- **Tele-Fonika 18/30(36) kV**: dalsze **27 modeli XRUHAKXS/XRUHKXS**
  z tej samej publikacji, ale **z odrębnych tabel dla 18/30 kV**
  (str. drukowane 58–63). Al 50–1000 mm²: 13 rekordów,
  Cu 35–1000 mm²: 14 rekordów. Dla każdego źródłem R20, C, L,
  Iz, Ith fazowego/ekranu i R20 ekranu jest odpowiadający mu wiersz
  katalogu 18/30, a nie przeniesienie danych z 12/20.
  Wartość `voltage_rating_kv=30` odróżnia klasę elektryczną typu.

**To nie jest deklaracja pełnego światowego asortymentu producentów.**
Dla innych napięć SN, konstrukcji i ekranów nie tworzy się nowych
„produktów NKT/TFK” przez zmianę samej nazwy. Wymagane są odpowiadające
im karty producenta. W szczególności nie wolno utożsamiać wariantu
12/20 kV z 18/30 kV.

### Rozszerzenie nN — rzeczywiste tablice NKT

Zamiast 17 typów są **54 typy** w istniejącym katalogu nN:
17 dotychczasowych, **19 NKT YKXSżo Cu/XLPE** oraz
**18 NKT YAKXSżo Al/XLPE**. Są to rodziny 4- i 5-żyłowe,
z R20, L→X przy 50 Hz, Iz w ziemi i w powietrzu, Ith(1s),
temperaturami i żyłą PE/PEN.

- YKXS, katalog NKT, str. druk. 64–65:
  https://www.elektrykasklep.pl/file,470067,ykxs.pdf
- YAKXS, katalog NKT, str. druk. 79–80:
  https://www.elektrykasklep.pl/file,553320,przewody-i-kable-elektroenergetyczne_201532.pdf

**Nie publikujemy Al 4×10 jako 3L+PEN**: żyła PEN aluminiowa musi mieć
co najmniej 16 mm². Przy 4 żyłach N/PE oraz 5 żyłach projektant nadal
musi poprawnie zadeklarować układ sieci i przypisanie funkcji żył.
`Iz` dotyczy dokładnie podanych warunków odniesienia producenta;
nie jest dopuszczalnym prądem każdego sposobu ułożenia.
Reaktancja żyły powrotnej w modelu wielożyłowym jest jawnym
założeniem geometrycznym, a nie osobnym pomiarem NKT.

### Zakres weryfikacji

- 6 wariantów NKT z typoszeregu ENEA 2026;
- 13 dalszych NKT XRUHAKXS1 do projektów odbiorcy;
- 54 TFK XRUHAKXS/XRUHKXS SN 12/20 i 18/30 kV do projektów odbiorcy;
- 37 dalszych NKT nN.

Są to rekordy o **niepustym minimum projektowym**, nie gwarancja, że
każdy wariant ma osobno potwierdzone R0/X0 dla dowolnego sposobu
uziemienia ekranów lub obciążalność po zmianie warunków ułożenia.
Takich wartości nie wolno wymyślać. Priorytetem dalszych aktualizacji
są kolejne tabele producentów, szczególnie Tele-Fonika nN oraz
NKT i TFK 8,7/15 kV i pozostałe wersje konstrukcyjne 18/30 kV.

## Hierarchia danych — globalnie

1. **Wyrób producenta:** dokładna karta konkretnego typu i wersji, jednostki,
   warunki odniesienia, URL i data weryfikacji.
2. **Standard ENEA:** wymagania dla sieci OSD, dopuszczony typoszereg,
   wyposażenie i kryteria doboru. **Nie jest kartą producenta.**
3. **Norma lub model obliczeniowy:** dane i wzory tylko z udokumentowanym
   zakresem ważności i statusem REFERENCYJNY. Nie udaje to wyrobu.
4. **Brak wiarygodnego źródła:** pole pozostaje nieznane, a model nie otrzymuje
   fałszywego statusu ZWERYFIKOWANY.

Niedopuszczalne: `None -> 0`, pochodna `P0 -> i0` bez danych magnesowania,
szacowanie `I²t` konkretnej wkładki NH, utożsamianie `Icu` z warunkową
zdolnością kombinacji NH oraz przenoszenie `Sk3,max` na `Sk3,min`.

## Źródła ENEA dla pozostałych rodzin

Oficjalny indeks obowiązujących wydań:
https://www.operator.enea.pl/uslugi-dystrybucyjne/instrukcje-i-standardy/standardy-w-sieci-dystrybucji

| Rodzina katalogu | Źródło ENEA / zastosowanie |
|---|---|
| Stacje i pola SN/nn, transformatory | Stacje SN zeszyt 1: prefabrykowane do 630 kVA (od 01.01.2025); zeszyt 2: uproszczone do 400 kVA (od 01.01.2025); zeszyt 3: słupowe (od 02.04.2024) |
| Linie napowietrzne SN, konstrukcje | Elektroenergetyczne linie napowietrzne SN (od 16.03.2026) |
| Kable SN, żyły powrotne, osprzęt | Elektroenergetyczne linie kablowe SN (od 01.07.2026), szczególnie pkt 4.2.2 i 8 |
| Układy sterowania, łączniki SN | Linie i stacje SN — Telemechanika (od 01.02.2026); dokumentacja aparatury producenta |
| Przewody, linie nN i kable nN | Linie napowietrzne nN (od 01.04.2026), linie kablowe nN (od 01.10.2025) |
| Sieci WN, GPZ i pola 110 kV | Stacje elektroenergetyczne 110 kV Zeszyty 1/2/3; właściwy standard linii 110 kV |
| CT/VT, zabezpieczenia, źródła OZE, BESS | Standardy ENEA dla układu/stacji + IEC/PN-EN i karta konkretnego urządzenia; parametry nastaw, zwarć i certyfikaty osobno |
| Ograniczniki przepięć, uziemienia | Ochrona przed porażeniem w sieci SN (od 01.10.2025), budowa układów uziomowych (od 01.10.2025) |

Ta tabela wskazuje dokumenty właściwe do dalszej **weryfikacji**, nie
poświadcza, że każdy rekord został już potwierdzony przez producenta.

## Ubuntu — bieżący audyt wszystkich rodzin

Jedno polecenie w katalogu `mv-design-pro`:

```bash
bash scripts/catalog_audit_ubuntu.sh
```

`bash scripts/catalog_audit_ubuntu.sh --strict` dodatkowo odrzuca brakujące minimum.
Wymaga przygotowanego środowiska Python 3.11 z zależnościami backendu.


```bash
cd mv-design-pro
PYTHONPATH=backend/src python -m network_model.catalog.completeness_report --summary
PYTHONPATH=backend/src python -m network_model.catalog.completeness_report > catalog-completeness.json
PYTHONPATH=backend/src pytest -q backend/tests/network_model/catalog/test_cable_line_catalog_width.py backend/tests/network_model/catalog/test_catalog_global_completeness_report.py
```

`--strict` zwraca kod 1, jeśli istnieje rekord o niepełnym **minimalnym**
zestawie parametrów. Pozwala na jawne, fizycznie właściwe `None`:
np. Icu rozłącznika, I²t bez wskazanej wkładki, liczba biegunów abstrakcyjnego
MCB. W raporcie wszystkie takie pola są widoczne **oddzielnie**.

**Niedomknięte z innych gałęzi:** PR #507 aktualizuje 25 `i0_percent`
transformatorów; dopóki go nie scalono, `--strict` dla `main` słusznie
może zgłosić braki. Przyjęcie PR #507 nie oznacza, że wartości referencyjne
stają się danymi znamionowymi konkretnych transformatorów.

## Kryterium gotowości

Opus powinien używać tego samego `get_default_mv_catalog()`, bez kopiowania
katalogu na frontend. Nie należy usuwać komunikatu o brakującym **parametrze
wymaganym** przez fałszywe dane. Parametr niemający zastosowania powinien
być prezentowany jako „nie dotyczy”, a parametr modelu referencyjnego —
z opisem pochodzenia, bez sugerowania pomiaru wyrobu.
