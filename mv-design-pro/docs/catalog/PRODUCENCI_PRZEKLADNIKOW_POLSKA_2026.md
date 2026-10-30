# MV-DESIGN-PRO — katalog producentów przekładników na rynku polskim (30.10.2026)

## Wynik

Na bazie PR #509 wprowadzono **49 źródłowych rodzin 12 producentów**,
**3 dodatkowe identyfikowalne wyroby VT ESITAS**. Razem w istniejącym
katalogu CT/VT: **68 CT i 31 VT**; osobny katalog Ferranti: 5 typów
z wcześniejszego etapu PR #509. **49 rodzin nie jest 49 zamawialnymi
typami przekładników**; nie mają wymaganych kompletów przekładnia +
klasa + moc + rdzenie + Ith + poziom izolacji jednego konkretnego SKU.

### Kluczowi producenci i źródła w Polsce

| Producent | Rodziny | Podstawa i status |
|---|---|---|
| **KPB Intra** (Czechy, przedstawicielstwo Tychy) | CTS 12.L, CTS 17.SW, CTS 25, CTSO 17, VTS 25/38, VTO 38 | [Producent PL](https://intrapolska.pl/), [CTS 12.L](https://intrapolska.pl/produkt/28/23/przekladniki%20pradowe%20wnetrzowe/cts%2012_l.htm), [VTS 25](https://intrapolska.pl/produkt/27/49/przekladniki%20napieciowe%20wnetrzowe/vts%2025.htm). Szczegółowe zakresy wyłącznie dla CTS 12.L/17.SW oraz VTS25 |
| **RITZ** | GS, GIS (CT), GE, GSES (VT) | [Polski dostawca ZELAP-PROAT](https://zelap-proat.pl/przekladniki.html) — produkty i zastosowania, bez jednej uniwersalnej przekładni |
| **Arteche** | ACI (CT), UCI, UCIF (VT) | Wykaz ELMOR WEGA 2015, przyjęte jako historyczne typy kompatybilne, nie aktualne SKU |
| **ALCE Elektrik** | AB12/AB24/AK24/AD24 (CT), VB12/VB24/2VB24/VBF24 (VT) | [Producent — katalog rodzin](https://www.alce-elektrik.com/our-products/indoor-instrument-transformers/) wraz z Um |
| **ESITAS** | ATB20-10/-15, ATH21 (CT), VTB20-K, VTH20-N, 2VTH20-N (VT) | [Polski dostawca ASTAT](https://astat.pl/produkty/energetyka-i-miernictwo/przekladniki-sredniego-napiecia/) |
| **PLESSE** (Polska, Pszczyna) | CTB wersje 1–4, CTG | [Producent PLESSE](https://plesse.pl/) |
| **ZWARPOL** (Polska, Warszawa) | JSGO-2a i JSGO-2b | [Producent ZWARPOL](https://www.zwarpol.com/oferta/przekladniki-i-sensory/) |
| **PFIFFNER** (Szwajcaria, dystrybucja Polska) | CT pierścieniowy; przekładniki CT i VT do GIS | PFIFFNER Polska / katalog firmowy ENERGETAB 2021 |
| **MBS** | ASK i ASR (nN) | [Polski katalog ofertowy ASTAT](https://astat.pl/produkty/energetyka-i-miernictwo/przekladniki-pradowe-niskiego-napiecia/przekladniki-pradowe-do-rozliczen-z-energetyka/242/) |
| **Łukasiewicz-ITR** (Polska) | CR i CRR (niskomocowy pomiar prądu), UR56/UR66/UR90/URW (niskomocowy pomiar napięcia) | [CT](https://energetyka.itr.org.pl/przekladniki-pradowe), [VT](https://energetyka.itr.org.pl/przekladniki-napieciowe-ur). Oddzielna fizyka wyjścia sensorów |
| **SPIE Energotest** (Polska) | I0 — ziemnozwarciowy Ferrantiego | [Własna produkcja i instrukcje](https://spie-energotest.pl/do-pobrania) |
| **ZELISKO** (Austria, stosowany w Polsce) | sensory napięciowe | [Polski wykonawca układów ZOE](https://zoen.pl/oferta/uklady-pomiarowo-rozliczeniowe-sensory-napieciowe) |

### Konkretnie zidentyfikowane SKU (ESITAS)

Dodatkowe **3 pełniej zidentyfikowane rekordy VT** w istniejącym `/api/catalog/vt-types`, wszystkie kl. **0,2** z dokładnością w zakresie **0–10 VA**. Nie podawano nieznanego Fv ani uzwojenia resztkowego.

| Kod produktu | Przekładnia | Um | Źródło |
|---|---|---|---|
| ESI-VTB20KM150000 | 15000/√3 / 100/√3 V | 24 kV | [ASTAT](https://astat.pl/produkty/przekladniki-sredniego-napiecia-esi-vtb20km150000/) |
| ESI-VTB20KM200000 | 20000/√3 / 100/√3 V | 24 kV | [ASTAT](https://astat.pl/produkty/przekladniki-sredniego-napiecia-esi-vtb20km200000/) |
| ESI-VTB10KM150000 | 15000/√3 / 100/√3 V | 17,5 kV | [ASTAT](https://astat.pl/produkty/przekladniki-sredniego-napiecia-esi-vtb10km150000/) |

Ostrzeżenie: kod SKU potwierdza podane parametry, nie wszystkie warianty uzwojeń albo rzeczywistą obciążalność zwarciową. Nadal brak potwierdzonego Fv dla tych pozycji.

### Reguła inżynierska

**Nie wolno rozszerzać zakresu producenta przez iloczyn kartezjański opcji.**
Przykład: karta KPB CTS 17.SW mówi 5–3200 A, 1/5 A,
2,5–60 VA, 0,2S/5P, FS5/FS10 i Ith 2–80 kA, ale NIE
potwierdza, że wariant 5/1 A 0,2S 60 VA FS5 80 kA jest dostępny.
Takie dane należą do jednego kodu wykonania i wymagają DTR lub oferty producenta.
Również uzwojenie 100/3 V jest w rodzinie VTS25 **opcją**, a nie
konsekwencją samej klasy 3P.

Sensory **CR/CRR** (cewki Rogowskiego), **UR** (dzielniki rezystancyjne)
i przekładniki I0 to osobne mechanizmy, nie klasyczne przekładniki
1/5 A czy 100 V. Przy obliczeniach i EAZ wymagają potwierdzenia
kompatybilności wejścia, czułości i odwzorowania sygnału.

### Wdrożenie

- `GET /api/catalog/instrument-transformer-families`: 49 rodzin, struktura z proweniencją i flagą `MANUFACTURER_FAMILY_NOT_SKU`, brak możliwości przypisania jako urządzenia.
- `GET /api/catalog/vt-types`: 31 pozycji, w tym 3 kodowe ESITAS.
- Zakładka `Rodziny przekładników producentów` w `TypeLibraryBrowser` plus karty szczegółowe; blokada przypisywania w `TypePicker`.
- Testy: `backend/tests/network_model/catalog/test_ct_vt_manufacturers_poland_2026.py`.
- Ubuntu: `bash scripts/catalog_audit_ubuntu.sh`.

**Następna bramka jakości:** pozyskać pełne tabliczki / numery zamówieniowe
z aktualnymi wartościami wszystkich rdzeni CT (S, klasa, FS/ALF, Ith, Idyn,
Rct) i uzwojeń VT (klasa, S, schemat, Fv/czas, obciążenie i 3U0);
dopiero potem `PRODUKCYJNY_V1`. Unikać fałszywej prezentacji rodziny
jako kompletnego aparatu.
