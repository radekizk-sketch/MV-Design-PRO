# PROPOZYCJE ROZSZERZEŃ — CZEGO JESZCZE POTRZEBUJE INŻYNIER (2026-07)

**Status:** PROPOZYCJA — każda pozycja wymaga decyzji właściciela (TAK → karta w epiku / NIE / PÓŹNIEJ)
**Data:** 2026-07-15 (na żądanie właściciela: „zaproponuj czego jeszcze potrzebuje inżynier")
**Zasada:** propozycje NIE wchodzą do zakresu programu bez jawnej zgody (bez pełzania zakresu).
Pozycje P1–P6 wykorzystują istniejący backend (nakład głównie UI); P7–P12 wymagają pracy
backendowej (część poza granicą programu — do skierowania do programu 10x / osobnych kart).

---

## Grupa I — odsłonięcie istniejących możliwości backendu (szybkie zwycięstwa)

| # | Propozycja | Uzasadnienie inżynierskie | Stan backendu | Epik |
|---|---|---|---|---|
| P1 | **Panel jakości energii: harmoniczne** | ocena THD przy falownikach OZE — wymagana przy przyłączeniach | jest (`power_quality_harmonics` w rejestrze zdolności, ekrany V12.6) | E11 |
| P2 | **Zdolność przyłączeniowa (hosting capacity)** | „ile jeszcze OZE zmieści się w tej sieci" — pytanie nr 1 projektanta OZE | jest (`hosting_capacity`) | E11 |
| P3 | **Rozruch silników** | spadki napięcia przy rozruchu dużych napędów (stacje przemysłowe) | jest (`motor_starting`) | E8 |
| P4 | **Niezawodność / awarie N-1** (SAIDI/SAIFI, warianty zasilania) | uzasadnienie pierścieni i NOP twardymi wskaźnikami | jest (`reliability_contingency`) | E8 |
| P5 | **Bezpieczeństwo uziemień** (napięcia dotykowe/rażeniowe, dobór uziemienia punktu neutralnego) | obowiązkowe przy projektach stacji; dziś głęboko ukryte | jest (`earthing_safety`, `neutral_earthing_design`, `earth_fault_detection`) | E10 |
| P6 | **Koordynacja izolacji + przepięcia łączeniowe (TRV)** | dobór ograniczników i aparatów przy sieciach kablowych z OZE | jest (`insulation_coordination`, `transient_trv`) | E10 |

## Grupa II — warsztat projektanta (nowe funkcje UI na istniejących danych)

| # | Propozycja | Uzasadnienie inżynierskie | Nakład | Epik |
|---|---|---|---|---|
| P7 | **Profile obciążeń i generacji** (dobowe/sezonowe, typ odbiorcy; profil PV/FW wg lokalizacji) | rozpływ „na szczycie" to za mało przy OZE — potrzebne 8760 h albo profile charakterystyczne | UI + dane profili; rozpływ istnieje | E8 |
| P8 | **Automatyczny dobór przekroju kabla/linii** (kryteria: obciążalność, ΔU, I″k, I²t; propozycja z katalogu z uzasadnieniem WHITE BOX) | najczęstsza czynność projektanta; dziś ręczna pętla | logika doboru = analiza (bez fizyki nowej), katalog istnieje | E3/E4 |
| P9 | **Karta doboru aparatu** (porównanie parametrów granicznych aparatu z wynikami: I″k vs I_dyn/I_th, obciążenie vs In) | dowód „aparatura dobrana poprawnie" do projektu — dziś rozproszone | UI nad istniejącymi wynikami + katalogiem (proof Equipment istnieje) | E4/E9 |
| P10 | **Generator kompletu do wniosku OSD** (jeden przycisk: bilans mocy, zwarcia, zgodność NC RfG, schemat, zestawienia → paczka PDF) | cel końcowy większości projektów OZE; dziś składane ręcznie z kilku raportów | UI/raporty nad istniejącymi eksportami | E13 |
| P11 | **Rewizje modelu + porównanie rewizji** („co się zmieniło od wersji do OSD": diff elementów i parametrów) | audytowalność projektu w czasie; snapshot/archiwum już wersjonowane | UI + diff (archive_diff w API istnieje, niewpięty) | E2 |
| P12 | **Biblioteka wymagań OSD** (profile wymagań operatorów: poziomy napięć, granice cosφ, wymogi NC RfG per moc) | te same dane wpisywane w kółko; różnice między OSD są źródłem błędów | dane + UI; profile operatora częściowo w NC RfG | E11 |

## Grupa III — do rozważenia później (większy nakład / poza granicą programu UI)

- **Optymalizacja rozcięć i OPF/straty–koszty (LCC)** — backend `opf_loss_lcc` istnieje;
  pełny warsztat optymalizacyjny to osobny wątek produktowy.
- **Analiza niepewności** (`uncertainty_sensitivity` istnieje) — pasmo wyników zamiast punktu.
- **Import podkładu GIS / trasy kablowe po mapie** — duży temat; wymaga decyzji o formatach
  (GML/SHP) i prawach do podkładów.
- **Eksport/import formatów wymiany** (CIM/CGMES, pandapower) — interoperacyjność z narzędziami
  OSD; wymaga kart backendowych poza programem UI.
- **Tryb wariantowania „co-jeśli"** (drzewo wariantów projektu z porównaniem zbiorczym) —
  naturalne rozszerzenie przypadków; do projektu po U3.

## Rekomendacja zarządcy

Do zakresu U3–U4 proponuję włączyć od razu: **P1, P2, P5, P9, P10** (największa wartość dla
persony „projektant OZE + projektant stacji", najniższy nakład — backend gotowy). P7 i P8
rekomenduje jako pierwsze karty „nowej wartości" po zamknięciu macierzy pokrycia. Decyzje
właściciela wpisuję tu i przenoszę do PLANS.md.

| Decyzje właściciela | TAK / NIE / PÓŹNIEJ |
|---|---|
| P1–P6 (odsłonięcie istniejącego) | … |
| P7 profile · P8 dobór przekroju · P9 karta aparatu · P10 wniosek OSD · P11 rewizje · P12 biblioteka OSD | … |
