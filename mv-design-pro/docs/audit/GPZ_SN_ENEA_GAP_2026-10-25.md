# GPZ 15 kV — weryfikacja źródeł ENEA i luka do pełnego modułu SN

**Status:** audyt wejściowy / nie stanowi odbioru funkcjonalnego ani normatywnego.
**B-02:** ODRZUCONE. **Zakres:** tylko rozdzielnia SN GPZ; strona 110 kV jako zewnętrzny interfejs źródła.
**Dokument ENEA:** *Stacje elektroenergetyczne 110 kV. Zeszyt 1. Stacje dwutransformatorowe 110 kV/SN*, wersja 02.2023-2, ogłoszona jako obowiązująca od **02.04.2024**.
**Publiczne źródło:** https://www.operator.enea.pl/uslugi-dystrybucyjne/instrukcje-i-standardy/standardy-w-sieci-dystrybucji
**Oryginał:** https://www.operator.enea.pl/media/675/stacje-elektroenergetyczne-110-kv-zeszyt-1-stacje-dwutransformatorowe-110-kvsn-obowiazuje

## 1. Potwierdzone wymagania z dokumentu źródłowego

| ID | Kontrakt do wdrożenia i testowania | Jednostka ENEA | Status źródła |
|---|---|---|---|
| EN-GPZ-01 | Jednosystemowa rozdzielnia SN z dwiema sekcjami A i B; dwa pola TR, dwa pola pomiaru napięcia, sprzęgło i pola liniowe. Osobno pola ZU i BKR wymagane do kompletnego referencyjnego wyposażenia GPZ. | §13, str. I 23/76–I 26/76, rys. Z.2 | ŹRÓDŁOWO POTWIERDZONE |
| EN-GPZ-02 | Sprzęgło funkcjonalnie łączy sekcje A/B. Dopuszczalne wykonanie w jednej lub dwóch celkach; **rys. Z.12 nie determinuje indywidualnej geometrii dwucelkowego OEM**. | §13, rys. Z.12 | ŹRÓDŁOWO POTWIERDZONE |
| EN-GPZ-03 | Dwa odrębne pola pomiaru napięcia, po jednym na sekcję; ich VT nie są synonimem czujników/wskaźników napięcia w innych polach. | §13, rys. Z.2, Z.17 | ŹRÓDŁOWO POTWIERDZONE |
| EN-GPZ-04 | Przekładników napięciowych SN nie należy wyposażać we wkładki bezpiecznikowe. Przekładniki muszą dać się odłączyć i uziemić bez demontażu. | §13, str. I 26/76 | ŹRÓDŁOWO POTWIERDZONE |
| EN-GPZ-05 | Kolejność i położenie przekładników zależy od technologii; w rozdzielnicach powietrznych dozwolone są odstępstwa od wzorcowych schematów. Brak domyślnych przełożeń. | §13, str. I 24/76, rys. Z.7, Z.10, Z.11 | ŹRÓDŁOWO POTWIERDZONE |
| EN-GPZ-06 | Oddzielne symulowane stany i blokady wyłączników, odłączników, członów wysuwnych i uziemników; dla trójpołożeniowych istnieje odrębny wariant funkcjonalny. | §13, str. I 25/76 | ŹRÓDŁOWO POTWIERDZONE |
| EN-GPZ-07 | Przewidziane stałe uziemniki pól, szyn sekcji oraz wyprowadzeń liniowych; położenie w SLD wynika z właściwego toru, nie z dekoracyjnej konwencji. | §13, str. I 25/76–I 26/76, rys. Z.2 | ŹRÓDŁOWO POTWIERDZONE |
| EN-GPZ-08 | Rys. Z.7 pole transformatorowe od strony SN; rys. Z.10 pole odpływowe; rys. Z.11 specjalny wariant liniowy z rozliczeniem i napięciem zwrotnym. | Z.7, Z.10, Z.11 | ŹRÓDŁOWO POTWIERDZONE |

## 2. Rzeczywiste braki w kodzie (bez spekulowania o kompletności)

| ID | Przedmiot | Dowód w repozytorium | Ocena i wymagany skutek |
|---|---|---|---|
| GPZ-P0-01 | Topologia aparatu | `backend/src/enm/models.py` — `Bay.primary_devices` oraz `BayPrimaryDevice` zawierają rodzaj, stan i pozycję logiczną, lecz brak jawnej listy połączeń zacisk–zacisk każdego aparatu | **OTWARTE:** bez danych portów/połączeń nie wolno wywodzić ścieżki prądu z samej kolejności na planszy |
| GPZ-P0-02 | Sprzęgło dwucelkowe | `backend/src/application/station_templates/templates/gpz_110_sn.py` opisuje jeden `bus_coupler` utworzony z `sections_count=2`; `frontend/src/ui/sld/v2/domain/bayDeviceOrder.ts` ma pojedynczą politykę COUPLER | **OTWARTE:** potrzebny jawny wariant OEM i jeden tor między A/B rozpisany na dwie celki |
| GPZ-P0-03 | Pomiar napięcia | `frontend/src/ui/sld/v2/domain/bayDeviceOrder.ts` — `MEASUREMENT_ORDER` dopuszcza opcjonalny `FUSE` | **OTWARTE:** wariant standardu ENEA nie może automatycznie pokazywać wkładki bezpiecznikowej VT |
| GPZ-P0-04 | Stan łącznika | `frontend/src/ui/sld/v3/cad/CadSymbol.tsx` — `props.state ?? 'closed'` i znany wariant `unknown` z geometrią | **OTWARTE:** przy braku wiarygodnego stanu nie wolno rysować domyślnego „zamkniętego” ani trzeciej ramki, wymagana walidacja |
| GPZ-P0-05 | Lokalny walidator sekwencji | `frontend/src/ui/network-build/forms/switchingSequenceValidator.ts` — ocenia jedynie CB/DS/ES w jednym polu i nazywa stan „bezpieczna konserwacja” bez dowodu braku napięcia | **OTWARTE:** nie może być wykorzystany jako zgoda ruchowa; musi być bramka serwerowa nad pełną topologią, wyspami, źródłami zwrotnymi i wersją scenariusza |
| GPZ-P0-06 | Walidacja wizualna | `scripts/gpz_switchgear_guard.py` sprawdza obecność pięciu ciągów `data-testid` w pliku V2 | **OTWARTE:** nie dowodzi połączeń, CT/VT, geometrii ani działania na SldCanvasV3 |
| GPZ-P0-07 | Źródła symboli | PR #499 i #500 (stan 25.10.2026): oba niescalone; oryginalny import QET = 7 plików nN, katalog przeglądowy ≠ potwierdzona biblioteka GPZ | **OTWARTE:** źródłowa kwalifikacja wszystkich użytych symboli SN i geometria w istniejącym CAD |
| GPZ-P0-08 | Blokady nieustalonego położenia | `backend/src/enm/interlock_rules.py`, nowa gałąź `work/gpz-sn-p0-interlocks-20261025` | **POPRAWIONO KOD (NIE ODEBRANO):** `nieznany`, `awaria`, brak stanu skutkują `None` zamiast fałszywego `False`; testy jednostkowe i modelu odczytu dodane, CI do potwierdzenia |

## 3. Granica prawdziwego odbioru

Przed oceną gotowości do odbioru **muszą** istnieć łącznie: jawny schemat połączeń aparatów przez zaciski, macierz typów i wariantów OEM, implementacja na jedynym `SldCanvasV3`, operacje zmieniające ENM z oceną całej topologii (napięcie zwrotne OZE/wyspy/źródła), wyniki LF/SC ważne dla dokładnej rewizji scenariusza i przeglądarkowe E2E po kliknięciach użytkownika.

**Nie potwierdzono jeszcze:** pierwotnej grafiki miniSCADA z poprzedniego wątku, R5, dokumentacji konkretnego producenta dwucelkowego sprzęgła, uruchomienia prawdziwej aplikacji ani kompletnych testów CI. Zeszyt 1 ENEA jest źródłem podstawy stacji; nie rozstrzyga sam z siebie wszystkich wariantów OEM.

**Werdykt:** B-02 POZOSTAJE ODRZUCONE. Ten dokument jest rejestrem luk, nie przyjęciem ani specyfikacją zamiennego renderera.
