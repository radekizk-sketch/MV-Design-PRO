# SLD Visual Parity Checklist

**Status:** kontrakt dowodowy, nie deklaracja pełnego parytetu  
**Zakres:** GPZ, rozdzielnia SN, mini-bloki RMU/RM6, sieć terenowa SN  
**Zasada:** dopóki punkt nie ma dowodu w rendererze, teście i/lub porównaniu ze zrzutem referencyjnym, nie wolno deklarować parytetu pixel-level.

## Kryteria ogólne

| ID | Wymaganie | Dowód w kodzie | Dowód wizualny | Status |
|---|---|---:|---:|---|
| SLD-01 | Zielony tor zasilania jest głównym nośnikiem topologii | tak | brak | częściowy |
| SLD-02 | Schemat jest ortogonalny, bez przypadkowych przekątnych | częściowo | brak | częściowy |
| SLD-03 | Brak danych nie jest renderowany jako `0.00` | tak | brak | częściowy |
| SLD-04 | Każdy element elektryczny ma znaczenie domenowe | częściowo | brak | częściowy |
| SLD-05 | Widok nie używa dekoracyjnych ikon bez portów | częściowo | brak | częściowy |

## GPZ

| ID | Wymaganie | `data-parity-key` | Status |
|---|---|---|---|
| GPZ-01 | Główny kontener GPZ ma stabilny korzeń i ramę | `gpz.root`, `gpz.frame` | testowane strukturalnie |
| GPZ-02 | Header operatorski jest osobną warstwą | `gpz.header` | testowane strukturalnie |
| GPZ-03 | Header pokazuje status transmisji | `gpz.header.transmission` | testowane strukturalnie |
| GPZ-03A | Header nie pokazuje statusu `TRANSMISJA NIEZNANA`; brak danych transmisji jest stanem cichym | brak `gpz.header.transmission` przy `unknown` | testowane |
| GPZ-04 | Header pokazuje nazwę GPZ | `gpz.header.name` | testowane strukturalnie |
| GPZ-05 | Header obsługuje adres/radio | `gpz.header.address` | testowane strukturalnie |
| GPZ-06 | Header obsługuje bilans P/Q | `gpz.header.balance` | testowane strukturalnie |
| GPZ-07 | Header obsługuje alarmy | `gpz.header.alarms` | testowane strukturalnie |
| GPZ-08 | Header obsługuje sterowanie i kasowanie sygnalizacji | `gpz.header.control`, `gpz.header.reset_signals` | testowane strukturalnie |
| GPZ-09 | Strona 110 kV ma własny obszar i szynę | `gpz.hv`, `gpz.bus.hv` | testowane strukturalnie |
| GPZ-10 | Brak danych 110 kV jest jawny | `gpz.hv.missing` | do testu brakowego |
| GPZ-11 | Pole HV jest osobnym elementem | `gpz.hv.bay` | testowane strukturalnie |
| GPZ-12 | Transformator WN/SN jest osobnym symbolem | `gpz.transformer.symbol` | testowane strukturalnie |
| GPZ-13 | Uzwojenia WN/SN transformatora są rozróżnione | `gpz.transformer.winding.hv`, `gpz.transformer.winding.sn` | testowane strukturalnie |
| GPZ-14 | Sekcja SN jest osobnym obiektem | `gpz.section` | testowane strukturalnie |
| GPZ-15 | Szyna SN jest osobną szyną | `gpz.bus.sn` | testowane strukturalnie |
| GPZ-16 | Pole SN jest osobną kolumną | `gpz.bay` | testowane strukturalnie |
| GPZ-17 | Tor pola SN jest jawny | `gpz.bay.power_path` | testowane strukturalnie |
| GPZ-18 | Wyłącznik SN jest kwadratem | `gpz.apparatus.cb` | testowane strukturalnie, pixel pending |
| GPZ-19 | Odłącznik jest kołem | `gpz.apparatus.ds` | testowane strukturalnie, pixel pending |
| GPZ-20 | Przekładnik prądowy jest markerem pomiarowym | `gpz.apparatus.ct` | testowane strukturalnie, pixel pending |
| GPZ-21 | Uziemnik jest boczny, nie w osi toru | `gpz.apparatus.es.side` | testowane strukturalnie, pixel pending |
| GPZ-22 | Głowica kablowa jest oddzielna od uziemnika | `gpz.apparatus.cable_head` | testowane strukturalnie, pixel pending |
| GPZ-23 | Sprzęgło sekcyjne jest osobnym elementem | `gpz.coupler` | testowane strukturalnie |
| GPZ-24 | Badge statusów pola są dostępne do kontroli | `gpz.status_flags` | testowane strukturalnie |
| GPZ-25 | Pomiary pola są osobną warstwą | `gpz.measurements` | testowane strukturalnie |

## Stacja SN/nN jako mini-RMU

| ID | Wymaganie | `data-parity-key` | Status |
|---|---|---|---|
| RMU-01 | Stacja w oddaleniu nie jest pojedynczym rombem | `station.mini.root` | testowane strukturalnie |
| RMU-02 | Mini-blok ma korpus i nazwę | `station.mini.body`, `station.mini.name` | testowane strukturalnie |
| RMU-03 | Mini-blok pokazuje typ stacji | `station.mini.type` | testowane strukturalnie |
| RMU-04 | Mini-blok ma szynę SN | `station.mini.bus.sn` | testowane strukturalnie |
| RMU-05 | Mini-blok składa się z pól SN | `station.mini.bay` | testowane strukturalnie |
| RMU-06 | Detail LOD pokazuje stronę nN | `station.mini.lv_row` | testowane strukturalnie |
| RMU-07 | Transformator jest osobnym markerem | `station.mini.transformer` | testowane strukturalnie |
| RMU-08 | PV/BESS/FW są widoczne jako badge DER | `station.mini.der_badges`, `station.mini.der_badge` | testowane strukturalnie |
| RMU-09 | Braki danych są jawne | `station.mini.missing`, `station.mini.blocker` | częściowo |

## Dowody wymagane do pełnego parytetu

1. Referencyjne zrzuty ekranów z opisanym źródłem i zakresem funkcji.
2. Manualne porównanie side-by-side dla GPZ, mini-RMU i dużej sieci terenowej.
3. Golden image snapshots z tolerancją pixel-diff uzgodnioną dla SVG/Canvas.
4. Test strukturalny `data-parity-key` musi przechodzić przed testami pixel-diff.
5. Każda deklaracja “parytet wizualny” musi wskazywać artefakt obrazu, nie tylko test DOM.

## Aktualna decyzja

Stan obecny można opisać jako: **operator-grade fundament strukturalny aspirujący do SCADA OSD**.  
Nie wolno opisywać go jako zweryfikowanego parytetu pixel-level, dopóki nie powstaną referencje i golden snapshots.
