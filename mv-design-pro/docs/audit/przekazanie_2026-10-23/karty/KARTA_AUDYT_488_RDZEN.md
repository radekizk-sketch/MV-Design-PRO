# Karty rdzenia z audytu PR #488 (etap II) — rozstrzygnięcie architekta 2026-10-22

Podstawa: audyt badał `main` 8f7ed3c27; gałąź programu f121c5e79 zawiera go (przodek).
Ocena zarzutów na gałęzi programu:
- Ib z DC (short_circuit_core.py:203 na main) — NAPRAWIONE na gałęzi programu
  (`prad_wylaczeniowy_symetryczny_a`, DC osobno, equation_registry.py:553). Karta: tylko sonda,
  że żaden konsument (raport, proof, front, eksport) nie liczy/nie opisuje starego wzoru.
- c nN ±6 % / ±10 % — NAPRAWIONE (`network_model/core/voltage_factor.py` PLUS_6/PLUS_10,
  `enm/tolerancja_nn.py`). Bez karty.
- KCL na modułach + kierunek z |V| — POTWIERDZONE (short_circuit_iec60909.py ~1550–1640). Karta A.
- 1e6 w Y0 (enm/mapping.py:662) — POTWIERDZONE i gorsze niż w audycie: węzeł bez drogi
  składowej zerowej dostaje Z0≈1e-6 pu, czyli zwarcie 1F w nim wygląda jak w sieci
  sztywno uziemionej (fikcja); bloki galwanicznie połączone bez odniesienia do ziemi nie są
  w ogóle objęte warunkiem (wiersz niezerowy) → macierz osobliwa. Karta B.
- 50 Hz na sztywno — POTWIERDZONE: ENM ma `frequency_hz` (models.py:199), rdzeń SC używa
  OMEGA_50HZ i f_hz=50 domyślnie. Klasa: model niesie daną, rdzeń ją ignoruje. Karta C.
- Brak identyfikacji wydania normy — POTWIERDZONE (32 pliki z literałem „60909-0:2016",
  brak pola w przypadku/wyniku). Karta D. Profil 2026 = BLOKADA (brak tekstu), nie zgadujemy.

Kolejność (te same pliki rdzenia, jedna pełna regresja naraz): po partii zwarć i partii 2 →
A → B → C → D → ZEROWA-POJEMNOSCI (korzysta z D). Każda karta: worker-rdzen, B-01 architekt
(pełna regresja, sonda liczbowa zmienionych wartości z podstawą normową, determinizm/hash,
iniekcje), FROZEN tylko addytywnie albo z podniesieniem wersji.

## A. BILANS-THEVENIN
Cel: dowód bilansu prądu w węźle zwarcia FAZOROWO: Σ I_gałęzi(fazor) wchodzących = I″k (fazor),
residuum |ΣI − I″k| z tolerancją jawną w śladzie. Kierunek gałęzi z rzeczywistej części
iloczynu fazora prądu i orientacji gałęzi (znak przepływu w kierunku from→to), nie z |V|.
Granice: wartości |I| gałęzi bez zmian (sonda: 0 różnic modułów), zmienia się tylko kierunek
tam, gdzie heurystyka |V| się myliła, i treść kroku śladu. Iloczyn testów: sieć promieniowa ×
pierścień × dwa źródła × gałąź z kątem fazora ≠ kąt I″k (silne R/X) × gałąź opublikowana /
pominięta (WkladPominiety) — bilans musi się domykać z pominiętymi wliczonymi. Iniekcje:
odwrócony kierunek, zgubiona gałąź, suma modułów zamiast fazorów → czerwone.
Jedno źródło prawdy kierunku dla wkładów Thevenina i WKLAD-ZRODLA (wklady_zrodel_bilans).

## B. Y0-WYSPY (zastąpienie 1e6)
Cel: Y0 dzielona na składowe spójne (connected_components, jak `wyspy_macierzy`); składowa
bez odniesienia do ziemi (brak admitancji poprzecznej do ziemi: uziemienie punktu
neutralnego, gałąź TR LV/HV_SHUNT_GROUND, B0 gdy wymagane) = sieć izolowana w składowej
zerowej. Zwarcie 1F/2F-Z w takiej składowej: Z0 = ∞ → I″k1 = 0 dla zwarcia metalicznego wg
IEC 60909 (norma nie liczy prądu zwarcia doziemnego w sieci izolowanej), wynik oznaczony
statusem NIE_DOTYCZY z wyjaśnieniem (kontrakt werdyktu wyjaśnialnego) i odesłaniem do analizy
zwarć doziemnych (prąd pojemnościowy). Węzły poza składową węzła zwarcia nie wchodzą do Zbus.
Brak liczby 1e6 w kodzie; guard/test grep. Sonda: wszystkie sieci referencyjne/golden —
które wyniki 1F/2F-Z się zmieniają (oczekiwane: tylko węzły izolowane w Y0), każda zmiana
z uzasadnieniem. Iloczyn: TR Dyn/Yyn/YNd/Yd × uziemienie N (sztywne/rezystor/izolowane/
kompensowane) × zwarcie po stronie odciętej / nieodciętej × 1F / 2F-Z.

## C. CZESTOTLIWOSC
Cel: f z ENM (`frequency_hz`) wpięte w rdzeń SC (κ — metoda B/C z f_c=20 Hz przy 50 Hz /
24 Hz przy 60 Hz wg IEC 60909-0:2016 pkt 8.1, m/n, i_DC, X ze współczynnikiem ω gdy dane
w mH/µF) i we WSZYSTKIE konsumenty OMEGA_50HZ/f_hz=50 (inwentarz klasy: grep po solvers/,
proof_engine, analysis, front). f ∉ {50, 60} → odmowa danych z wyjaśnieniem (norma obejmuje
50 i 60 Hz). Determinizm: 50 Hz bit-identycznie (sonda hashów golden = 0 różnic).
Testy: 50 vs 60 Hz × κ metoda B/C × m/n × i_DC; wartość referencyjna 60 Hz ręcznie.

## D. PROFIL-NORMY
Cel: jawny identyfikator wydania `IEC_60909_0_2016` w konfiguracji przypadku (domyślny, jedyny
dopuszczony), w wyniku (addytywne pole, exclude_none), w śladzie, proof pack i raportach —
jedno źródło stałej zamiast 32 literałów. `IEC_60909_0_2026` istnieje w rejestrze jako
ZABLOKOWANY (odmowa z wyjaśnieniem: brak zweryfikowanego tekstu; EN IEC 60909-0:2026 z
18.09.2026, status PN niepotwierdzony) — bez kopiowania współczynników 2016.

## Uzupełnienie karty B — inwentarz klasy „admitancja 1e6 jako fikcja” (2026-10-22, weryfikacja partii zwarć)
- `enm/mapping.py:662` — węzeł odcięty w Y0 (opis wyżej).
- `network_model/core/ybus.py:188` (`_ground_slack_buses`) — węzeł SLACK BEZ impedancji źródła dostaje w sieci
  zwarciowej 1e6 pu, czyli szynę nieskończoną (Sk″ = ∞). Wg ZASADY NR 4 brak S_k″ sieci zasilającej nie może dawać
  fikcji ani blokady: wartość robocza (S_k″ i R/X z profilu napięcia, ESTIMATED, `dane_przyjete`, NIEPELNY) i
  przeliczenie. Sprawdź, czy walidator/gotowość dopuszcza dziś taki bieg; jeśli tak — wpięcie wartości roboczej.
- Grep całej klasy przed naprawą: `1e6|1\.0e6|1e9|1e-9 *\*|INF|np.inf` w solvers/, core/, enm/mapping.py,
  solver_input/ — każde trafienie sklasyfikowane (fikcja fizyczna / tolerancja numeryczna z podstawą).

## Podział karty B (wpis 13 KOORDYNACJA, 06e47e313)
Strona `enm/mapping.py` (1e6 w Y0, składowe spójne, ZU z GroundingConfig, hv_neutral, trzy przyczyny jako odmowa przed
solverem) → karta UI/UX GPZ-H5-SKLADOWA-ZEROWA, weryfikacja B-01 moja. Karta B w moim wątku = tylko SLACK bez Z źródła
(`core/ybus.py:188`) + inwentarz klasy 1e6 w rdzeniu. ZEROWA-POJEMNOSCI idzie PO scaleniu karty UI/UX.
