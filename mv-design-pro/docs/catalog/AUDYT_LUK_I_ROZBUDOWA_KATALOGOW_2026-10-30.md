# MV-DESIGN-PRO — pomiar luk i rozbudowa katalogów
**Data:** 30.10.2026. **Zakres:** audyt danych i katalogi aparatury; bez przebudowy SLD i solverów.

## 1. Sprostowanie zgłoszenia „136 pól”

136 ze 179 kluczy serwera nie miało polskich etykiet w panelu ogólnym.
To **nie jest** liczba braków obliczeniowych. Poprawkę słownika etykiet
wykonuje osobny wykonawca, poza niniejszym PR.

Nie należy wyświetlać wszystkich pól klasy katalogowej na każdej karcie
urządzenia. Część pól nie dotyczy typu; „brak danych” oznacza wyłącznie
faktycznie nieustaloną wartość odpowiednią dla danego zastosowania.

## 2. Rzeczywisty pomiar dostępny w repozytorium

Nowy, tylko odczytowy moduł:
`backend/src/network_model/catalog/audyt_luk_technicznych.py`

```bash
cd mv-design-pro
export PYTHONPATH="$PWD/backend/src:$PWD/backend"
python -m network_model.catalog.audyt_luk_technicznych
python -m network_model.catalog.audyt_luk_technicznych --csv > luki_katalogowe.csv
python -m network_model.catalog.audyt_luk_technicznych --pelny > luki_katalogowe.json
bash scripts/catalog_audit_ubuntu.sh
```

Raport zawiera:
- **rodzina × rodzaj wpisu × pole × analiza × liczba dotkniętych pozycji**;
- identyfikatory pozycji przy `--pelny`;
- osobno braki techniczne, dane projektu i podejrzane wartości zerowe;
- osobno szablony projektowe CT (78 wpisów) i profile ENEA;
- wszystkie rodziny z istniejącego `completeness_report.MINIMUM`;
- dodatkową kontrolę rzeczywistych pól dla kabli, linii, CT, VT,
  aparatury SN i przekształtników.

**Nie wpisywać do raportu fikcyjnych wyników pomiaru.** Nie ma jeszcze
potwierdzonego wykonania pełnego katalogu w tym środowisku — prace
GitHub Actions są w kolejce. Zgłoszone 136 etykiet nie jest wpisywane
do licznika luk technicznych.

Raport ma zakres diagnostyczny, nie jest nową bramką publikacji ani
wyboru urządzenia. Brak parametru do *jednej* szczegółowej analizy
nie oznacza braku danych do wszystkich analiz.

### Fizyczne rozróżnienia

- **Kabel SN:** `r0/x0` nie ma jednej wartości bez odniesienia do
  sposobu połączenia ekranu i drogi powrotnej prądu. Gdy typ deklaruje
  `z0_reference_bonding`, komplet `r0/x0` staje się wymagalny dla
  tej dokładnie określonej konfiguracji.
- **CT:** brak `primary_taps_a` przy 200/5 A *nie* jest luką.
  `secondary_cores` przy wielordzeniowym CT jest oceniane niezależnie
  od liczby zaczepów. `rct_ohm` dotyczy szczegółowego modelu
  rdzenia zabezpieczeniowego, nie zwykłego pomiarowego.
- **Aparatura:** zdolność wyłączania zwarcia nie dotyczy odłącznika;
  `i_dyn_ka` to wytrzymałość znamionowa, nie obliczony prąd szczytowy
  zwarcia `ip`.
- **Źródło GPZ:** S″k / I″k i R/X w danym punkcie są danymi projektu
  od OSD, nie cechą katalogową aparatu.
- **Wartość 0:** przy polach takich jak moc znamionowa, I1 CT czy
  przekrój kabla nie jest dowodem kompletności. Audyt pokazuje
  takie przypadki osobno do sprawdzenia (bez automatycznej korekty).

## 3. Uzupełnione rodziny rzeczywistych producentów

| Rodzina | Zmiana | Potwierdzona podstawa |
|---|---|---|
| KPB Intra CTS 25 | skorygowane 5–3200 A, 1/5 A, do 4 rdzeni, moce 2,5–60 VA, zakres Ith 2–80 kA, FS/ALF jako opcje; dane izolacji | [KPB CTS25 (22_03)](https://intrapolska.pl/uploads/produkt_files/k_kat_cts_25_%2822_03%29.pdf) |
| KPB Intra CTT 25 | **nowa rodzina**, przepustowy 100–2500 A, do 3 rdzeni, odczepy wtórne | [KPB CTT25](https://intrapolska.pl/produkt/28/39/przekladniki%20pradowe%20wnetrzowe/ctt%2025.htm) |
| KPB Intra CTB 25 | **nowa rodzina**, przepustowy 5–1000 A, do 3 rdzeni, moce 2,5–60 VA, Ith 2–80 kA jako granice rodziny | [KPB CTB25 (22_03)](https://intrapolska.pl/uploads/produkt_files/k_kat_ctb_25_%2822_03%29.pdf) |
| ABB TPU 6x.xx | **nowa rodzina**, Um 24/25 kV, 10–3200 A, maksymalnie 6 uzwojeń zależnie od wykonania, zakres Ith 2–100 kA/1s | [ABB 1VLC000502 Rev.11](https://library.e.abb.com/public/ad0a0539e0c94a4dbbaa84a103c58006/TPU%206x.xx_1VLC000502%20Rev.11%2C%20en.pdf) |
| KPB Intra VTS 25 | uzupełniona z DTR konfiguracja 1–4 uzwojeń, 100/√3 do 400/√3 V jako opcje, resztkowe 100/3, 110/3, 120/3 V **tylko w wariancie z tym uzwojeniem** | [KPB VTS25](https://intrapolska.pl/uploads/produkt_files/k_kat_vts_25.pdf) |
| KPB Intra VTS 25 Sch | **nowa rodzina**, wykonanie do rozdzielnic SM6; opcjonalne uzwojenia resztkowe i odczepy | [KPB VTS25 Sch](https://intrapolska.pl/produkt/27/50/przekladniki%20napieciowe%20wnetrzowe/vts%2025%20sch.htm) |

Łączna biblioteka rodzin producentów CT/VT: **61**, wobec 57 przed
niniejszą zmianą (4 nowe rodziny). Istniejący katalog konkretnych
`CTType` / `VTType` nie został sztucznie powiększony przez powyższe
rodziny. Ilość przykładowych wariantów nie jest dowodem kompletności
kart producenta.

FS i ALF to **opcje dostępne w rodzinie**, nie parametry każdego
konkretnego wykonania. Maksimum Ith producenta nie może być
kopiowane na dowolną kombinację przekładni, klasy i rdzeni.
Zdefiniowane przełączanie pierwotne i wtórne nie potwierdza
konkretnego zestawu zaczepów 200–400/5 A bez DTR danej konfiguracji.

## 4. Kolejność uzupełniania po uruchomieniu pomiaru

1. Pozycje **rzeczywistych produktów** używane w obliczeniach: uzupełnić
   producenta / kartę / dokument / jednostki, bez dopisywania
   niepotwierdzonego Ith, Rct, Z0 itp.
2. Kable/linie SN: żyły powrotne, termika i parametry odnoszące się
   do **konkretnego** sposobu połączeń. Nie wypełniać uniwersalnym Z0.
3. Transformatory: parametry zwarciowe i strat, z prawidłowym modelem
   składowej zerowej zależnym od uzwojeń i uziemienia.
4. Aparatura SN: znamionowa wytrzymałość, prąd wyłączalny, czas
   wyłączenia; nie mylić zdolności znamionowej z wynikiem obliczeń.
5. CT/VT: pełne karty poszczególnych **wykonań** producenta.
6. DER: wkład zwarciowy i charakterystyki regulacyjne z kart
   właściwych przekształtników, bez cichego kopiowania szacunków.

**Bez zmiany:** konfigurator Opusa, istniejące ID, interfejs SLD,
`CatalogRepository`, `catalog_ref`, solver, system gotowości i
deterministyczne migawki.

## 5. Odbiór

- Raport CSV/JSON jest powtarzalny dla tego samego katalogu.
- Szablon projektowy nie jest mylony z potwierdzonym produktem.
- Brak Rct CT nie stanowi błędu w rdzeniu wyłącznie pomiarowym.
- Brak Z0 bez modelu uziemienia ekranów nie powoduje wpisania fałszywych
  parametrów katalogowych.
- Jeden brak pola nie blokuje publikacji aparatu ani pracy w SLD.
- Każda nowa właściwość rodziny ma dokument producenta.
- Zmiany przechodzą testy katalogowe; pełny wynik CI trzeba potwierdzić
  przed integracją (nie interpretować kolejki CI jako zaliczonych testów).
