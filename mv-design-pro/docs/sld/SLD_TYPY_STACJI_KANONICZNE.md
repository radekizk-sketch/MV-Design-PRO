# SLD_TYPY_STACJI_KANONICZNE

Status: wiazacy dla aktywnego UI i aktywnego renderingu SLD.

Jedna regula rodzaju stacji (karta ETYKIETA-STACJI-PRZELOTOWEJ, 2026-09-30; kanon
`SLD_CAD_SPEC_V3.md` §19.3, decyzja V12K-034, Opcja A):
- backend: `backend/src/enm/rodzaj_stacji.py` (`rodzaje_stacji`, `rodzaj_stacji`,
  `rodzaj_ze_skladu_pol`) — walidator modelu (`W043`, `W044`), szablony stacji, gotowosc;
- frontend: `frontend/src/ui/shared/rodzajStacji.ts` — jedno lustro reguly, parytet z backendem
  przypiety testem `ui/shared/__tests__/rodzajStacji.parytet.test.ts` na kazdej stacji kazdego
  modelu z fikstur generowanych (plik oczekiwan wytwarza
  `backend/tests/reference_networks/rodzaj_stacji_parytet.py`).

Klasyfikacja widoczna dla uzytkownika:
- stacja koncowa,
- stacja przelotowa,
- stacja odgalezna,
- stacja sekcyjna.

Regula wyprowadzenia (wylacznie z jawnych danych modelu):
- pole sprzegla w rozdzielnicy SN => stacja sekcyjna;
- co najmniej 3 pola liniowe (wejsciowe, wyjsciowe, odgalezne) => stacja odgalezna;
- 2 pola liniowe => stacja przelotowa, gdy co najmniej dwa odcinki od szyn stacji prowadza do
  innej stacji; inaczej stacja koncowa (drugie pole wolne albo z wiszacym odcinkiem);
- 0-1 pole liniowe => stacja koncowa.
Pola potrzeb wlasnych, rezerwowe i odgromnikowe (rodzaj pola katalogowego `bay_kind`) nie sa
polami liniowymi, choc w katalogu maja role modelu `FEEDER`. Rodzaj nie dotyczy GPZ ani
wolnostojacej rozdzielnicy nN.

Deklaracja `Substation.station_type` sluzy WYLACZNIE walidacji: niezgodnosc z rodzajem
wyprowadzonym zglasza walidator (`W043` / `station.kind_mismatch`) z akcja naprawcza zmiany
deklaracji (`update_element_parameters`). Schemat, drzewo projektu, karty, wyszukiwarka,
inspektor, konfigurator, kreator i powierzchnie DER pokazuja rodzaj wyprowadzony.

Regula wiazaca:
- aktywne UI, SLD, formularze, karty i inspektory uzywaja wylacznie klasyfikacji topologicznej
  z jednej reguly powyzej,
- oznaczenia budowlane i techniczne nie moga wyciekac do warstwy uzytkownika,
- nazwa domyslna stacji nie niesie rodzaju (rodzaj zmienia sie z polami, nazwa nie).

Mapowanie techniczne:
- `terminal` -> stacja koncowa,
- `inline` -> stacja przelotowa,
- `branch` -> stacja odgalezna,
- `sectional` -> stacja sekcyjna.

Zakazy:
- nie wolno prezentowac uzytkownikowi typow `A/B/C/D`,
- nie wolno prezentowac uzytkownikowi typow budowlanych jako kanonicznych nazw stacji,
- nie wolno utrzymywac drugiej reguly rodzaju stacji (w rendererze, drzewie, karcie, adapterze)
  ani czytac deklaracji `station_type` jako rodzaju.
