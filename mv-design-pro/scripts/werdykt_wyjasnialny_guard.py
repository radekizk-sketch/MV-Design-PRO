#!/usr/bin/env python3
"""Strażnik kontraktu werdyktu wyjaśnialnego (kontrakt §12, plan AB O-36, karta AB-1a Pakiet E).

PO CO. Zasada stała właściciela (2026-09-22): status SPELNIA / NIE_SPELNIA / PASS / FAIL / OK
może istnieć wyłącznie jako enum maszynowy ZWIĄZANY z wyjaśnieniem (co oceniono, względem
czego, wynik, limit, margines, przyczyna, podstawa, dowód). Kontrakt
`docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md` §12 wymaga strażnika, który bada KONTRAKT
(typy, schematy, mapy), a nie tekst — nie poluje na słowo „spełnia", tylko na KSZTAŁT, w którym
lakoniczny werdykt może powstać albo dotrzeć do człowieka.

SZEŚĆ SPRAWDZEŃ (każde zwraca naruszenia z TOŻSAMOŚCIĄ, nie z numerem linii):

  1_backend — AST `backend/src/**`. Klasa modelu (pydantic `BaseModel`, `@dataclass`,
      `TypedDict`, `NamedTuple` — także przez dziedziczenie po klasie z drzewa) z polem werdyktu:
      (a) typ pola (po rozwinięciu `Optional`/`Union`/`Annotated`/kontenerów, aliasów typów
      i klas `Enum` z drzewa) niesie wartość ze słownika werdyktów; albo (b) nazwa pola pasuje do
      wzorca werdyktu (`WZORZEC_POLA_WERDYKTU`), a typ jest `bool`/`str`/`Literal`/`Enum`. Dla
      rodziny `status` (`status`, `status_*`, `overall_status`, `compatibility_status`) typ
      `Literal`/`Enum` jest naruszeniem TYLKO wtedy, gdy niesie wartość ze słownika (kontrakt
      §12 pkt 1: „`status` z wartościami ze słownika"), a `bool`/`str` — zawsze (wartości
      nieznane statycznie). Wyjątki: typ kanoniczny (`werdykt.kontrakt.OcenaKryterium`,
      `WynikWymagania`) i klasa z NIEOPCJONALNYM polem typu `werdykt.kontrakt.WyjasnienieWerdyktu`
      (własnym albo odziedziczonym). Tożsamość: `moduł:Klasa.pole`. Do tego funkcje o nazwach
      `is_*`, `*_gate`, `*_ok` zwracające parę `(bool, …)` (adnotacja `tuple[bool, X]` albo — bez
      adnotacji — `return (True|False, …)`): wzorzec #2 inwentarza. Tożsamość `moduł:funkcja()`.
  2_http — migawka OpenAPI `backend/schemas/openapi_snapshot.json`: schemat komponentu z
      właściwością, której enum (także przez `$ref`, `anyOf`/`oneOf`/`allOf`, `items`, `const`)
      niesie wartość ze słownika, musi mieć w TYM SAMYM schemacie właściwość WYMAGANĄ z `$ref`
      do `WyjasnienieWerdyktu` (także wariant `-Input`/`-Output`). Tożsamość:
      `openapi:Schemat.właściwość`.
  3_frontend — AST TypeScript (`typescript` z `frontend/node_modules`, uruchamiany `node`,
      każdy plik parsowany RAZ) po `frontend/src/**/*.ts(x)` bez testów (`__tests__`,
      `*.test.*`, `*.spec.*`, `src/test/`), `harness-fixtures` i deklaracji `.d.ts`:
      3a_frontend_mapa — literał obiektu albo `new Map([...])` z kluczem ze słownika werdyktów
      mapującym na tekst/kolor (literał tekstu, obiekt z tekstem, JSX; odwołanie — gdy map
      kluczy słownika jest co najmniej dwa albo wszystkie klucze są kodami WIELKIMI LITERAMI);
      mapa po semantyce (`pozytywna|negatywna|ostrzegawcza|neutralna`) jest dozwolona WYŁĄCZNIE
      w `ui2/wyniki/wzorzec/KartaWerdyktu.tsx`, mapa po statusie — nigdzie;
      3b_frontend_prog — porównanie `>`, `<`, `>=`, `<=` wartości z liczbą albo stałą (nazwa
      WIELKIMI LITERAMI, `const` z liczbą, parametr z domyślną stałą, pole stałego obiektu), którego
      wynik — przez `!`, `&&`, `||`, `??`, nawiasy i warunek `?:` — trafia do literału etykiety
      (`'ok'`, `'warning'`, `'error'`, słownik werdyktów …), do zmiennej/właściwości/atrybutu JSX/
      funkcji o nazwie klasy etykiety (`ok`, `werdykt`, `verdict`, `tone`, `severity`,
      `istotnosc`, `ostrzezenie`, `spelnia`, `naruszone` …) albo do gałęzi `if`, która zwraca lub
      przypisuje etykietę; moduł karty werdyktu jest z tego zwolniony (kontrakt §12 pkt 3).
      Tożsamość: `ścieżka:łańcuch.symboli` (nazwy deklaracji otaczających, bez numeru linii).
  4_dokumenty — renderery dokumentów formalnych: `application/analyses/*.py`,
      `application/reporting/**`, `analysis/reporting/**` ORAZ każdy moduł importujący `docx`
      albo `reportlab` (klasa „renderer DOCX/PDF", nie lista katalogów): literał `dict` z kluczem
      ze słownika werdyktów mapującym na tekst poza `werdykt/dokument.py` i `werdykt/etykiety.py`.
      Tekst = literał niebędący kodem maszynowym, f-napis albo stała modułu z takim tekstem;
      mapa status → kod (`PASS` → `SPELNIA`) i słownik liczników nie są mapą etykiet.
      Tożsamość: `moduł:łańcuch.symboli`.
  5_kod_w_tekscie — kod wyliczenia albo identyfikator maszynowy w TEKŚCIE DLA CZŁOWIEKA (karta
      AB-1a Pakiet D2, luka §5.1). Pole tekstowe = klucz `*_pl` albo lista tekstów wyjaśnienia
      (`czego_brakuje`, `zastrzezenia`). Kod = dopasowanie `WZORZEC_KODU_W_TEKSCIE`
      (`[A-Z]{3,}(_[A-Z]+)+` z karty, rozszerzone o segmenty z cyframi: `RFG_13_2`) albo słowo
      wersalikami z jednowyrazowych wartości osi STANU kontraktu (`NIEUSTALONE`, `PELNY`,
      `ZWALIDOWANE` — `kody_jednowyrazowe`, wyprowadzone z `werdykt.kontrakt`
      i `werdykt.proweniencja`). DWA korpusy, bo tekst powstaje na dwa sposoby:
      A) odpowiedzi POLICZONE backendem (`frontend/src/harness-fixtures/generated/*.json`,
         `scripts/eksport_fixtur_harnessu.py` — te same funkcje co trasy API): f-napisy
         i `.value` wyliczeń składane w czasie biegu; tożsamość
         `fixtura.json:ścieżka.klucza:KOD` (indeksy list jako `[]`);
      B) literały źródła `backend/src/**` zasilające pole tekstu (argument nazwany, klucz
         słownika, przypisanie): ścieżki, których żadna scena nie wywołuje; tożsamość
         `moduł:łańcuch.symboli:KOD`.
      Kod wyliczenia i identyfikator zostają w POLACH rekordu (`status_maszynowy`,
      `dowod.poziom`, `podstawa.status`, `wymaganie_id`…); zdanie niesie nazwę polską.
  6_werdykt_poza_rekordem — werdykt niesiony POZA typowanym rekordem (karta AB-1a Pakiet E2),
      w obu językach (AST Python `backend/src/**` i ten sam bieg AST TypeScript co 3), z
      pominięciem pakietu kontraktu `werdykt/` (generator tekstu, słownik etykiet, serializer
      — jedyne miejsca, w których status wolno zamieniać na tekst). Wartość obok pola
      `wyjasnienie` (rekordy K i W, kontrakt §4; `wyjasnienie: None` się nie liczy) jest
      dozwolona; wartość spoza słownika werdyktów — też:
      6a_ladunek_werdyktu — literał słownika (`{...}`, `dict(k=v)`, literał obiektu TS) z
          kluczem statusu/werdyktu (`klucz_werdyktu`: nazwa pola ze sprawdzenia 1 albo
          segment `status`/`werdykt`/`verdict`/`wynik`/`result`/`ocena`) i wartością znaną
          statycznie ze słownika werdyktów: literał, gałęzie `a if c else b` / `?:`, człony
          `or`/`and`/`??`, stała modułu (także importowana) i człon wyliczenia (`Werdykt.PASS`,
          `.value`; w TS nazwa WIELKIMI LITERAMI). Klucz będący sam wartością słownika
          (`{"SPELNIA": "pass"}`) to klucz MAPY (6c/3a/4). Tożsamość `moduł:łańcuch.klucz`.
      6b_tekst_werdyktu — tekst SKŁADANY (f-napis, konkatenacja `+`, `%`, `"…".format`,
          szablon TS, wstawka `{...}` w treści elementu JSX) z kodem werdyktu: w stałych
          częściach — słowo albo n-gram do trzech słów zapisany WERSALIKAMI
          (`kody_werdyktu_wersalikami`: `PASS`, `OK`, `SPEŁNIA`, `NIE SPEŁNIA`, `OUT OF RANGE`),
          we wstawce znanej statycznie — cały literał ze słownika (`'spełnia' if ok else …`).
          Proza pisana zwykłą czcionką („moduł spełnia wymaganie”) nie jest kodem — strażnik nie
          poluje na słowa. Komunikat dziennika (`logger.*`, `console.*`) nie jest wynikiem dla
          projektanta. Tożsamość `moduł:łańcuch:KOD`.
      6c_mapa_statusu — mapa „status → tekst” zapisana PRZEPŁYWEM STEROWANIA: `switch`/`match`,
          łańcuch `if`/`elif`/`else if` i ciąg kolejnych `if` o tym samym podmiocie porównania
          (`x == "PASS"`, `x === 'PASS'`, `x in (...)`, `||` porównań), łańcuch `?:` /
          `a if x == "P" else …`; w backendzie także literał słownika poza rendererami (te bada
          sprawdzenie 4). Wartość gałęzi = pierwszy bezpośredni `return X`, bez niego pierwsze
          przypisanie. Te same kryteria co mapa 3a/4 (tekst; w TS także odwołania przy dwóch
          kluczach słownika albo kluczach-kodach); nie jest mapą etykiet mapa, której wartości
          to rekordy z `wyjasnienie`, a w backendzie także tłumaczenie słownika na słownik
          (`SPELNIA` → `pass`: kod jednej wielkości liter ze słownika — jak mapa status → kod w
          sprawdzeniu 4; w interfejsie `'ok'` jest klasą tonu, więc tam się liczy). Mapa po semantyce koloru wolno istnieć WYŁĄCZNIE w module karty
          werdyktu (jak 3a); mapa po STATUSIE — nigdzie, także w katalogu wzorca
          `ui2/wyniki/wzorzec` (kontrakt §9: interfejs nie definiuje żadnej mapy „status →
          etykieta”; karta E2 §0 pkt 1 wyłączała katalog — pomiar pokazał w nim mapę statusu
          `SladSekcyjny.opisStatusu`, rodzina WW-1, więc wyłączenie ukryłoby żywe naruszenie).
          Tożsamość `moduł:łańcuch` węzła otwierającego mapę.

SŁOWNIK WERDYKTÓW. Wartości z karty (porównanie po normalizacji: małe litery, bez diakrytyków,
camelCase i spacje → `_`) domknięte na odmianę przymiotnikową (`zgodne`, `spelnione`,
`niespelniony` …) — wartości kanonu V12 i wzorców referencyjnych (`ZGODNE`/`NIEZGODNE`) mają
właśnie tę formę. `failed` jest werdyktem tylko w parze z `passed`: samo `FAILED` obok
`PENDING`/`RUNNING`/`DONE` to stan procesu (bieg się nie udał), nie wynik oceny. JEDNO ŹRÓDŁO:
wszystkie sprawdzenia (także program TypeScript i sprawdzenie 6) czytają ten sam zbiór
(`SLOWNIK_WERDYKTOW`, predykat `wartosci_werdyktowe`); rozstrzygające statusy kontraktu
(`werdykt.kontrakt.StatusWerdyktu` o semantyce pozytywnej/negatywnej w `werdykt.etykiety` —
`SPELNIA`, `NIE_SPELNIA`) należą do niego, co przypina samotest
`test_slownik_obejmuje_rozstrzygajace_statusy_kontraktu`.

LISTA DOZWOLONA I ZAPADKA (`werdykt_wyjasnialny_allowlist.json`, klucz = sprawdzenie +
tożsamość): naruszenie spoza listy = czerwony; wpis `MIGRACJA`, którego naruszenie ZNIKNĘŁO
z drzewa = czerwony („usuń wpis z listy — zapadka w dół", jak `mypy_ratchet_guard`); wpis
`ENUM_WEWNETRZNY` może trwać (z uzasadnieniem — pusty jest błędem listy). Licznik pozwalałby
zastąpić naprawione naruszenie nowym, a `plik:linia` dryfuje — dlatego tożsamości (przegląd #18).

TRYBY: domyślny (porównanie z listą); `--zmierz` wypisuje WSZYSTKIE naruszenia drzewa jako
kandydatów listy z propozycją klasy z inwentarza
`docs/audit/INWENTARZ_WERDYKTOW_LAKONICZNYCH_2026-09-23.md` (dopasowanie po pliku i symbolu);
`--zmierz --zapisz` zapisuje listę z pomiaru, zachowując klasę i uzasadnienie tożsamości już
obecnych na liście.

CZEGO NIE WYKRYWA (nazwane, żeby zieleń nie znaczyła więcej, niż znaczy — reguła KLASA pkt 4).
Strażnik bada KSZTAŁTY kontraktu z §12, nie każdą powierzchnię inwentarza: pomiar 2026-09-23 —
173 z 282 wierszy inwentarza nie ma żadnej tożsamości w swoich plikach. Poza zasięgiem:
miejsca RENDERUJĄCE mapę zdefiniowaną gdzie indziej (tożsamością jest mapa, nie jej
konsumenci), wstawka o wartości NIEZNANEJ statycznie w tekście składanym
(`f"Status: {wynik.status}"` — wartość przychodzi z biegu; kod w odpowiedzi policzonej łapie
korpus A sprawdzenia 5 tylko dla kodów z podkreśleniem i kodów osi stanu), wartość ładunku
z wywołania funkcji (`{"status": _status(x)}`), literał etykiety NIESKŁADANY (statyczny tekst
elementu JSX `<span>OK</span>`, atrybut JSX z `?:`) i słowo werdyktu pisane zwykłą czcionką
w prozie, porównania dwóch wartości nie-stałych w UI (`pst > pst_limit`), mapy
`status → liczba` (rangi — sortowanie jest dozwolonym użyciem statusu maszynowego, kontrakt §0),
mapa warunkowa z gałęzią głębszą niż bezpośredni `return`/przypisanie, pola modeli poza
czterema rodzajami klas modelu (np. ORM), aliasy typów spoza najwyższego poziomu modułu,
`TypedDict`/`NamedTuple` w składni funkcyjnej, kod Python poza `backend/src` i schematy
OpenAPI poza `components`.

KODY WYJŚCIA: 0 — zielony; 1 — naruszenia (nowe tożsamości albo wpisy do usunięcia);
2 — błąd środowiska (brak `node`, brak `typescript`, brak migawki, uszkodzona lista).
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import shutil
import subprocess
import sys
import time
import unicodedata
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass, field
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"
FRONTEND_SRC = PROJECT_ROOT / "frontend" / "src"
MIGAWKA_OPENAPI = PROJECT_ROOT / "backend" / "schemas" / "openapi_snapshot.json"
MODUL_TYPESCRIPT = PROJECT_ROOT / "frontend" / "node_modules" / "typescript"
LISTA_DOZWOLONA = Path(__file__).resolve().parent / "werdykt_wyjasnialny_allowlist.json"
INWENTARZ = PROJECT_ROOT / "docs" / "audit" / "INWENTARZ_WERDYKTOW_LAKONICZNYCH_2026-09-23.md"

#: Moduł karty werdyktu — jedyne miejsce mapy „semantyka → kolor" (kontrakt §9, §12 pkt 3).
#: Ścieżka jest składana z katalogu wzorca (istnieje w repozytorium) i nazwy pliku karty,
#: bo sam plik powstaje w Pakiecie D1 — `verification_phantom_paths_guard` sprawdza literały
#: ścieżek plików w skryptach weryfikacyjnych, a literał pliku, którego jeszcze nie ma, byłby
#: ścieżką widmową (CI czerwone na 022ef670). Semantyka bez zmian: DOKŁADNIE jeden plik.
KATALOG_WZORCA = "frontend/src/ui2/wyniki/wzorzec"
PLIK_KARTY = "KartaWerdyktu.tsx"
MODUL_KARTY = f"{KATALOG_WZORCA}/{PLIK_KARTY}"
#: Serializer rekordu do dokumentu i słownik etykiet — jedyne miejsca map status → tekst (§10).
MODULY_SERIALIZERA = frozenset({"werdykt.dokument", "werdykt.etykiety"})
#: Typy kanoniczne kontraktu (§1).
TYPY_KANONICZNE = frozenset({"werdykt.kontrakt.OcenaKryterium", "werdykt.kontrakt.WynikWymagania"})
TYP_WYJASNIENIA = "werdykt.kontrakt.WyjasnienieWerdyktu"

SPRAWDZENIA = (
    "1_backend",
    "2_http",
    "3a_frontend_mapa",
    "3b_frontend_prog",
    "4_dokumenty",
    "5_kod_w_tekscie",
    "6a_ladunek_werdyktu",
    "6b_tekst_werdyktu",
    "6c_mapa_statusu",
)
#: Pakiet implementacji kontraktu (generator tekstu `werdykt.wyjasnienie`, słownik etykiet
#: `werdykt.etykiety`, serializer `werdykt.dokument`) — JEDYNE miejsce, w którym status
#: werdyktu wolno zamieniać na tekst i składać w rekord (kontrakt §5, §9, §10); sprawdzenie 6
#: go pomija.
PAKIET_KONTRAKTU = "werdykt"
#: Klucz ładunku niosący status albo werdykt (6a): segment nazwy (po normalizacji) — obok
#: nazw pól werdyktu ze sprawdzenia 1 (`WZORZEC_POLA_WERDYKTU`).
WZORZEC_KLUCZA_WERDYKTU = re.compile(r"(^|_)(status|werdykt|verdict|wynik|result|ocena)(_|$)")
#: Pole rekordu wyjaśnienia obok werdyktu (`wyjasnienie` rekordów K i W, kontrakt §4).
WZORZEC_KLUCZA_WYJASNIENIA = re.compile(r"^wyjasnienie(_|$)")
#: Słowo tekstu (litery, cyfry, podkreślenia — `NIE_SPELNIA` to jedno słowo, `NIE SPEŁNIA`
#: dwa) i odstęp między słowami wielowyrazowego kodu werdyktu (`NIE SPEŁNIA`, `NON-COMPLIANT`).
_SLOWO = re.compile(r"\w+")
_ODSTEP_KODU = re.compile(r"[\s-]+")
#: Najdłuższy kod werdyktu w słowniku ma trzy słowa (`out_of_range`).
_MAKS_SLOW_KODU = 3
#: Komunikat dziennika (`logger.info(f"… OK")`) jest dla operatora, nie wynikiem dla
#: projektanta — tekst składany wprost jako argument metody dziennika nie jest naruszeniem 6b.
_METODY_LOGU = frozenset("debug info warning warn error exception critical log".split())
_NAZWA_LOGGERA = re.compile(r"(^|_)log(ger|ging)?$")
#: Postać kodu maszynowego: identyfikator jednej wielkości liter (`pass`, `no_data`, `SPELNIA`).
_POSTAC_KODU = re.compile(r"[a-z][a-z0-9_]*|[A-Z][A-Z0-9_]*")
#: Korpus sprawdzenia 5: odpowiedzi policzone backendem (fixtury harnessu).
KATALOG_FIXTUR = FRONTEND_SRC / "harness-fixtures" / "generated"
#: Kod wyliczenia / identyfikator maszynowy w tekście: WIELKIE LITERY z podkreśleniami
#: (`VALIDATED_SIMULATION`, `NIE_DOTYCZY`, `THD_U`, `RFG_13_2`, `ZASTANE_HVRT`).
WZORZEC_KODU_W_TEKSCIE = re.compile(r"\b[A-Z][A-Z0-9]{2,}(?:_[A-Z0-9]+)+\b")
#: Słowo WIELKIMI LITERAMI (kandydat na jednowyrazowy kod wyliczenia kontraktu).
WZORZEC_SLOWA_WIELKIMI = re.compile(r"\b[A-ZĄĆĘŁŃÓŚŹŻ]{3,}\b")
#: Listy tekstów wyjaśnienia bez sufiksu `_pl` (pola `WyjasnienieWerdyktu`).
KLUCZE_TEKSTU_BEZ_SUFIKSU = frozenset({"czego_brakuje", "zastrzezenia"})
#: Moduły, z których pochodzą jednowyrazowe kody wyliczeń (`kody_jednowyrazowe`).
MODUL_KONTRAKTU = "werdykt.kontrakt"
MODUL_PROWENIENCJI = "werdykt.proweniencja"
#: Skróty polszczyzny technicznej będące zarazem wartościami `RodzajPodstawy` — nie kod.
SKROTY_PROZY = frozenset({"OSD", "WOS"})
#: Aliasy osi STANU kontraktu werdyktu, których jednowyrazowe wartości (`NIEUSTALONE`,
#: `PELNY`, `ZWALIDOWANE`…) są kodem w tekście. Poza listą świadomie: metoda dowodu, rodzaj
#: podstawy, rodzaj skali, kroki reguły i dziedzina fizyki — ich jednowyrazowe wartości to
#: zwykłe rzeczowniki (`WYNIK`, `LIMIT`, `NORMA`, `POMIAR`), które proza pisze wersalikami
#: dla emfazy („WYNIK ROBOCZY"); kody z podkreśleniem tych wyliczeń łapie wzorzec.
ALIASY_OSI_STANU = (
    "StatusWerdyktu",
    "KompletnoscDowodu",
    "StanZrodla",
    "Relacja",
    "StatusModelu",
    "StanDanych",
    "PokrycieProgramu",
)
KLASY_LISTY = ("MIGRACJA", "ENUM_WEWNETRZNY")

#: Słownik werdyktów z karty AB-1a Pakiet E pkt A.1 (postać znormalizowana).
SLOWNIK_KARTY = frozenset(
    "spelnia nie_spelnia pass fail passed failed ok nok not_ok zgodny niezgodny stabilny "
    "niestabilny coordinated uncoordinated w_obwiedni poza_obwiednia in_range out_of_range "
    "compliant non_compliant eligible ineligible".split()
)
#: Domknięcie na odmianę przymiotnikową (rodzaj i liczba) — `ZGODNE`/`NIEZGODNE` wzorców
#: referencyjnych i `spelniony`/`niespelniony` analiz V12.6 to TE SAME werdykty.
ODMIANY = frozenset(
    "zgodne zgodna niezgodne niezgodna spelnione spelniony spelniona niespelnione niespelniony "
    "niespelniona nie_spelnione nie_spelniony nie_spelniona stabilne stabilna niestabilne "
    "niestabilna".split()
)
SLOWNIK_WERDYKTOW = SLOWNIK_KARTY | ODMIANY
#: Semantyka koloru etykiety (§9) — mapa po niej wolno istnieć wyłącznie w module karty.
SEMANTYKI = ("pozytywna", "negatywna", "ostrzegawcza", "neutralna")
#: Literały klasy etykiety w UI (3b): słownik bez `failed` (stan procesu) + klasy tonu.
LITERALY_ETYKIET = (SLOWNIK_WERDYKTOW - {"failed"}) | frozenset(
    "warning warn error critical danger success ostrzezenie blad naruszone naruszony naruszona "
    "naruszenie przekroczenie".split()
)
#: Tokeny nazw ujścia (3b): nazwa zmiennej/właściwości/funkcji niosącej klasę etykiety werdyktu.
#: `istotnosc`, `ton`, `ostrzezenie` to polskie odpowiedniki `severity`, `tone`, `warning`
#: używane w tym repozytorium (`istotnoscLom`, `tonWerdyktuSeverity`, komórka `ostrzezenie`).
NAZWY_UJSC = frozenset(
    "ok spelnia spelniony spelnione spelniona naruszone naruszony naruszona naruszenie werdykt "
    "verdict tone ton severity istotnosc ostrzezenie passed zgodny zgodne zgodna niezgodny "
    "niezgodne niezgodna".split()
)

WZORZEC_POLA_WERDYKTU = re.compile(
    r"^(spelnia|is_ok|is_adequate|is_weak|is_risk|passed|ok|verdict|werdykt|status|"
    r"overall_status|compatibility_status|stayed_connected)(_|$)"
    r"|(_ok|_passed|_verdict|_werdykt|_spelnia)$"
)
WZORZEC_RODZINY_STATUSU = re.compile(r"^(status|overall_status|compatibility_status)(_|$)")
WZORZEC_FUNKCJI_BRAMKI = re.compile(r"^is_|_gate$|_ok$")
WZORZEC_WYJASNIENIA_HTTP = re.compile(r"^WyjasnienieWerdyktu(-Input|-Output)?$")

_BAZY_MODELU = frozenset({"BaseModel", "RootModel", "TypedDict", "NamedTuple"})
_PAKIETY_BAZ_MODELU = ("pydantic", "typing", "typing_extensions")
_BAZY_ENUM = frozenset({"Enum", "StrEnum", "IntEnum", "Flag", "IntFlag"})
_KONTENERY = frozenset(
    "Optional Union list List tuple Tuple set Set frozenset FrozenSet Sequence MutableSequence "
    "Iterable Iterator Collection Final ClassVar".split()
)
_SLOWNIKI_TYPOW = frozenset({"dict", "Dict", "Mapping", "MutableMapping", "OrderedDict"})
_BIBLIOTEKI_DOKUMENTOW = frozenset({"docx", "reportlab"})


class BladSrodowiska(RuntimeError):
    """Sprawdzenie nie może się wykonać (brak narzędzia, pliku albo poprawnej listy)."""


@dataclass(frozen=True, order=True)
class Naruszenie:
    sprawdzenie: str
    tozsamosc: str
    plik: str
    linia: int
    opis: str
    #: Nazwy wiążące naruszenie z wierszem inwentarza (klasa, typ pola, mapa…) — nie tożsamość.
    symbole: tuple[str, ...] = field(default=(), compare=False)

    @property
    def klucz(self) -> tuple[str, str]:
        return (self.sprawdzenie, self.tozsamosc)


def normalizuj(tekst: str) -> str:
    """Postać porównawcza: camelCase → snake, bez diakrytyków, małe litery, separatory → `_`.

    Ta sama funkcja istnieje w programie TypeScript (`normalizuj` w `PROGRAM_TS`) — obie
    postaci pilnuje test `test_normalizacja_python_i_typescript_zgodne`.
    """
    tekst = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", tekst)
    tekst = tekst.replace("ł", "l").replace("Ł", "L")
    tekst = unicodedata.normalize("NFKD", tekst)
    tekst = "".join(znak for znak in tekst if not unicodedata.combining(znak)).lower()
    return re.sub(r"[^a-z0-9]+", "_", tekst).strip("_")


def wartosci_werdyktowe(wartosci: Iterable[str]) -> set[str]:
    """Znormalizowane wartości zbioru, które są werdyktami (reguła `failed` tylko z `passed`)."""
    znormalizowane = {normalizuj(w) for w in wartosci}
    trafione = znormalizowane & SLOWNIK_WERDYKTOW
    if "failed" in trafione and "passed" not in znormalizowane:
        trafione.discard("failed")
    return trafione


# ---------------------------------------------------------------------------
# Sprawdzenie 1 i 4 — indeks modułów backendu (AST)
# ---------------------------------------------------------------------------


@dataclass
class _Modul:
    nazwa: str
    sciezka: Path
    drzewo: ast.Module
    pakiet: str
    importy: dict[str, str]
    klasy: dict[str, ast.ClassDef]
    aliasy: dict[str, ast.expr]
    stale: dict[str, str]
    biblioteki: frozenset[str]


def _nazwa_modulu(sciezka: Path, korzen: Path) -> tuple[str, str]:
    czesci = list(sciezka.relative_to(korzen).with_suffix("").parts)
    if czesci[-1] == "__init__":
        czesci = czesci[:-1]
        return ".".join(czesci), ".".join(czesci)
    return ".".join(czesci), ".".join(czesci[:-1])


def _cel_importu(pakiet: str, wezel: ast.ImportFrom) -> str:
    if wezel.level == 0:
        return wezel.module or ""
    baza = pakiet.split(".") if pakiet else []
    if wezel.level > 1:
        baza = baza[: len(baza) - (wezel.level - 1)]
    if wezel.module:
        baza = [*baza, *wezel.module.split(".")]
    return ".".join(baza)


def _czy_alias_typu(wartosc: ast.expr) -> bool:
    if isinstance(wartosc, ast.Subscript):
        return True
    if isinstance(wartosc, ast.BinOp) and isinstance(wartosc.op, ast.BitOr):
        return True
    return False


def _wczytaj_modul(sciezka: Path, korzen: Path) -> _Modul | None:
    try:
        drzewo = ast.parse(sciezka.read_text(encoding="utf-8"), filename=str(sciezka))
    except FileNotFoundError:
        # Plik usunięty między listowaniem a odczytem (drzewo zmieniane równolegle).
        return None
    except (SyntaxError, UnicodeDecodeError) as blad:
        raise BladSrodowiska(f"nie da się sparsować {sciezka}: {blad}") from blad
    nazwa, pakiet = _nazwa_modulu(sciezka, korzen)
    importy: dict[str, str] = {}
    biblioteki: set[str] = set()
    for wezel in ast.walk(drzewo):
        if isinstance(wezel, ast.Import):
            for alias in wezel.names:
                biblioteki.add(alias.name.split(".")[0])
                if alias.asname:
                    importy[alias.asname] = alias.name
                else:
                    importy[alias.name.split(".")[0]] = alias.name.split(".")[0]
        elif isinstance(wezel, ast.ImportFrom):
            cel = _cel_importu(pakiet, wezel)
            if wezel.level == 0 and cel:
                biblioteki.add(cel.split(".")[0])
            for alias in wezel.names:
                if alias.name == "*":
                    continue
                importy[alias.asname or alias.name] = f"{cel}.{alias.name}" if cel else alias.name
    klasy: dict[str, ast.ClassDef] = {}
    aliasy: dict[str, ast.expr] = {}
    stale: dict[str, str] = {}
    for instrukcja in drzewo.body:
        if isinstance(instrukcja, ast.ClassDef):
            klasy[instrukcja.name] = instrukcja
        elif (
            isinstance(instrukcja, ast.Assign)
            and len(instrukcja.targets) == 1
            and isinstance(instrukcja.targets[0], ast.Name)
        ):
            cel_nazwa = instrukcja.targets[0].id
            if isinstance(instrukcja.value, ast.Constant) and isinstance(
                instrukcja.value.value, str
            ):
                stale[cel_nazwa] = instrukcja.value.value
            elif _czy_alias_typu(instrukcja.value):
                aliasy[cel_nazwa] = instrukcja.value
        elif (
            isinstance(instrukcja, ast.AnnAssign)
            and isinstance(instrukcja.target, ast.Name)
            and instrukcja.value is not None
        ):
            adnotacja = ast.unparse(instrukcja.annotation)
            if adnotacja.endswith("TypeAlias"):
                aliasy[instrukcja.target.id] = instrukcja.value
            elif isinstance(instrukcja.value, ast.Constant) and isinstance(
                instrukcja.value.value, str
            ):
                stale[instrukcja.target.id] = instrukcja.value.value
    return _Modul(
        nazwa=nazwa,
        sciezka=sciezka,
        drzewo=drzewo,
        pakiet=pakiet,
        importy=importy,
        klasy=klasy,
        aliasy=aliasy,
        stale=stale,
        biblioteki=frozenset(biblioteki),
    )


def _elementy(wycinek: ast.expr) -> list[ast.expr]:
    return list(wycinek.elts) if isinstance(wycinek, ast.Tuple) else [wycinek]


def _jako_wyrazenie(wezel: ast.expr) -> ast.expr | None:
    """Adnotacja w cudzysłowie → wyrażenie; inne węzły bez zmian."""
    if isinstance(wezel, ast.Constant) and isinstance(wezel.value, str):
        try:
            return ast.parse(wezel.value, mode="eval").body
        except SyntaxError:
            return None
    return wezel


class IndeksBackendu:
    """Moduły `backend/src` z rozwiązywaniem nazw przez importy (także re-eksporty)."""

    def __init__(self, korzen: Path) -> None:
        self.korzen = korzen
        self.moduly: dict[str, _Modul] = {}
        for sciezka in sorted(korzen.rglob("*.py")):
            if "__pycache__" in sciezka.parts:
                continue
            modul = _wczytaj_modul(sciezka, korzen)
            if modul is not None:
                self.moduly[modul.nazwa] = modul
        self._enum: dict[tuple[str, str], bool] = {}
        self._model: dict[tuple[str, str], bool] = {}

    # -- nazwy -----------------------------------------------------------------

    def rozwiaz_symbol(self, modul: str, nazwa: str, glebokosc: int = 0) -> tuple[str, str] | None:
        info = self.moduly.get(modul)
        if info is None or glebokosc > 10:
            return None
        if nazwa in info.klasy or nazwa in info.aliasy:
            return (modul, nazwa)
        cel = info.importy.get(nazwa)
        if cel is None:
            return None
        modul_celu, _, symbol = cel.rpartition(".")
        if modul_celu in self.moduly:
            return self.rozwiaz_symbol(modul_celu, symbol, glebokosc + 1)
        return None

    def kwalifikuj(self, modul: str, wyrazenie: ast.expr) -> str:
        """Pełna nazwa kropkowa symbolu (moduł drzewa albo cel importu zewnętrznego)."""
        info = self.moduly.get(modul)
        if isinstance(wyrazenie, ast.Name):
            if info is None:
                return wyrazenie.id
            rozwiazany = self.rozwiaz_symbol(modul, wyrazenie.id)
            if rozwiazany is not None:
                return f"{rozwiazany[0]}.{rozwiazany[1]}"
            return info.importy.get(wyrazenie.id, wyrazenie.id)
        if isinstance(wyrazenie, ast.Attribute):
            baza = self.kwalifikuj(modul, wyrazenie.value)
            if baza in self.moduly:
                rozwiazany = self.rozwiaz_symbol(baza, wyrazenie.attr)
                if rozwiazany is not None:
                    return f"{rozwiazany[0]}.{rozwiazany[1]}"
            return f"{baza}.{wyrazenie.attr}"
        if isinstance(wyrazenie, ast.Subscript):
            return self.kwalifikuj(modul, wyrazenie.value)
        if isinstance(wyrazenie, ast.Call):
            return self.kwalifikuj(modul, wyrazenie.func)
        return ""

    def _klasa(self, pelna: str) -> tuple[str, ast.ClassDef] | None:
        modul, _, nazwa = pelna.rpartition(".")
        info = self.moduly.get(modul)
        if info is not None and nazwa in info.klasy:
            return modul, info.klasy[nazwa]
        return None

    # -- rodzaje klas ------------------------------------------------------------

    def jest_enum(self, modul: str, klasa: ast.ClassDef, glebokosc: int = 0) -> bool:
        klucz = (modul, klasa.name)
        if klucz in self._enum:
            return self._enum[klucz]
        wynik = False
        if glebokosc < 10:
            for baza in klasa.bases:
                pelna = self.kwalifikuj(modul, baza)
                czesci = pelna.rsplit(".", 1)
                if czesci[-1] in _BAZY_ENUM and (len(czesci) == 1 or czesci[0] == "enum"):
                    wynik = True
                    break
                wewnetrzna = self._klasa(pelna)
                if wewnetrzna is not None and self.jest_enum(*wewnetrzna, glebokosc + 1):
                    wynik = True
                    break
        self._enum[klucz] = wynik
        return wynik

    def jest_model(self, modul: str, klasa: ast.ClassDef, glebokosc: int = 0) -> bool:
        klucz = (modul, f"{klasa.name}@{klasa.lineno}")
        if klucz in self._model:
            return self._model[klucz]
        wynik = False
        for dekorator in klasa.decorator_list:
            if self.kwalifikuj(modul, dekorator).rsplit(".", 1)[-1] == "dataclass":
                wynik = True
        if not wynik and glebokosc < 10:
            for baza in klasa.bases:
                pelna = self.kwalifikuj(modul, baza)
                czesci = pelna.rsplit(".", 1)
                if czesci[-1] in _BAZY_MODELU and (
                    len(czesci) == 1 or czesci[0].split(".")[0] in _PAKIETY_BAZ_MODELU
                ):
                    wynik = True
                    break
                wewnetrzna = self._klasa(pelna)
                if wewnetrzna is not None and self.jest_model(*wewnetrzna, glebokosc + 1):
                    wynik = True
                    break
        self._model[klucz] = wynik
        return wynik

    def wartosci_enum(self, klasa: ast.ClassDef) -> set[str]:
        wartosci: set[str] = set()
        for instrukcja in klasa.body:
            if not isinstance(instrukcja, ast.Assign):
                continue
            for cel in instrukcja.targets:
                if isinstance(cel, ast.Name) and not cel.id.startswith("_"):
                    wartosci.add(cel.id)
            if isinstance(instrukcja.value, ast.Constant) and isinstance(
                instrukcja.value.value, str
            ):
                wartosci.add(instrukcja.value.value)
        return wartosci

    # -- typy ------------------------------------------------------------------

    def _rozwiaz_typ(self, modul: str, wyrazenie: ast.expr) -> tuple[str, str, str] | None:
        """(moduł, nazwa, rodzaj ∈ {alias, enum, klasa}) dla nazwy typu z drzewa."""
        pelna = self.kwalifikuj(modul, wyrazenie)
        modul_celu, _, nazwa = pelna.rpartition(".")
        info = self.moduly.get(modul_celu)
        if info is None:
            return None
        if nazwa in info.aliasy:
            return (modul_celu, nazwa, "alias")
        if nazwa in info.klasy:
            rodzaj = "enum" if self.jest_enum(modul_celu, info.klasy[nazwa]) else "klasa"
            return (modul_celu, nazwa, rodzaj)
        return None

    def wartosci_typu(self, modul: str, wyrazenie: ast.expr | None, glebokosc: int = 0) -> set[str]:
        """Wszystkie wartości literalne/enum osiągalne z adnotacji (unie, kontenery, aliasy)."""
        if wyrazenie is None or glebokosc > 12:
            return set()
        wyrazenie = _jako_wyrazenie(wyrazenie)
        if wyrazenie is None:
            return set()
        if isinstance(wyrazenie, ast.BinOp) and isinstance(wyrazenie.op, ast.BitOr):
            return self.wartosci_typu(modul, wyrazenie.left, glebokosc + 1) | self.wartosci_typu(
                modul, wyrazenie.right, glebokosc + 1
            )
        if isinstance(wyrazenie, ast.Subscript):
            glowa = self.kwalifikuj(modul, wyrazenie.value).rsplit(".", 1)[-1]
            elementy = _elementy(wyrazenie.slice)
            if glowa == "Literal":
                wynik: set[str] = set()
                for element in elementy:
                    if isinstance(element, ast.Constant) and isinstance(element.value, str):
                        wynik.add(element.value)
                    elif isinstance(element, ast.Attribute):
                        wynik.add(element.attr)
                    else:
                        wynik |= self.wartosci_typu(modul, element, glebokosc + 1)
                return wynik
            if glowa == "Annotated":
                return self.wartosci_typu(modul, elementy[0], glebokosc + 1)
            if glowa in _SLOWNIKI_TYPOW:
                return self.wartosci_typu(modul, elementy[-1], glebokosc + 1)
            if glowa in _KONTENERY:
                wynik = set()
                for element in elementy:
                    wynik |= self.wartosci_typu(modul, element, glebokosc + 1)
                return wynik
            return set()
        if isinstance(wyrazenie, ast.Name | ast.Attribute):
            cel = self._rozwiaz_typ(modul, wyrazenie)
            if cel is None:
                return set()
            modul_celu, nazwa, rodzaj = cel
            info = self.moduly[modul_celu]
            if rodzaj == "alias":
                return self.wartosci_typu(modul_celu, info.aliasy[nazwa], glebokosc + 1)
            if rodzaj == "enum":
                return self.wartosci_enum(info.klasy[nazwa])
        return set()

    def rodzaje_typu(self, modul: str, wyrazenie: ast.expr | None, glebokosc: int = 0) -> set[str]:
        """Rodzaje liści adnotacji: bool, str, literal, enum, none, inne (bez kontenerów)."""
        if wyrazenie is None or glebokosc > 12:
            return {"inne"}
        wyrazenie = _jako_wyrazenie(wyrazenie)
        if wyrazenie is None:
            return {"inne"}
        if isinstance(wyrazenie, ast.Constant) and wyrazenie.value is None:
            return {"none"}
        if isinstance(wyrazenie, ast.BinOp) and isinstance(wyrazenie.op, ast.BitOr):
            return self.rodzaje_typu(modul, wyrazenie.left, glebokosc + 1) | self.rodzaje_typu(
                modul, wyrazenie.right, glebokosc + 1
            )
        if isinstance(wyrazenie, ast.Subscript):
            glowa = self.kwalifikuj(modul, wyrazenie.value).rsplit(".", 1)[-1]
            elementy = _elementy(wyrazenie.slice)
            if glowa == "Literal":
                return {"literal"}
            if glowa in ("Annotated", "Final"):
                return self.rodzaje_typu(modul, elementy[0], glebokosc + 1)
            if glowa in ("Optional", "Union"):
                wynik: set[str] = {"none"} if glowa == "Optional" else set()
                for element in elementy:
                    wynik |= self.rodzaje_typu(modul, element, glebokosc + 1)
                return wynik
            return {"inne"}
        if isinstance(wyrazenie, ast.Name | ast.Attribute):
            pelna = self.kwalifikuj(modul, wyrazenie)
            if pelna in ("bool", "str", "builtins.bool", "builtins.str"):
                return {pelna.rsplit(".", 1)[-1]}
            cel = self._rozwiaz_typ(modul, wyrazenie)
            if cel is not None:
                modul_celu, nazwa, rodzaj = cel
                if rodzaj == "alias":
                    return self.rodzaje_typu(
                        modul_celu, self.moduly[modul_celu].aliasy[nazwa], glebokosc + 1
                    )
                if rodzaj == "enum":
                    return {"enum"}
        return {"inne"}

    def jest_wyjasnieniem(self, modul: str, adnotacja: ast.expr) -> bool:
        """Adnotacja = NIEOPCJONALNE `werdykt.kontrakt.WyjasnienieWerdyktu` (po `Annotated`)."""
        wyrazenie = _jako_wyrazenie(adnotacja)
        while isinstance(wyrazenie, ast.Subscript) and self.kwalifikuj(
            modul, wyrazenie.value
        ).rsplit(".", 1)[-1] in ("Annotated", "Final"):
            wyrazenie = _elementy(wyrazenie.slice)[0]
        if not isinstance(wyrazenie, ast.Name | ast.Attribute):
            return False
        return self.kwalifikuj(modul, wyrazenie) == TYP_WYJASNIENIA

    def pola(self, modul: str, klasa: ast.ClassDef) -> Iterator[ast.AnnAssign]:
        for instrukcja in klasa.body:
            if isinstance(instrukcja, ast.AnnAssign) and isinstance(instrukcja.target, ast.Name):
                glowa = instrukcja.annotation
                if isinstance(glowa, ast.Subscript):
                    glowa = glowa.value
                if self.kwalifikuj(modul, glowa).rsplit(".", 1)[-1] == "ClassVar":
                    continue
                yield instrukcja

    def ma_wyjasnienie(self, modul: str, klasa: ast.ClassDef, glebokosc: int = 0) -> bool:
        if any(self.jest_wyjasnieniem(modul, pole.annotation) for pole in self.pola(modul, klasa)):
            return True
        if glebokosc > 10:
            return False
        for baza in klasa.bases:
            wewnetrzna = self._klasa(self.kwalifikuj(modul, baza))
            if wewnetrzna is not None and self.ma_wyjasnienie(*wewnetrzna, glebokosc + 1):
                return True
        return False


def _klasy_z_nazwami(drzewo: ast.AST, prefiks: str = "") -> Iterator[tuple[str, ast.ClassDef]]:
    for wezel in ast.iter_child_nodes(drzewo):
        if isinstance(wezel, ast.ClassDef):
            nazwa = f"{prefiks}{wezel.name}"
            yield nazwa, wezel
            yield from _klasy_z_nazwami(wezel, f"{nazwa}.")
        elif isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef):
            yield from _klasy_z_nazwami(wezel, f"{prefiks}{wezel.name}.")
        else:
            yield from _klasy_z_nazwami(wezel, prefiks)


def _funkcje_z_nazwami(
    drzewo: ast.AST, prefiks: str = ""
) -> Iterator[tuple[str, ast.FunctionDef | ast.AsyncFunctionDef]]:
    for wezel in ast.iter_child_nodes(drzewo):
        if isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef):
            nazwa = f"{prefiks}{wezel.name}"
            yield nazwa, wezel
            yield from _funkcje_z_nazwami(wezel, f"{nazwa}.")
        elif isinstance(wezel, ast.ClassDef):
            yield from _funkcje_z_nazwami(wezel, f"{prefiks}{wezel.name}.")
        else:
            yield from _funkcje_z_nazwami(wezel, prefiks)


def _zwroty_wlasne(funkcja: ast.AST) -> Iterator[ast.Return]:
    for wezel in ast.iter_child_nodes(funkcja):
        if isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef | ast.Lambda | ast.ClassDef):
            continue
        if isinstance(wezel, ast.Return):
            yield wezel
        yield from _zwroty_wlasne(wezel)


def _zwraca_pare_bool(indeks: IndeksBackendu, modul: str, funkcja: ast.AST) -> bool:
    assert isinstance(funkcja, ast.FunctionDef | ast.AsyncFunctionDef)
    if funkcja.returns is not None:
        adnotacja = _jako_wyrazenie(funkcja.returns)
        if not isinstance(adnotacja, ast.Subscript):
            return False
        if indeks.kwalifikuj(modul, adnotacja.value).rsplit(".", 1)[-1] not in ("tuple", "Tuple"):
            return False
        elementy = _elementy(adnotacja.slice)
        return (
            len(elementy) == 2
            and isinstance(elementy[0], ast.Name)
            and indeks.kwalifikuj(modul, elementy[0]) in ("bool", "builtins.bool")
        )
    for zwrot in _zwroty_wlasne(funkcja):
        wartosc = zwrot.value
        if (
            isinstance(wartosc, ast.Tuple)
            and len(wartosc.elts) == 2
            and isinstance(wartosc.elts[0], ast.Constant)
            and isinstance(wartosc.elts[0].value, bool)
        ):
            return True
    return False


def _sciezka_wzgledna(sciezka: Path) -> str:
    try:
        return sciezka.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return sciezka.as_posix()


def _plik_backendu(info: _Modul, korzen: Path) -> str:
    """Ścieżka pliku w postaci `backend/src/…` niezależnie od położenia drzewa (testy)."""
    return "backend/src/" + info.sciezka.relative_to(korzen).as_posix()


def sprawdz_backend(indeks: IndeksBackendu) -> list[Naruszenie]:
    """Sprawdzenie 1: pola werdyktu w klasach modeli i funkcje-bramki `(bool, …)`."""
    naruszenia: list[Naruszenie] = []
    for modul, info in sorted(indeks.moduly.items()):
        plik = _plik_backendu(info, indeks.korzen)
        for nazwa_klasy, klasa in _klasy_z_nazwami(info.drzewo):
            if not indeks.jest_model(modul, klasa):
                continue
            if f"{modul}.{nazwa_klasy}" in TYPY_KANONICZNE or indeks.ma_wyjasnienie(modul, klasa):
                continue
            for pole in indeks.pola(modul, klasa):
                assert isinstance(pole.target, ast.Name)
                nazwa_pola = pole.target.id
                wartosci = wartosci_werdyktowe(indeks.wartosci_typu(modul, pole.annotation))
                rodzaje = indeks.rodzaje_typu(modul, pole.annotation) - {"none"}
                nazwa_norm = normalizuj(nazwa_pola)
                powod = None
                if wartosci:
                    powod = "typ pola niesie wartości słownika werdyktów: " + ", ".join(
                        sorted(wartosci)
                    )
                elif WZORZEC_POLA_WERDYKTU.search(nazwa_norm):
                    if WZORZEC_RODZINY_STATUSU.search(nazwa_norm):
                        if rodzaje & {"bool", "str"}:
                            powod = (
                                "pole rodziny `status` typu bool/str (wartości nieznane statycznie)"
                            )
                    elif rodzaje & {"bool", "str", "literal", "enum"}:
                        powod = "nazwa pola werdyktu przy typie " + "/".join(sorted(rodzaje))
                if powod is not None:
                    naruszenia.append(
                        Naruszenie(
                            "1_backend",
                            f"{modul}:{nazwa_klasy}.{nazwa_pola}",
                            plik,
                            pole.lineno,
                            powod + " — brak pola `WyjasnienieWerdyktu` w rekordzie",
                            (
                                *nazwa_klasy.split("."),
                                *_nazwy_w_adnotacji(pole.annotation),
                                nazwa_pola,
                            ),
                        )
                    )
        for nazwa_funkcji, funkcja in _funkcje_z_nazwami(info.drzewo):
            if not WZORZEC_FUNKCJI_BRAMKI.search(funkcja.name):
                continue
            if _zwraca_pare_bool(indeks, modul, funkcja):
                naruszenia.append(
                    Naruszenie(
                        "1_backend",
                        f"{modul}:{nazwa_funkcji}()",
                        plik,
                        funkcja.lineno,
                        "funkcja-bramka zwraca parę (bool, …) — werdykt bez rekordu wyjaśnienia",
                        tuple(nazwa_funkcji.split(".")),
                    )
                )
    return naruszenia


def _nazwy_w_adnotacji(adnotacja: ast.expr) -> tuple[str, ...]:
    wyrazenie = _jako_wyrazenie(adnotacja)
    if wyrazenie is None:
        return ()
    nazwy: list[str] = []
    for wezel in ast.walk(wyrazenie):
        if isinstance(wezel, ast.Name):
            nazwy.append(wezel.id)
        elif isinstance(wezel, ast.Attribute):
            nazwy.append(wezel.attr)
    return tuple(nazwy)


# ---------------------------------------------------------------------------
# Sprawdzenie 4 — renderery dokumentów formalnych
# ---------------------------------------------------------------------------


def _jest_rendererem(info: _Modul, korzen: Path) -> bool:
    if info.nazwa in MODULY_SERIALIZERA:
        return False
    wzgledna = info.sciezka.relative_to(korzen).as_posix()
    czesci = wzgledna.split("/")
    if len(czesci) == 3 and czesci[0] == "application" and czesci[1] == "analyses":
        return True
    if wzgledna.startswith(("application/reporting/", "analysis/reporting/")):
        return True
    return bool(info.biblioteki & _BIBLIOTEKI_DOKUMENTOW)


def _tekst_klucza_py(info: _Modul, klucz: ast.expr | None) -> str | None:
    if isinstance(klucz, ast.Constant) and isinstance(klucz.value, str):
        return klucz.value
    if isinstance(klucz, ast.Attribute):
        return klucz.attr
    if isinstance(klucz, ast.Name):
        return info.stale.get(klucz.id, klucz.id)
    return None


#: Kod maszynowy (`SPELNIA`, `PASS`) — mapa status → kod to tłumaczenie statusów, nie etykieta.
_KOD_MASZYNOWY = re.compile(r"^[A-Z][A-Z0-9_]*$")


def _ma_tekst(info: _Modul, wartosc: ast.expr) -> bool:
    """Wartość mapy jest tekstem dla człowieka: literał (nie kod), f-napis, stała modułu z tekstem
    albo słownik z takim tekstem (rekord etykiety/stylu). Zmienna lokalna (licznik) — nie."""
    if isinstance(wartosc, ast.Constant) and isinstance(wartosc.value, str):
        return not _KOD_MASZYNOWY.match(wartosc.value)
    if isinstance(wartosc, ast.JoinedStr):
        return True
    if isinstance(wartosc, ast.Name) and wartosc.id in info.stale:
        return not _KOD_MASZYNOWY.match(info.stale[wartosc.id])
    if isinstance(wartosc, ast.Dict):
        return any(_ma_tekst(info, v) for v in wartosc.values)
    return False


def _rodzice(drzewo: ast.AST) -> dict[int, ast.AST]:
    rodzice: dict[int, ast.AST] = {}
    for wezel in ast.walk(drzewo):
        for dziecko in ast.iter_child_nodes(wezel):
            rodzice[id(dziecko)] = wezel
    return rodzice


def _lancuch_py(wezel: ast.AST, rodzice: dict[int, ast.AST], info: _Modul) -> str:
    czesci: list[str] = []
    dziecko: ast.AST = wezel
    rodzic = rodzice.get(id(wezel))
    while rodzic is not None:
        if isinstance(rodzic, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef):
            czesci.append(rodzic.name)
        elif isinstance(rodzic, ast.Assign) and dziecko is rodzic.value:
            cel = rodzic.targets[0]
            czesci.append(ast.unparse(cel) if not isinstance(cel, ast.Name) else cel.id)
        elif isinstance(rodzic, ast.AnnAssign) and dziecko is rodzic.value:
            czesci.append(ast.unparse(rodzic.target))
        elif isinstance(rodzic, ast.keyword) and rodzic.arg:
            czesci.append(rodzic.arg)
        elif isinstance(rodzic, ast.Dict):
            for klucz, wartosc in zip(rodzic.keys, rodzic.values, strict=True):
                if wartosc is dziecko:
                    tekst = _tekst_klucza_py(info, klucz)
                    if tekst is not None:
                        czesci.append(tekst)
        dziecko = rodzic
        rodzic = rodzice.get(id(rodzic))
    return ".".join(reversed(czesci)) or "<modul>"


def sprawdz_dokumenty(indeks: IndeksBackendu) -> list[Naruszenie]:
    """Sprawdzenie 4: mapy status → tekst w rendererach DOCX/PDF poza serializerem rekordu."""
    naruszenia: list[Naruszenie] = []
    for modul, info in sorted(indeks.moduly.items()):
        if not _jest_rendererem(info, indeks.korzen):
            continue
        rodzice = _rodzice(info.drzewo)
        for wezel in ast.walk(info.drzewo):
            if not isinstance(wezel, ast.Dict):
                continue
            wpisy = [
                (tekst, wartosc)
                for klucz, wartosc in zip(wezel.keys, wezel.values, strict=True)
                if (tekst := _tekst_klucza_py(info, klucz)) is not None
            ]
            trafione = wartosci_werdyktowe(tekst for tekst, _ in wpisy)
            if not trafione:
                continue
            wartosci = [w for tekst, w in wpisy if normalizuj(tekst) in trafione]
            if not all(_ma_tekst(info, w) for w in wartosci):
                continue
            lancuch = _lancuch_py(wezel, rodzice, info)
            naruszenia.append(
                Naruszenie(
                    "4_dokumenty",
                    f"{modul}:{lancuch}",
                    _plik_backendu(info, indeks.korzen),
                    wezel.lineno,
                    "mapa status → tekst w rendererze dokumentu (klucze: "
                    + ", ".join(sorted(trafione))
                    + ") poza serializerem rekordu",
                    tuple(lancuch.split(".")),
                )
            )
    return naruszenia


# ---------------------------------------------------------------------------
# Sprawdzenie 2 — kontrakt HTTP (migawka OpenAPI)
# ---------------------------------------------------------------------------


def _wartosci_schematu(schemat: object, komponenty: dict, odwiedzone: frozenset[str]) -> set[str]:
    if not isinstance(schemat, dict):
        return set()
    wynik: set[str] = set()
    for wartosc in schemat.get("enum", []) or []:
        if isinstance(wartosc, str):
            wynik.add(wartosc)
    if isinstance(schemat.get("const"), str):
        wynik.add(schemat["const"])
    odwolanie = schemat.get("$ref")
    if isinstance(odwolanie, str) and odwolanie.startswith("#/components/schemas/"):
        nazwa = odwolanie.rsplit("/", 1)[-1]
        if nazwa not in odwiedzone and nazwa in komponenty:
            docelowy = komponenty[nazwa]
            # Tylko schemat-enum (nie obiekt z właściwościami — ten ocenia się osobno).
            if isinstance(docelowy, dict) and "properties" not in docelowy:
                wynik |= _wartosci_schematu(docelowy, komponenty, odwiedzone | {nazwa})
    for klucz in ("anyOf", "oneOf", "allOf"):
        for element in schemat.get(klucz, []) or []:
            wynik |= _wartosci_schematu(element, komponenty, odwiedzone)
    if "items" in schemat:
        wynik |= _wartosci_schematu(schemat["items"], komponenty, odwiedzone)
    return wynik


def _jest_odwolaniem_do_wyjasnienia(schemat: object) -> bool:
    """`$ref` do `WyjasnienieWerdyktu` wprost albo przez `allOf` — bez alternatywy `null`."""
    if not isinstance(schemat, dict):
        return False
    odwolanie = schemat.get("$ref")
    if isinstance(odwolanie, str):
        return bool(WZORZEC_WYJASNIENIA_HTTP.match(odwolanie.rsplit("/", 1)[-1]))
    elementy = schemat.get("allOf") or []
    return len(elementy) == 1 and _jest_odwolaniem_do_wyjasnienia(elementy[0])


def sprawdz_http(sciezka: Path) -> list[Naruszenie]:
    """Sprawdzenie 2: właściwość-enum werdyktu bez wymaganego `$ref` do wyjaśnienia."""
    if not sciezka.is_file():
        raise BladSrodowiska(f"brak migawki OpenAPI: {sciezka}")
    try:
        dane = json.loads(sciezka.read_text(encoding="utf-8"))
    except json.JSONDecodeError as blad:
        raise BladSrodowiska(f"migawka OpenAPI nie jest poprawnym JSON: {blad}") from blad
    komponenty = dane.get("components", {}).get("schemas", {})
    if not isinstance(komponenty, dict):
        raise BladSrodowiska("migawka OpenAPI bez `components.schemas`")
    naruszenia: list[Naruszenie] = []
    plik = _sciezka_wzgledna(sciezka)
    for nazwa, schemat in sorted(komponenty.items()):
        wlasciwosci = schemat.get("properties") if isinstance(schemat, dict) else None
        if not isinstance(wlasciwosci, dict):
            continue
        wymagane = set(schemat.get("required", []) or [])
        ma_wyjasnienie = any(
            wlasnosc in wymagane and _jest_odwolaniem_do_wyjasnienia(definicja)
            for wlasnosc, definicja in wlasciwosci.items()
        )
        if ma_wyjasnienie:
            continue
        for wlasnosc, definicja in sorted(wlasciwosci.items()):
            trafione = wartosci_werdyktowe(
                _wartosci_schematu(definicja, komponenty, frozenset({nazwa}))
            )
            if trafione:
                naruszenia.append(
                    Naruszenie(
                        "2_http",
                        f"openapi:{nazwa}.{wlasnosc}",
                        plik,
                        0,
                        "właściwość-enum werdyktu ("
                        + ", ".join(sorted(trafione))
                        + ") bez wymaganego `$ref` do `WyjasnienieWerdyktu` w tym samym schemacie",
                        (nazwa, wlasnosc),
                    )
                )
    return naruszenia


# ---------------------------------------------------------------------------
# Sprawdzenie 3 — frontend (AST TypeScript przez `node`)
# ---------------------------------------------------------------------------

#: Program analizy AST TypeScript. Wejście (stdin, JSON): pliki i słowniki z tego modułu; wyjście
#: (stdout, JSON): lista trafień {rodzaj, plik, symbol, linia, opis}. Argument: ścieżka do
#: pakietu `typescript`. Jeden `ts.createSourceFile` na plik, jeden przebieg drzewa.
PROGRAM_TS = r"""
'use strict';
const fs = require('fs');
const ts = require(process.argv[1]);
const we = JSON.parse(fs.readFileSync(0, 'utf8'));
const SLOWNIK = new Set(we.slownik);
const SEMANTYKI = new Set(we.semantyki);
const LITERALY_ETYKIET = new Set(we.literaly_etykiet);
const NAZWY_UJSC = new Set(we.nazwy_ujsc);
const PORZADKI = new Set([ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken, ts.SyntaxKind.LessThanEqualsToken]);
const LOGICZNE = new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken]);
const STALA = /^[A-Z][A-Z0-9_]*[A-Z0-9]$/;
const KOD = /^[A-Z][A-Z0-9_]*$/;
// Sprawdzenie 6: wzorce przekazane z Pythona (JEDNO źródło — te same stałe co w module).
const WZ_KLUCZA = new RegExp(we.wzorzec_klucza || '(?!)');
const WZ_POLA = new RegExp(we.wzorzec_pola || '(?!)');
const WZ_WYJASNIENIA = new RegExp(we.wzorzec_wyjasnienia || '(?!)');
const MAKS_SLOW = we.maks_slow_kodu || 1;

function normalizuj(t) {
  return t.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
if (we.tylko_normalizacja) {
  process.stdout.write(JSON.stringify(we.teksty.map(normalizuj)));
  process.exit(0);
}
if (we.tylko_kody) {
  process.stdout.write(JSON.stringify(we.teksty.map(kodyWersalikami)));
  process.exit(0);
}
function werdyktowe(klucze) {
  const znorm = new Set(klucze.map(normalizuj));
  const wynik = new Set([...znorm].filter((k) => SLOWNIK.has(k)));
  if (wynik.has('failed') && !znorm.has('passed')) wynik.delete('failed');
  return wynik;
}
function tekstKlucza(n) {
  if (!n) return null;
  if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isComputedPropertyName(n)) {
    const e = n.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    if (ts.isPropertyAccessExpression(e)) return e.name.text;
  }
  return null;
}
function nazwaWezla(n) {
  if (ts.isVariableDeclaration(n) || ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) ||
      ts.isMethodDeclaration(n) || ts.isPropertyDeclaration(n) || ts.isPropertyAssignment(n) ||
      ts.isFunctionExpression(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n) ||
      ts.isJsxAttribute(n)) {
    if (!n.name) return (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) ? 'default' : null;
    const t = tekstKlucza(n.name);
    return t !== null ? t : n.name.getText();
  }
  if (ts.isExportAssignment(n)) return 'default';
  return null;
}
function lancuch(w) {
  const czesci = [];
  for (let n = w.parent; n; n = n.parent) {
    const nm = nazwaWezla(n);
    if (nm) czesci.push(nm);
  }
  return czesci.reverse().join('.') || '<modul>';
}
function rozpakuj(e) {
  while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) ||
      ts.isTypeAssertionExpression(e) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(e)))) {
    e = e.expression;
  }
  return e;
}
function maTekst(e) {
  e = rozpakuj(e);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isTemplateExpression(e) ||
      ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return true;
  if (ts.isObjectLiteralExpression(e)) {
    return e.properties.some((p) => ts.isPropertyAssignment(p) && maTekst(p.initializer));
  }
  return false;
}
function jestOdwolaniem(e) {
  e = rozpakuj(e);
  return ts.isIdentifier(e) || ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e);
}
function wpisyObiektu(o) {
  const wpisy = [];
  for (const p of o.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const k = tekstKlucza(p.name);
    if (k !== null) wpisy.push([k, p.initializer]);
  }
  return wpisy;
}
function wpisyMap(nowy) {
  if (!ts.isIdentifier(nowy.expression) || nowy.expression.text !== 'Map') return null;
  const arg = nowy.arguments && nowy.arguments[0] ? rozpakuj(nowy.arguments[0]) : null;
  if (!arg || !ts.isArrayLiteralExpression(arg)) return null;
  const wpisy = [];
  for (const el of arg.elements) {
    const para = rozpakuj(el);
    if (!ts.isArrayLiteralExpression(para) || para.elements.length !== 2) continue;
    const k = rozpakuj(para.elements[0]);
    if (ts.isStringLiteral(k) || ts.isNoSubstitutionTemplateLiteral(k)) wpisy.push([k.text, para.elements[1]]);
    else if (ts.isPropertyAccessExpression(k)) wpisy.push([k.name.text, para.elements[1]]);
  }
  return wpisy;
}
function ocenMape(wpisy) {
  const trafione = werdyktowe(wpisy.map(([k]) => k));
  if (trafione.size === 0) return null;
  const wartosci = wpisy.filter(([k]) => trafione.has(normalizuj(k))).map(([, v]) => v);
  const tekstowe = wartosci.every(maTekst);
  const odwolania = wartosci.every((v) => maTekst(v) || jestOdwolaniem(v));
  const kody = wpisy.length >= 2 && wpisy.every(([k]) => KOD.test(k));
  if (tekstowe || (odwolania && (trafione.size >= 2 || kody))) return [...trafione].sort();
  return null;
}
function deklaracja(w, nazwa) {
  for (let n = w.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n) && n.parameters) {
      for (const p of n.parameters) if (ts.isIdentifier(p.name) && p.name.text === nazwa) return p;
    }
    const instr = (ts.isSourceFile(n) || ts.isBlock(n) || ts.isModuleBlock(n) || ts.isCaseClause(n) ||
      ts.isDefaultClause(n)) ? n.statements : null;
    if (!instr) continue;
    for (const s of instr) {
      if (!ts.isVariableStatement(s)) continue;
      for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === nazwa) {
          return (s.declarationList.flags & ts.NodeFlags.Const) !== 0 ? d : null;
        }
      }
    }
  }
  return null;
}
function jestStala(e, gl) {
  e = rozpakuj(e);
  if (gl > 4) return false;
  if (ts.isNumericLiteral(e) || (ts.isPrefixUnaryExpression(e) && ts.isNumericLiteral(e.operand))) return true;
  if (ts.isIdentifier(e)) {
    if (STALA.test(e.text)) return true;
    const d = deklaracja(e, e.text);
    return Boolean(d && d.initializer && jestStala(d.initializer, gl + 1));
  }
  if (ts.isPropertyAccessExpression(e)) {
    if (STALA.test(e.name.text)) return true;
    const baza = rozpakuj(e.expression);
    if (ts.isIdentifier(baza)) {
      const d = deklaracja(baza, baza.text);
      const init = d && d.initializer ? rozpakuj(d.initializer) : null;
      if (init && ts.isObjectLiteralExpression(init)) {
        for (const p of init.properties) {
          if (ts.isPropertyAssignment(p) && tekstKlucza(p.name) === e.name.text) return jestStala(p.initializer, gl + 1);
        }
      }
    }
  }
  return false;
}
function literaly(e, zbior) {
  e = rozpakuj(e);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) zbior.push(normalizuj(e.text));
  else if (ts.isConditionalExpression(e)) { literaly(e.whenTrue, zbior); literaly(e.whenFalse, zbior); }
  return zbior;
}
function nazwaEtykiety(nm) {
  return nm !== null && normalizuj(nm).split('_').some((t) => NAZWY_UJSC.has(t));
}
function nazwaCelu(cel) {
  cel = rozpakuj(cel);
  if (ts.isIdentifier(cel)) return cel.text;
  if (ts.isPropertyAccessExpression(cel)) return cel.name.text;
  return null;
}
function nazwaFunkcji(fn) {
  if (fn.name) { const t = tekstKlucza(fn.name); return t !== null ? t : fn.name.getText(); }
  const p = fn.parent;
  if (p && (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) && p.name) {
    const t = tekstKlucza(p.name);
    return t !== null ? t : p.name.getText();
  }
  return null;
}
function galazEtykietuje(instr) {
  // Tylko instrukcje BEZPOŚREDNIE gałęzi: `return '<etykieta>'` albo przypisanie etykiety.
  // Zejście głębiej łapało decyzje układu (`if (n >= 2) { … wiele instrukcji … }`).
  const instrukcje = ts.isBlock(instr) ? instr.statements : [instr];
  return instrukcje.some((s) => {
    if (ts.isReturnStatement(s)) {
      return Boolean(s.expression) && literaly(s.expression, []).some((l) => LITERALY_ETYKIET.has(l));
    }
    if (ts.isExpressionStatement(s)) {
      const e = rozpakuj(s.expression);
      return ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        (nazwaEtykiety(nazwaCelu(e.left)) || literaly(e.right, []).some((l) => LITERALY_ETYKIET.has(l)));
    }
    return false;
  });
}
function ujscie(porownanie) {
  let n = porownanie;
  for (let krok = 0; krok < 40 && n.parent; krok++) {
    const p = n.parent;
    if (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isNonNullExpression(p) ||
        (ts.isPrefixUnaryExpression(p) && p.operator === ts.SyntaxKind.ExclamationToken) ||
        (ts.isBinaryExpression(p) && LOGICZNE.has(p.operatorToken.kind)) || ts.isJsxExpression(p)) {
      n = p;
      continue;
    }
    if (ts.isConditionalExpression(p)) {
      if (p.condition === n) {
        const lit = literaly(p.whenTrue, []).concat(literaly(p.whenFalse, [])).filter((l) => LITERALY_ETYKIET.has(l));
        if (lit.length > 0) return 'warunek ?: z literałem etykiety ' + [...new Set(lit)].sort().join('|');
      }
      n = p;
      continue;
    }
    if ((ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) ||
         ts.isParameter(p) || ts.isJsxAttribute(p)) && p.name) {
      const t = tekstKlucza(p.name);
      const nm = t !== null ? t : p.name.getText();
      return nazwaEtykiety(nm) ? 'ujście o nazwie etykiety `' + nm + '`' : null;
    }
    if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && p.right === n) {
      const nm = nazwaCelu(p.left);
      return nazwaEtykiety(nm) ? 'przypisanie do `' + nm + '`' : null;
    }
    if (ts.isReturnStatement(p) || (ts.isArrowFunction(p) && p.body === n)) {
      let fn = p;
      while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
      const nm = fn ? nazwaFunkcji(fn) : null;
      return nazwaEtykiety(nm) ? 'wynik funkcji `' + nm + '`' : null;
    }
    if (ts.isIfStatement(p) && p.expression === n) {
      return (galazEtykietuje(p.thenStatement) || (p.elseStatement && galazEtykietuje(p.elseStatement)))
        ? 'warunek `if` z gałęzią etykiety' : null;
    }
    return null;
  }
  return null;
}
// ---- Sprawdzenie 6: werdykt poza rekordem (ładunek, tekst składany, mapa warunkowa) ----
function wersalikami(s) {
  return s !== s.toLowerCase() && s === s.toUpperCase();
}
function kodyWersalikami(tekst) {
  // Ta sama funkcja co `kody_werdyktu_wersalikami` w Pythonie (test zgodności obu postaci).
  const slowa = [...tekst.matchAll(/[\p{L}\p{N}_]+/gu)];
  const kody = [];
  let i = 0;
  while (i < slowa.length) {
    let dlugosc = 0;
    for (let n = Math.min(MAKS_SLOW, slowa.length - i); n > 0; n--) {
      const grupa = slowa.slice(i, i + n);
      if (!grupa.every((s) => wersalikami(s[0]))) continue;
      let ciagly = true;
      for (let j = 1; j < grupa.length; j++) {
        const odstep = tekst.slice(grupa[j - 1].index + grupa[j - 1][0].length, grupa[j].index);
        if (!/^[\s-]+$/.test(odstep)) { ciagly = false; break; }
      }
      if (!ciagly) continue;
      const kandydat = grupa.map((s) => s[0]).join('_');
      if (SLOWNIK.has(normalizuj(kandydat))) { kody.push(kandydat); dlugosc = n; break; }
    }
    i += dlugosc || 1;
  }
  return kody;
}
function kluczWerdyktu(k) {
  const n = normalizuj(k);
  return WZ_KLUCZA.test(n) || WZ_POLA.test(n);
}
function jestPusty(e) {
  e = rozpakuj(e);
  return e.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(e) && e.text === 'undefined');
}
function maWyjasnienie(obiekt) {
  return obiekt.properties.some((p) => {
    if (ts.isShorthandPropertyAssignment(p)) return WZ_WYJASNIENIA.test(normalizuj(p.name.text));
    if (!ts.isPropertyAssignment(p)) return false;
    const k = tekstKlucza(p.name);
    return k !== null && WZ_WYJASNIENIA.test(normalizuj(k)) && !jestPusty(p.initializer);
  });
}
function atrybutWyjasnienia(a) {
  return ts.isJsxAttribute(a) && WZ_WYJASNIENIA.test(normalizuj(a.name.getText()));
}
function etykietyPorownania(warunek) {
  // Warunek gałęzi mapy warunkowej: `x === 'PASS'`, `'PASS' == x`, `x === Werdykt.PASS`,
  // alternatywa `||` takich porównań o tym samym podmiocie.
  const e = rozpakuj(warunek);
  if (!e || !ts.isBinaryExpression(e)) return null;
  const op = e.operatorToken.kind;
  if (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken) {
    for (const [podmiot, stala] of [[e.left, e.right], [e.right, e.left]]) {
      const s = rozpakuj(stala);
      if (ts.isStringLiteral(s) || ts.isNoSubstitutionTemplateLiteral(s)) {
        return { podmiot: rozpakuj(podmiot).getText(), etykiety: [s.text] };
      }
      if (ts.isPropertyAccessExpression(s) && KOD.test(s.name.text)) {
        return { podmiot: rozpakuj(podmiot).getText(), etykiety: [s.name.text] };
      }
    }
    return null;
  }
  if (op === ts.SyntaxKind.BarBarToken) {
    const l = etykietyPorownania(e.left);
    const r = etykietyPorownania(e.right);
    if (l && r && l.podmiot === r.podmiot) return { podmiot: l.podmiot, etykiety: l.etykiety.concat(r.etykiety) };
  }
  return null;
}
function wartosciStatyczne(e, gl) {
  // Wartości tekstowe znane statycznie (literał, obie gałęzie `?:`, człony `&&`/`||`/`??`,
  // człon wyliczenia `Werdykt.PASS`) — odpowiednik `_wartosci_statyczne`.
  e = rozpakuj(e);
  if (!e || gl > 8) return [];
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text];
  if (ts.isConditionalExpression(e)) {
    return wartosciStatyczne(e.whenTrue, gl + 1).concat(wartosciStatyczne(e.whenFalse, gl + 1));
  }
  if (ts.isBinaryExpression(e) && LOGICZNE.has(e.operatorToken.kind)) {
    return wartosciStatyczne(e.left, gl + 1).concat(wartosciStatyczne(e.right, gl + 1));
  }
  if (ts.isPropertyAccessExpression(e) && KOD.test(e.name.text)) return [e.name.text];
  if (ts.isIdentifier(e)) {
    // Stała lokalna (`const ton = ok ? 'OK' : 'BŁĄD'`) albo parametr z wartością domyślną —
    // odpowiednik zmiennej lokalnej `_wartosci_statyczne` (`deklaracja` zna tylko `const`).
    const d = deklaracja(e, e.text);
    return d && d.initializer ? wartosciStatyczne(d.initializer, gl + 1) : [];
  }
  return [];
}
function czesciTekstu(w) {
  // (stałe części, wstawki) wyrażenia SKŁADAJĄCEGO tekst: szablon `...${}...`, konkatenacja
  // `+` z członem tekstowym, wstawka `{...}` w treści elementu JSX.
  if (ts.isTemplateExpression(w)) {
    return { stale: [w.head.text].concat(w.templateSpans.map((s) => s.literal.text)),
      wstawki: w.templateSpans.map((s) => s.expression) };
  }
  if (ts.isBinaryExpression(w) && w.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const czlony = [];
    const splaszcz = (e) => {
      if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) { splaszcz(e.left); splaszcz(e.right); }
      else czlony.push(e);
    };
    splaszcz(w);
    const teksty = czlony.filter((c) => ts.isStringLiteral(c) || ts.isNoSubstitutionTemplateLiteral(c));
    if (teksty.length === 0 && !czlony.some((c) => ts.isTemplateExpression(c))) return null;
    return { stale: teksty.map((c) => c.text),
      wstawki: czlony.filter((c) => !teksty.includes(c) && !ts.isTemplateExpression(c)) };
  }
  if (ts.isJsxExpression(w) && w.expression && w.parent && (ts.isJsxElement(w.parent) || ts.isJsxFragment(w.parent))) {
    return { stale: [], wstawki: [w.expression] };
  }
  return null;
}
function otoczenieTekstu(w) {
  // Prawda, gdy tekst leży w rekordzie z `wyjasnienie` (obiekt, atrybuty JSX) albo jest
  // argumentem `console.*` (komunikat dla dewelopera, nie wynik dla projektanta).
  for (let n = w, krok = 0; n.parent && krok < 60; n = n.parent, krok++) {
    const p = n.parent;
    if (ts.isObjectLiteralExpression(p)) return maWyjasnienie(p);
    if (ts.isJsxElement(p)) return p.openingElement.attributes.properties.some(atrybutWyjasnienia);
    if (ts.isJsxSelfClosingElement(p) || ts.isJsxOpeningElement(p)) return p.attributes.properties.some(atrybutWyjasnienia);
    if (ts.isCallExpression(p) && n !== p.expression) {
      const f = p.expression;
      return ts.isPropertyAccessExpression(f) && ts.isIdentifier(f.expression) && f.expression.text === 'console';
    }
    if (ts.isBlock(p) || ts.isSourceFile(p) || ts.isFunctionLike(p)) return false;
  }
  return false;
}
function instrukcjeGalezi(s) {
  return ts.isBlock(s) ? s.statements : [s];
}
function wartoscGalezi(instrukcje) {
  // Pierwszy bezpośredni `return X`, a bez niego pierwsze bezpośrednie przypisanie `y = X`.
  for (const s of instrukcje) if (ts.isReturnStatement(s)) return s.expression || null;
  for (const s of instrukcje) {
    if (!ts.isExpressionStatement(s)) continue;
    const e = rozpakuj(s.expression);
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.EqualsToken) return e.right;
  }
  return null;
}
function wpisySwitch(sw) {
  const wpisy = [];
  let czekajace = [];
  for (const kl of sw.caseBlock.clauses) {
    if (ts.isCaseClause(kl)) {
      const k = rozpakuj(kl.expression);
      if (ts.isStringLiteral(k) || ts.isNoSubstitutionTemplateLiteral(k)) czekajace.push(k.text);
      else if (ts.isPropertyAccessExpression(k) && KOD.test(k.name.text)) czekajace.push(k.name.text);
    }
    if (kl.statements.length === 0) continue;
    const lista = kl.statements.length === 1 && ts.isBlock(kl.statements[0]) ? kl.statements[0].statements : kl.statements;
    const wartosc = wartoscGalezi(lista);
    if (wartosc) for (const e of czekajace) wpisy.push([e, wartosc]);
    czekajace = [];
  }
  return wpisy;
}
function wpisyLancuchaIf(pierwszy, stan) {
  const wpisy = [];
  let zgodny = false;
  for (let n = pierwszy; n && ts.isIfStatement(n); n = n.elseStatement) {
    const p = etykietyPorownania(n.expression);
    if (!p || (stan.podmiot !== null && p.podmiot !== stan.podmiot)) break;
    stan.podmiot = p.podmiot;
    zgodny = true;
    const wartosc = wartoscGalezi(instrukcjeGalezi(n.thenStatement));
    if (wartosc) for (const e of p.etykiety) wpisy.push([e, wartosc]);
  }
  return zgodny ? wpisy : null;
}
function mapyIfow(instrukcje) {
  // Ciągi kolejnych `if` (z łańcuchami `else if`) o tym samym podmiocie porównania.
  const mapy = [];
  let i = 0;
  while (i < instrukcje.length) {
    if (!ts.isIfStatement(instrukcje[i])) { i++; continue; }
    const stan = { podmiot: null };
    let wpisy = [];
    let j = i;
    while (j < instrukcje.length && ts.isIfStatement(instrukcje[j])) {
      const w = wpisyLancuchaIf(instrukcje[j], stan);
      if (w === null) break;
      wpisy = wpisy.concat(w);
      j++;
    }
    if (wpisy.length) mapy.push([instrukcje[i], wpisy]);
    i = Math.max(j, i + 1);
  }
  return mapy;
}
function wpisyTernary(w) {
  const wpisy = [];
  let podmiot = null;
  for (let n = w; n && ts.isConditionalExpression(n); n = rozpakuj(n.whenFalse)) {
    const p = etykietyPorownania(n.condition);
    if (!p || (podmiot !== null && p.podmiot !== podmiot)) break;
    podmiot = p.podmiot;
    for (const e of p.etykiety) wpisy.push([e, n.whenTrue]);
  }
  return wpisy;
}
function ocenMapeWarunkowa(wpisy) {
  // Te same kryteria co mapa literału (3a) — każdy literał tekstu, także kod małymi literami
  // (`'ok'` to w interfejsie klasa tonu, nie kod słownika), poza rekordem z `wyjasnienie`.
  // Backend (`_ocen_mape_py`) dodatkowo zwalnia tłumaczenie słownika na słownik (`SPELNIA` →
  // `pass`), tak jak sprawdzenie 4 zwalnia mapę status → kod.
  const trafione = werdyktowe(wpisy.map(([k]) => k));
  if (trafione.size === 0) return null;
  const wartosci = wpisy.filter(([k]) => trafione.has(normalizuj(k))).map(([, v]) => v);
  if (wartosci.every((v) => { const r = rozpakuj(v); return ts.isObjectLiteralExpression(r) && maWyjasnienie(r); })) return null;
  return ocenMape(wpisy);
}
const wyniki = [];
for (const [sciezka, wzgledna] of we.pliki) {
  let tekst;
  try {
    tekst = fs.readFileSync(sciezka, 'utf8');
  } catch (blad) {
    // Plik usunięty między listowaniem a odczytem (drzewo zmieniane równolegle) — nie istnieje.
    if (blad.code === 'ENOENT') continue;
    throw blad;
  }
  const sf = ts.createSourceFile(sciezka, tekst, ts.ScriptTarget.Latest, true,
    sciezka.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const karta = wzgledna === we.modul_karty;
  const dodaj = (rodzaj, w, opis, kod) => wyniki.push({ rodzaj, plik: wzgledna, symbol: lancuch(w),
    linia: sf.getLineAndCharacterOfPosition(w.getStart(sf)).line + 1, opis, kod: kod || null });
  const ocenMapeSterowania = (w, wpisy) => {
    const klucze = ocenMapeWarunkowa(wpisy);
    if (klucze) dodaj('mapa_warunkowa', w, 'mapa po statusie maszynowym w przepływie sterowania (klucze: ' + klucze.join(', ') + ')');
    const sem = new Set(wpisy.map(([k]) => normalizuj(k)).filter((k) => SEMANTYKI.has(k)));
    if (!karta && sem.size >= 2) {
      dodaj('mapa_warunkowa', w, 'mapa po semantyce koloru w przepływie sterowania poza modułem karty werdyktu (klucze: ' + [...sem].sort().join(', ') + ')');
    }
  };
  const odwiedz = (w) => {
    const wpisy = ts.isObjectLiteralExpression(w) ? wpisyObiektu(w) : ts.isNewExpression(w) ? wpisyMap(w) : null;
    if (wpisy) {
      const klucze = ocenMape(wpisy);
      if (klucze) dodaj('mapa', w, 'mapa po statusie maszynowym (klucze: ' + klucze.join(', ') + ')');
      const sem = new Set(wpisy.map(([k]) => normalizuj(k)).filter((k) => SEMANTYKI.has(k)));
      if (!karta && sem.size >= 2) {
        dodaj('mapa', w, 'mapa po semantyce koloru poza modułem karty werdyktu (klucze: ' + [...sem].sort().join(', ') + ')');
      }
    }
    if (!karta && ts.isBinaryExpression(w) && PORZADKI.has(w.operatorToken.kind) &&
        jestStala(w.left, 0) !== jestStala(w.right, 0)) {
      const powod = ujscie(w);
      if (powod) dodaj('prog', w, 'porównanie z progiem `' + w.getText(sf).replace(/\s+/g, ' ').slice(0, 80) + '` → ' + powod);
    }
    // 6a — ładunek: właściwość o kluczu statusu z wartością ze słownika werdyktów.
    if (ts.isObjectLiteralExpression(w) && !maWyjasnienie(w)) {
      for (const p of w.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const k = tekstKlucza(p.name);
        if (k === null || !kluczWerdyktu(k) || werdyktowe([k]).size > 0) continue;
        const trafione = werdyktowe(wartosciStatyczne(p.initializer, 0));
        if (trafione.size > 0) {
          dodaj('ladunek', p.initializer, 'ładunek słownikowy `' + k + '` z wartością ze słownika werdyktów (' +
            [...trafione].sort().join(', ') + ') bez rekordu `wyjasnienie` obok');
        }
      }
    }
    // 6b — tekst SKŁADANY z kodem werdyktu (wersalikami) albo z wstawką-werdyktem.
    const czesci = czesciTekstu(w);
    if (czesci) {
      let kandydaci = [];
      for (const t of czesci.stale) kandydaci = kandydaci.concat(kodyWersalikami(t));
      for (const wst of czesci.wstawki) {
        for (const v of wartosciStatyczne(wst, 0)) kandydaci = kandydaci.concat([v], kodyWersalikami(v));
      }
      const trafione = werdyktowe(kandydaci);
      if (trafione.size > 0 && !otoczenieTekstu(w)) {
        for (const kod of [...trafione].sort()) {
          dodaj('tekst', w, 'tekst składany z kodem werdyktu `' + kod.toUpperCase() + '` bez rekordu `wyjasnienie` obok', kod.toUpperCase());
        }
      }
    }
    // 6c — mapa „status → etykieta” zapisana przepływem sterowania.
    if (ts.isSwitchStatement(w)) ocenMapeSterowania(w, wpisySwitch(w));
    if (ts.isSourceFile(w) || ts.isBlock(w) || ts.isModuleBlock(w) || ts.isCaseClause(w) || ts.isDefaultClause(w)) {
      for (const [pierwszy, wpisyIf] of mapyIfow(w.statements)) ocenMapeSterowania(pierwszy, wpisyIf);
    }
    if (ts.isConditionalExpression(w)) {
      let rodzic = w.parent;
      while (rodzic && ts.isParenthesizedExpression(rodzic)) rodzic = rodzic.parent;
      const kontynuacja = rodzic && ts.isConditionalExpression(rodzic) && rozpakuj(rodzic.whenFalse) === w &&
        etykietyPorownania(rodzic.condition);
      if (!kontynuacja) {
        const wpisyT = wpisyTernary(w);
        if (wpisyT.length) ocenMapeSterowania(w, wpisyT);
      }
    }
    ts.forEachChild(w, odwiedz);
  };
  odwiedz(sf);
}
process.stdout.write(JSON.stringify(wyniki));
"""


def _node() -> str:
    node = shutil.which("node")
    if node is None:
        raise BladSrodowiska("brak `node` w PATH — sprawdzenie 3 wymaga parsera TypeScript")
    return node


def _uruchom_program_ts(wejscie: dict, modul_typescript: Path) -> object:
    if not (modul_typescript / "package.json").is_file():
        raise BladSrodowiska(
            f"brak pakietu `typescript` w {modul_typescript} (uruchom `npm ci` w `frontend/`)"
        )
    wynik = subprocess.run(
        [_node(), "-e", PROGRAM_TS, str(modul_typescript)],
        input=json.dumps(wejscie),
        capture_output=True,
        text=True,
        check=False,
    )
    if wynik.returncode != 0:
        raise BladSrodowiska(
            f"analiza AST TypeScript zakończona kodem {wynik.returncode}:\n{wynik.stderr[-2000:]}"
        )
    return json.loads(wynik.stdout)


def normalizuj_w_typescript(teksty: list[str], modul_typescript: Path = MODUL_TYPESCRIPT) -> list:
    """Normalizacja wykonana przez program TypeScript (do testu zgodności obu implementacji)."""
    wynik = _uruchom_program_ts(
        {"tylko_normalizacja": True, "teksty": teksty, "slownik": [], "semantyki": []},
        modul_typescript,
    )
    assert isinstance(wynik, list)
    return wynik


def _parametry_sprawdzenia_6() -> dict[str, object]:
    """Wzorce sprawdzenia 6 przekazywane programowi TypeScript z TYCH SAMYCH stałych modułu."""
    return {
        "wzorzec_klucza": WZORZEC_KLUCZA_WERDYKTU.pattern,
        "wzorzec_pola": WZORZEC_POLA_WERDYKTU.pattern,
        "wzorzec_wyjasnienia": WZORZEC_KLUCZA_WYJASNIENIA.pattern,
        "maks_slow_kodu": _MAKS_SLOW_KODU,
    }


def kody_w_typescript(teksty: list[str], modul_typescript: Path = MODUL_TYPESCRIPT) -> list:
    """Kody werdyktu wersalikami wyznaczone przez program TypeScript (test zgodności)."""
    wynik = _uruchom_program_ts(
        {
            "tylko_kody": True,
            "teksty": teksty,
            "slownik": sorted(SLOWNIK_WERDYKTOW),
            "semantyki": [],
            **_parametry_sprawdzenia_6(),
        },
        modul_typescript,
    )
    assert isinstance(wynik, list)
    return wynik


def pliki_frontendu(korzen: Path) -> list[Path]:
    """Pliki `*.ts(x)` produktu: bez testów, `src/test/`, `harness-fixtures` i `.d.ts`."""
    pliki: list[Path] = []
    for sciezka in sorted(korzen.rglob("*")):
        if sciezka.suffix not in (".ts", ".tsx") or not sciezka.is_file():
            continue
        wzgledna = sciezka.relative_to(korzen)
        if {"__tests__", "harness-fixtures", "node_modules"} & set(wzgledna.parts):
            continue
        if wzgledna.parts[0] == "test":
            continue
        if ".test." in sciezka.name or ".spec." in sciezka.name or sciezka.name.endswith(".d.ts"):
            continue
        pliki.append(sciezka)
    return pliki


def sprawdz_frontend(
    korzen: Path = FRONTEND_SRC, modul_typescript: Path = MODUL_TYPESCRIPT
) -> list[Naruszenie]:
    """Sprawdzenie 3 (3a mapy, 3b progi): jeden bieg `node`, każdy plik parsowany raz."""
    if not korzen.is_dir():
        raise BladSrodowiska(f"brak katalogu frontendu: {korzen}")
    pliki = pliki_frontendu(korzen)
    wejscie = {
        "pliki": [[str(p), "frontend/src/" + p.relative_to(korzen).as_posix()] for p in pliki],
        "slownik": sorted(SLOWNIK_WERDYKTOW),
        "semantyki": list(SEMANTYKI),
        "literaly_etykiet": sorted(LITERALY_ETYKIET),
        "nazwy_ujsc": sorted(NAZWY_UJSC),
        "modul_karty": MODUL_KARTY,
        **_parametry_sprawdzenia_6(),
    }
    trafienia = _uruchom_program_ts(wejscie, modul_typescript)
    assert isinstance(trafienia, list)
    naruszenia: dict[tuple[str, str], Naruszenie] = {}
    for t in reversed(trafienia):
        sprawdzenie = _SPRAWDZENIE_TS[t["rodzaj"]]
        symbole = tuple(t["symbol"].split("."))
        tozsamosc = f"{t['plik']}:{t['symbol']}"
        if t.get("kod"):
            tozsamosc = f"{tozsamosc}:{t['kod']}"
            symbole = (*symbole, t["kod"])
        naruszenia[(sprawdzenie, tozsamosc)] = Naruszenie(
            sprawdzenie, tozsamosc, t["plik"], int(t["linia"]), t["opis"], symbole
        )
    return sorted(naruszenia.values())


#: Rodzaj trafienia programu TypeScript → sprawdzenie.
_SPRAWDZENIE_TS = {
    "mapa": "3a_frontend_mapa",
    "prog": "3b_frontend_prog",
    "ladunek": "6a_ladunek_werdyktu",
    "tekst": "6b_tekst_werdyktu",
    "mapa_warunkowa": "6c_mapa_statusu",
}


# ---------------------------------------------------------------------------
# Pomiar całego drzewa
# ---------------------------------------------------------------------------


def _jest_polem_tekstu(klucz: str | None) -> bool:
    return klucz is not None and (klucz.endswith("_pl") or klucz in KLUCZE_TEKSTU_BEZ_SUFIKSU)


def kody_jednowyrazowe(indeks: IndeksBackendu) -> frozenset[str]:
    """Jednowyrazowe kody wyliczeń kontraktu werdyktu (`NIEUSTALONE`, `PELNY`, `LOGICZNE`…),
    wyprowadzone z drzewa, nie z listy: wartości aliasów `ALIASY_OSI_STANU` modułu
    `werdykt.kontrakt` i wartości wyliczeń `werdykt.proweniencja`. Kod z podkreśleniem łapie
    `WZORZEC_KODU_W_TEKSCIE`; skróty będące słowami polszczyzny technicznej (`OSD`, `WOS`)
    nie są kodem. Brak modułów kontraktu albo aliasu z listy = błąd środowiska."""
    kontrakt = indeks.moduly.get(MODUL_KONTRAKTU)
    proweniencja = indeks.moduly.get(MODUL_PROWENIENCJI)
    if kontrakt is None or proweniencja is None:
        raise BladSrodowiska(
            f"brak modułów kontraktu werdyktu ({MODUL_KONTRAKTU}, {MODUL_PROWENIENCJI})"
        )
    wartosci: set[str] = set()
    for nazwa in ALIASY_OSI_STANU:
        alias = kontrakt.aliasy.get(nazwa)
        if not (
            isinstance(alias, ast.Subscript)
            and isinstance(alias.value, ast.Name)
            and alias.value.id == "Literal"
        ):
            raise BladSrodowiska(f"{MODUL_KONTRAKTU}.{nazwa} nie jest aliasem `Literal[...]`")
        wartosci.update(
            e.value
            for e in _elementy(alias.slice)
            if isinstance(e, ast.Constant) and isinstance(e.value, str)
        )
    for klasa in proweniencja.klasy.values():
        if indeks.jest_enum(MODUL_PROWENIENCJI, klasa):
            wartosci.update(indeks.wartosci_enum(klasa))
    kody = (
        frozenset(w for w in wartosci if "_" not in w and len(w) >= 3 and w.isupper())
        - SKROTY_PROZY
    )
    if not kody:
        raise BladSrodowiska("kontrakt werdyktu bez jednowyrazowych kodów wyliczeń")
    return kody


def kody_w_tekscie(tekst: str, jednowyrazowe: frozenset[str]) -> list[str]:
    """Kody wyliczeń w tekście dla człowieka: z podkreśleniem (wzorzec) i jednowyrazowe
    (zbiór z kontraktu), posortowane bez powtórzeń."""
    kody = set(WZORZEC_KODU_W_TEKSCIE.findall(tekst))
    kody.update(s for s in WZORZEC_SLOWA_WIELKIMI.findall(tekst) if s in jednowyrazowe)
    return sorted(kody)


def _naruszenie_kodu(tozsamosc: str, plik: str, linia: int, klucz: str, kod: str) -> Naruszenie:
    return Naruszenie(
        "5_kod_w_tekscie",
        tozsamosc,
        plik,
        linia,
        f"kod `{kod}` w tekście dla człowieka ({klucz}) — nazwa polska w zdaniu, kod "
        "wyłącznie w polu rekordu",
        (kod,),
    )


def _kody_w_odpowiedziach(katalog: Path, jednowyrazowe: frozenset[str]) -> list[Naruszenie]:
    """Korpus A: odpowiedzi POLICZONE backendem (fixtury harnessu) — tekst z f-napisów
    i `.value` wyliczeń powstaje w czasie biegu. Brak korpusu = błąd środowiska."""
    if not katalog.is_dir():
        raise BladSrodowiska(f"brak korpusu odpowiedzi backendu: {katalog}")
    pliki = sorted(katalog.glob("*.json"))
    if not pliki:
        raise BladSrodowiska(f"pusty korpus odpowiedzi backendu: {katalog}")
    naruszenia: list[Naruszenie] = []

    def odwiedz(dane: object, sciezka: str, klucz: str | None, plik: Path) -> None:
        if isinstance(dane, dict):
            for k, v in dane.items():
                odwiedz(v, f"{sciezka}.{k}", str(k), plik)
        elif isinstance(dane, list):
            for v in dane:
                odwiedz(v, f"{sciezka}[]", klucz, plik)
        elif isinstance(dane, str) and klucz is not None and _jest_polem_tekstu(klucz):
            for kod in kody_w_tekscie(dane, jednowyrazowe):
                naruszenia.append(
                    _naruszenie_kodu(
                        f"{plik.name}:{sciezka}:{kod}", _sciezka_wzgledna(plik), 0, klucz, kod
                    )
                )

    for plik in pliki:
        try:
            dane = json.loads(plik.read_text(encoding="utf-8"))
        except json.JSONDecodeError as blad:
            raise BladSrodowiska(f"korpus: {plik.name} nie jest poprawnym JSON: {blad}") from blad
        odwiedz(dane, "$", None, plik)
    return naruszenia


def _wartosci_pol_tekstu(wezel: ast.AST) -> Iterator[tuple[str, ast.expr]]:
    """Pary (klucz pola tekstu, wyrażenie wartości) w węźle: argument nazwany `*_pl`,
    klucz słownika `*_pl` i przypisanie do nazwy/atrybutu `*_pl`."""
    if isinstance(wezel, ast.Call):
        for argument in wezel.keywords:
            if argument.arg is not None and _jest_polem_tekstu(argument.arg):
                yield argument.arg, argument.value
    elif isinstance(wezel, ast.Dict):
        for klucz, wartosc in zip(wezel.keys, wezel.values, strict=True):
            if (
                isinstance(klucz, ast.Constant)
                and isinstance(klucz.value, str)
                and _jest_polem_tekstu(klucz.value)
            ):
                yield klucz.value, wartosc
    elif isinstance(wezel, ast.Assign | ast.AnnAssign) and wezel.value is not None:
        cele = wezel.targets if isinstance(wezel, ast.Assign) else [wezel.target]
        for cel in cele:
            nazwa = (
                cel.attr
                if isinstance(cel, ast.Attribute)
                else cel.id if isinstance(cel, ast.Name) else None
            )
            if nazwa is not None and _jest_polem_tekstu(nazwa):
                yield nazwa, wezel.value


def _kody_w_literalach(indeks: IndeksBackendu, jednowyrazowe: frozenset[str]) -> list[Naruszenie]:
    """Korpus B: literały i stałe części f-napisów zasilające pole tekstu `*_pl` (albo
    `czego_brakuje`/`zastrzezenia`) w CAŁYM `backend/src` — także ścieżki, których żadna
    scena harnessu nie wywołuje. Tożsamość: `moduł:łańcuch.symboli:KOD`."""
    naruszenia: list[Naruszenie] = []
    for modul, info in sorted(indeks.moduly.items()):
        rodzice: dict[int, ast.AST] | None = None
        for wezel in ast.walk(info.drzewo):
            for klucz, wartosc in _wartosci_pol_tekstu(wezel):
                for stala in ast.walk(wartosc):
                    if not (isinstance(stala, ast.Constant) and isinstance(stala.value, str)):
                        continue
                    kody = kody_w_tekscie(stala.value, jednowyrazowe)
                    if not kody:
                        continue
                    if rodzice is None:
                        rodzice = _rodzice(info.drzewo)
                    lancuch = _lancuch_py(stala, rodzice, info)
                    for kod in kody:
                        naruszenia.append(
                            _naruszenie_kodu(
                                f"{modul}:{lancuch}:{kod}",
                                _plik_backendu(info, indeks.korzen),
                                stala.lineno,
                                klucz,
                                kod,
                            )
                        )
    return naruszenia


def sprawdz_kody_w_tekscie(
    indeks: IndeksBackendu, katalog: Path = KATALOG_FIXTUR
) -> list[Naruszenie]:
    """Sprawdzenie 5: kody wyliczeń i identyfikatory maszynowe w polach tekstu dla człowieka
    — korpus A (odpowiedzi policzone backendem) i korpus B (literały źródła backendu), patrz
    nagłówek modułu."""
    jednowyrazowe = kody_jednowyrazowe(indeks)
    return [
        *_kody_w_odpowiedziach(katalog, jednowyrazowe),
        *_kody_w_literalach(indeks, jednowyrazowe),
    ]


# ---------------------------------------------------------------------------
# Sprawdzenie 6 — werdykt poza rekordem: ładunek słownikowy, tekst składany, mapa warunkowa
# ---------------------------------------------------------------------------


def _w_pakiecie_kontraktu(modul: str) -> bool:
    return modul == PAKIET_KONTRAKTU or modul.startswith(PAKIET_KONTRAKTU + ".")


def klucz_werdyktu(klucz: str) -> bool:
    """Klucz ładunku niosący status albo werdykt (6a): nazwa pola werdyktu ze sprawdzenia 1
    albo segment `status`/`werdykt`/`verdict`/`wynik`/`result`/`ocena` w dowolnym miejscu."""
    nazwa = normalizuj(klucz)
    return bool(WZORZEC_KLUCZA_WERDYKTU.search(nazwa) or WZORZEC_POLA_WERDYKTU.search(nazwa))


def kody_werdyktu_wersalikami(tekst: str) -> list[str]:
    """Kody werdyktu zapisane WERSALIKAMI w tekście (`PASS`, `OK`, `SPEŁNIA`, `NIE SPEŁNIA`,
    `NIE_SPELNIA`, `OUT OF RANGE`): n-gramy do `_MAKS_SLOW_KODU` słów rozdzielonych wyłącznie
    odstępem albo dywizem, których postać znormalizowana należy do słownika werdyktów.
    Słowo pisane zwykłą czcionką („spełnia” w zdaniu) nie jest kodem — strażnik nie poluje na
    słowa prozy (kontrakt §12). Ta sama funkcja istnieje w programie TypeScript
    (`kodyWersalikami`) — obie postaci pilnuje test zgodności."""
    slowa = list(_SLOWO.finditer(tekst))
    kody: list[str] = []
    i = 0
    while i < len(slowa):
        dlugosc = 0
        for n in range(min(_MAKS_SLOW_KODU, len(slowa) - i), 0, -1):
            grupa = slowa[i : i + n]
            if not all(slowo.group().isupper() for slowo in grupa):
                continue
            if any(
                not _ODSTEP_KODU.fullmatch(tekst[a.end() : b.start()])
                for a, b in zip(grupa, grupa[1:], strict=False)
            ):
                continue
            kandydat = "_".join(slowo.group() for slowo in grupa)
            if normalizuj(kandydat) in SLOWNIK_WERDYKTOW:
                kody.append(kandydat)
                dlugosc = n
                break
        i += dlugosc or 1
    return kody


def _stala_modulu(
    indeks: IndeksBackendu, info: _Modul, nazwa: str, glebokosc: int = 0
) -> str | None:
    """Stała tekstowa modułu — własna albo importowana z modułu drzewa."""
    if nazwa in info.stale:
        return info.stale[nazwa]
    cel = info.importy.get(nazwa)
    if cel is None or glebokosc > 5:
        return None
    modul_celu, _, symbol = cel.rpartition(".")
    docelowy = indeks.moduly.get(modul_celu)
    if docelowy is None:
        return None
    return _stala_modulu(indeks, docelowy, symbol, glebokosc + 1)


def _wartosci_czlonu_enum(klasa: ast.ClassDef, nazwa: str) -> list[str]:
    for instrukcja in klasa.body:
        if isinstance(instrukcja, ast.Assign) and any(
            isinstance(cel, ast.Name) and cel.id == nazwa for cel in instrukcja.targets
        ):
            if isinstance(instrukcja.value, ast.Constant) and isinstance(
                instrukcja.value.value, str
            ):
                return [nazwa, instrukcja.value.value]
            return [nazwa]
    return []


def _warunek_porownania(
    indeks: IndeksBackendu, info: _Modul, test: ast.expr
) -> tuple[str, list[str]] | None:
    """(podmiot, etykiety) warunku `x == "PASS"`, `"PASS" == x`, `x is Werdykt.PASS`,
    `x in ("PASS", "OK")` — gałąź mapy warunkowej (6c). Inne warunki: None."""
    if not (isinstance(test, ast.Compare) and len(test.ops) == 1):
        return None
    lewa, prawa, operator = test.left, test.comparators[0], test.ops[0]
    if isinstance(operator, ast.Eq | ast.Is):
        for podmiot, stala in ((lewa, prawa), (prawa, lewa)):
            etykiety = _wartosci_etykiety(indeks, info, stala)
            if etykiety:
                return ast.dump(podmiot), etykiety
    if isinstance(operator, ast.In) and isinstance(prawa, ast.Tuple | ast.List | ast.Set):
        etykiety = [e for element in prawa.elts for e in _wartosci_etykiety(indeks, info, element)]
        if prawa.elts and all(_wartosci_etykiety(indeks, info, e) for e in prawa.elts):
            return ast.dump(lewa), etykiety
    return None


def _wartosci_etykiety(indeks: IndeksBackendu, info: _Modul, wyrazenie: ast.expr) -> list[str]:
    """Etykieta gałęzi: literał, stała modułu albo człon wyliczenia z drzewa."""
    if isinstance(wyrazenie, ast.Constant):
        return [wyrazenie.value] if isinstance(wyrazenie.value, str) else []
    if isinstance(wyrazenie, ast.Name | ast.Attribute):
        return _wartosci_statyczne(indeks, info, wyrazenie)
    return []


#: Proste przypisania nazw w ciele funkcji: nazwa → wyrażenia przypisane (wszystkie).
Lokalne = dict[str, list[ast.expr]]


def _przypisania_lokalne(funkcja: ast.FunctionDef | ast.AsyncFunctionDef) -> Lokalne:
    """`x = wyrażenie` i `x: T = wyrażenie` w ciele funkcji (bez funkcji, klas i lambd
    zagnieżdżonych) — źródło wartości wstawki `f"{x}"` / ładunku `{"status": x}`
    (`uc_status = "OK" if ok else "BŁĄD"` tuż przed złożeniem tekstu)."""
    lokalne: Lokalne = {}
    stos: list[ast.AST] = list(funkcja.body)
    while stos:
        wezel = stos.pop()
        if isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef | ast.Lambda):
            continue
        if isinstance(wezel, ast.Assign):
            for cel in wezel.targets:
                if isinstance(cel, ast.Name):
                    lokalne.setdefault(cel.id, []).append(wezel.value)
        elif (
            isinstance(wezel, ast.AnnAssign)
            and isinstance(wezel.target, ast.Name)
            and wezel.value is not None
        ):
            lokalne.setdefault(wezel.target.id, []).append(wezel.value)
        stos.extend(ast.iter_child_nodes(wezel))
    return lokalne


class _LokalneLeniwe:
    """Przypisania lokalne funkcji liczone przy PIERWSZYM odczycie — większość funkcji nigdy
    ich nie potrzebuje (pomiar: dwukrotny koszt przejścia przy liczeniu z góry)."""

    def __init__(self, funkcja: ast.FunctionDef | ast.AsyncFunctionDef | None) -> None:
        self.funkcja = funkcja
        self._dane: Lokalne | None = None

    def get(self, nazwa: str, domyslne: list[ast.expr]) -> list[ast.expr]:
        if self.funkcja is None:
            return domyslne
        if self._dane is None:
            self._dane = _przypisania_lokalne(self.funkcja)
        return self._dane.get(nazwa, domyslne)


def _wezly_z_zasiegiem(drzewo: ast.Module) -> Iterator[tuple[ast.AST, _LokalneLeniwe]]:
    """Każdy węzeł modułu (raz) razem z leniwymi przypisaniami lokalnymi funkcji, w której
    leży (poza funkcją — puste)."""
    stos: list[tuple[ast.AST, _LokalneLeniwe]] = [(drzewo, _LokalneLeniwe(None))]
    while stos:
        wezel, lokalne = stos.pop()
        yield wezel, lokalne
        for dziecko in ast.iter_child_nodes(wezel):
            if isinstance(dziecko, ast.FunctionDef | ast.AsyncFunctionDef):
                stos.append((dziecko, _LokalneLeniwe(dziecko)))
            else:
                stos.append((dziecko, lokalne))


def _wartosci_statyczne(
    indeks: IndeksBackendu,
    info: _Modul,
    wyrazenie: ast.expr | None,
    glebokosc: int = 0,
    lokalne: _LokalneLeniwe | None = None,
) -> list[str]:
    """Wartości tekstowe znane statycznie: literał, obie gałęzie `a if c else b` (także gdy
    warunek porównuje status — ładunek i tekst niosą werdykt niezależnie od tego, jak go
    wybrano; mapę samą w sobie ocenia 6c), człony `or`/`and`, stała modułu (także
    importowana), zmienna lokalna funkcji (wartości WSZYSTKICH jej prostych przypisań) i człon
    wyliczenia z drzewa (`Werdykt.PASS`, `Werdykt.PASS.value`)."""
    if wyrazenie is None or glebokosc > 8:
        return []
    if isinstance(wyrazenie, ast.Constant):
        return [wyrazenie.value] if isinstance(wyrazenie.value, str) else []
    if isinstance(wyrazenie, ast.IfExp):
        return _wartosci_statyczne(indeks, info, wyrazenie.body, glebokosc + 1, lokalne) + (
            _wartosci_statyczne(indeks, info, wyrazenie.orelse, glebokosc + 1, lokalne)
        )
    if isinstance(wyrazenie, ast.BoolOp):
        return [
            wartosc
            for czlon in wyrazenie.values
            for wartosc in _wartosci_statyczne(indeks, info, czlon, glebokosc + 1, lokalne)
        ]
    if isinstance(wyrazenie, ast.Name):
        stala = _stala_modulu(indeks, info, wyrazenie.id)
        if stala is not None:
            return [stala]
        if lokalne is None:
            return []
        return [
            wartosc
            for przypisanie in lokalne.get(wyrazenie.id, [])
            for wartosc in _wartosci_statyczne(indeks, info, przypisanie, glebokosc + 1, lokalne)
        ]
    if isinstance(wyrazenie, ast.Attribute):
        czlon = wyrazenie
        if czlon.attr == "value" and isinstance(czlon.value, ast.Attribute):
            czlon = czlon.value
        cel = indeks._rozwiaz_typ(info.nazwa, czlon.value)
        if cel is not None and cel[2] == "enum":
            return _wartosci_czlonu_enum(indeks.moduly[cel[0]].klasy[cel[1]], czlon.attr)
    return []


def _wpisy_ladunku(wezel: ast.AST) -> list[tuple[str, ast.expr]]:
    """Pary (klucz, wartość) literału `{...}` z kluczami tekstowymi albo wywołania `dict(k=v)`."""
    if isinstance(wezel, ast.Dict):
        return [
            (klucz.value, wartosc)
            for klucz, wartosc in zip(wezel.keys, wezel.values, strict=True)
            if isinstance(klucz, ast.Constant) and isinstance(klucz.value, str)
        ]
    if isinstance(wezel, ast.Call) and isinstance(wezel.func, ast.Name) and wezel.func.id == "dict":
        return [(argument.arg, argument.value) for argument in wezel.keywords if argument.arg]
    return []


def _ma_wyjasnienie(wpisy: Iterable[tuple[str, ast.expr]]) -> bool:
    """Rekord niesie `wyjasnienie` (pole rekordów K i W, §4) o wartości innej niż `None`."""
    return any(
        WZORZEC_KLUCZA_WYJASNIENIA.match(normalizuj(klucz))
        and not (isinstance(wartosc, ast.Constant) and wartosc.value is None)
        for klucz, wartosc in wpisy
    )


def _wpisy_rekordu(wezel: ast.AST) -> list[tuple[str, ast.expr]]:
    """Pola rekordu: literał słownika, `dict(...)` albo argumenty nazwane konstruktora."""
    if isinstance(wezel, ast.Call) and not (
        isinstance(wezel.func, ast.Name) and wezel.func.id == "dict"
    ):
        return [(argument.arg, argument.value) for argument in wezel.keywords if argument.arg]
    return _wpisy_ladunku(wezel)


def _jest_logiem(wywolanie: ast.Call) -> bool:
    funkcja = wywolanie.func
    if not (isinstance(funkcja, ast.Attribute) and funkcja.attr in _METODY_LOGU):
        return False
    baza = funkcja.value
    nazwa = (
        baza.id
        if isinstance(baza, ast.Name)
        else baza.attr if isinstance(baza, ast.Attribute) else ""
    )
    return bool(_NAZWA_LOGGERA.search(nazwa.lower()))


def _otoczenie_tekstu(wezel: ast.AST, rodzice: dict[int, ast.AST]) -> str | None:
    """Pierwszy rekord albo wywołanie obejmujące tekst: `wyjasnienie` (rekord z polem
    `wyjasnienie` — tekst leży obok wyjaśnienia), `log` (komunikat dziennika dla operatora,
    nie wynik dla projektanta) albo None."""
    dziecko: ast.AST = wezel
    rodzic = rodzice.get(id(wezel))
    while rodzic is not None and not isinstance(rodzic, ast.stmt):
        if isinstance(rodzic, ast.Dict):
            return "wyjasnienie" if _ma_wyjasnienie(_wpisy_ladunku(rodzic)) else None
        if isinstance(rodzic, ast.Call) and dziecko is not rodzic.func:
            if _jest_logiem(rodzic):
                return "log"
            return "wyjasnienie" if _ma_wyjasnienie(_wpisy_rekordu(rodzic)) else None
        dziecko = rodzic
        rodzic = rodzice.get(id(rodzic))
    return None


def _czesci_tekstu(wezel: ast.AST) -> tuple[list[str], list[ast.expr]] | None:
    """(stałe części, wstawki) wyrażenia SKŁADAJĄCEGO tekst: f-napis, konkatenacja `+`
    z członem tekstowym, formatowanie `%` i `"...".format(...)`; inne węzły — None."""
    if isinstance(wezel, ast.JoinedStr):
        return (
            [
                c.value
                for c in wezel.values
                if isinstance(c, ast.Constant) and isinstance(c.value, str)
            ],
            [c.value for c in wezel.values if isinstance(c, ast.FormattedValue)],
        )
    if isinstance(wezel, ast.BinOp) and isinstance(wezel.op, ast.Add):
        czlony: list[ast.expr] = []

        def splaszcz(wyrazenie: ast.expr) -> None:
            if isinstance(wyrazenie, ast.BinOp) and isinstance(wyrazenie.op, ast.Add):
                splaszcz(wyrazenie.left)
                splaszcz(wyrazenie.right)
            else:
                czlony.append(wyrazenie)

        splaszcz(wezel)
        teksty = [c for c in czlony if isinstance(c, ast.Constant) and isinstance(c.value, str)]
        if not teksty and not any(isinstance(c, ast.JoinedStr) for c in czlony):
            return None
        return (
            [c.value for c in teksty if isinstance(c.value, str)],
            [c for c in czlony if c not in teksty and not isinstance(c, ast.JoinedStr)],
        )
    if (
        isinstance(wezel, ast.BinOp)
        and isinstance(wezel.op, ast.Mod)
        and isinstance(wezel.left, ast.Constant)
        and isinstance(wezel.left.value, str)
    ):
        prawa = wezel.right
        return [wezel.left.value], list(prawa.elts) if isinstance(prawa, ast.Tuple) else [prawa]
    if (
        isinstance(wezel, ast.Call)
        and isinstance(wezel.func, ast.Attribute)
        and wezel.func.attr == "format"
        and isinstance(wezel.func.value, ast.Constant)
        and isinstance(wezel.func.value.value, str)
    ):
        return [wezel.func.value.value], [*wezel.args, *(a.value for a in wezel.keywords)]
    return None


def _wartosc_galezi_py(instrukcje: list[ast.stmt]) -> ast.expr | None:
    """Wartość gałęzi mapy warunkowej: pierwszy bezpośredni `return X`, a bez niego pierwsze
    bezpośrednie przypisanie `y = X` (głębsze instrukcje to logika, nie mapa)."""
    for instrukcja in instrukcje:
        if isinstance(instrukcja, ast.Return):
            return instrukcja.value
    for instrukcja in instrukcje:
        if isinstance(instrukcja, ast.Assign | ast.AnnAssign) and instrukcja.value is not None:
            return instrukcja.value
    return None


#: Węzły z listami instrukcji (`body`/`orelse`/`finalbody`), w których mogą stać ciągi `if`.
_KONTENERY_INSTRUKCJI = (
    ast.Module,
    ast.FunctionDef,
    ast.AsyncFunctionDef,
    ast.ClassDef,
    ast.If,
    ast.For,
    ast.AsyncFor,
    ast.While,
    ast.With,
    ast.AsyncWith,
    ast.Try,
    ast.TryStar,
    ast.ExceptHandler,
    ast.match_case,
)
#: Węzły, które mogą otwierać mapę warunkową (reszta nie tworzy generatora — pomiar czasu).
_OTWIERAJACE_MAPE = (ast.Match, ast.IfExp, *_KONTENERY_INSTRUKCJI)


def _mapy_warunkowe_wezla(
    indeks: IndeksBackendu, info: _Modul, wezel: ast.AST
) -> Iterator[tuple[ast.AST, list[tuple[str, ast.expr]]]]:
    """Mapy „status → wartość” zapisane przepływem sterowania, OTWIERANE tym węzłem: `match`
    z wzorcami-literałami, łańcuch `if`/`elif` i ciąg kolejnych `if` o tym samym podmiocie
    (w listach instrukcji węzła), łańcuch `a if x == "P" else …`."""
    if isinstance(wezel, ast.Match):
        wpisy: list[tuple[str, ast.expr]] = []
        for przypadek in wezel.cases:
            wzorce = (
                przypadek.pattern.patterns
                if isinstance(przypadek.pattern, ast.MatchOr)
                else [przypadek.pattern]
            )
            etykiety = [
                e
                for wzorzec in wzorce
                if isinstance(wzorzec, ast.MatchValue)
                for e in _wartosci_etykiety(indeks, info, wzorzec.value)
            ]
            wartosc = _wartosc_galezi_py(przypadek.body)
            if wartosc is not None:
                wpisy.extend((e, wartosc) for e in etykiety)
        yield wezel, wpisy
    elif isinstance(wezel, ast.IfExp):
        wpisy = []
        podmiot: str | None = None
        biezacy: ast.expr = wezel
        while isinstance(biezacy, ast.IfExp):
            warunek = _warunek_porownania(indeks, info, biezacy.test)
            if warunek is None or (podmiot is not None and warunek[0] != podmiot):
                break
            podmiot = warunek[0]
            wpisy.extend((e, biezacy.body) for e in warunek[1])
            biezacy = biezacy.orelse
        if wpisy:
            yield wezel, wpisy
    if not isinstance(wezel, _KONTENERY_INSTRUKCJI):
        return
    for pole in ("body", "orelse", "finalbody"):
        instrukcje = getattr(wezel, pole, None)
        if not isinstance(instrukcje, list):
            continue
        if isinstance(wezel, ast.If) and pole == "orelse" and len(instrukcje) == 1:
            continue  # `elif` — należy do łańcucha otwartego wyżej
        yield from _mapy_ifow_py(indeks, info, instrukcje)


def _mapy_ifow_py(
    indeks: IndeksBackendu, info: _Modul, instrukcje: list[ast.stmt]
) -> Iterator[tuple[ast.AST, list[tuple[str, ast.expr]]]]:
    """Ciągi kolejnych `if` (z ich łańcuchami `elif`) o tym samym podmiocie porównania."""
    i = 0
    while i < len(instrukcje):
        instrukcja = instrukcje[i]
        if not isinstance(instrukcja, ast.If):
            i += 1
            continue
        wpisy: list[tuple[str, ast.expr]] = []
        podmiot: str | None = None
        j = i
        while j < len(instrukcje) and isinstance(instrukcje[j], ast.If):
            biezacy: ast.stmt | None = instrukcje[j]
            zgodny = False
            while isinstance(biezacy, ast.If):
                warunek = _warunek_porownania(indeks, info, biezacy.test)
                if warunek is None or (podmiot is not None and warunek[0] != podmiot):
                    break
                podmiot, zgodny = warunek[0], True
                wartosc = _wartosc_galezi_py(biezacy.body)
                if wartosc is not None:
                    wpisy.extend((e, wartosc) for e in warunek[1])
                biezacy = biezacy.orelse[0] if len(biezacy.orelse) == 1 else None
            if not zgodny:
                break
            j += 1
        if wpisy:
            yield instrukcja, wpisy
        i = max(j, i + 1)


def _jest_kodem_werdyktu(wartosc: ast.expr) -> bool:
    """Literał w postaci KODU (`pass`, `no_data`, `SPELNIA` — identyfikator jednej wielkości
    liter) należący do słownika werdyktów: mapa na takie wartości tłumaczy słownik statusów na
    inny słownik statusów (enum testu, kod solvera), a nie nadaje etykiety dla człowieka."""
    return (
        isinstance(wartosc, ast.Constant)
        and isinstance(wartosc.value, str)
        and bool(_POSTAC_KODU.fullmatch(wartosc.value))
        and bool(wartosci_werdyktowe([wartosc.value]))
    )


def _ma_wyjasnienie_wartosc(wartosc: ast.expr) -> bool:
    return _ma_wyjasnienie(_wpisy_rekordu(wartosc))


class _LancuchyModulu:
    """Łańcuch symboli węzła modułu z mapą rodziców liczoną leniwie — raz na moduł i tylko
    wtedy, gdy moduł ma trafienie (większość modułów nie ma żadnego)."""

    def __init__(self, info: _Modul) -> None:
        self.info = info
        self._rodzice: dict[int, ast.AST] | None = None

    @property
    def rodzice(self) -> dict[int, ast.AST]:
        if self._rodzice is None:
            self._rodzice = _rodzice(self.info.drzewo)
        return self._rodzice

    def __call__(self, wezel: ast.AST) -> str:
        return _lancuch_py(wezel, self.rodzice, self.info)


def sprawdz_werdykt_poza_rekordem(indeks: IndeksBackendu) -> list[Naruszenie]:
    """Sprawdzenie 6 (backend): 6a ładunek słownikowy, 6b tekst składany, 6c mapa warunkowa
    „status → etykieta” (oraz literał słownika poza rendererami — renderery bada sprawdzenie
    4) — poza pakietem kontraktu `werdykt/`. Wartość obok pola `wyjasnienie` jest dozwolona."""
    naruszenia: list[Naruszenie] = []
    for modul, info in sorted(indeks.moduly.items()):
        if _w_pakiecie_kontraktu(modul):
            continue
        plik = _plik_backendu(info, indeks.korzen)
        lancuch_wezla = _LancuchyModulu(info)
        renderer = _jest_rendererem(info, indeks.korzen)
        for wezel, lokalne in _wezly_z_zasiegiem(info.drzewo):
            # 6a — ładunek słownikowy z kluczem statusu i wartością ze słownika werdyktów.
            wpisy = _wpisy_ladunku(wezel)
            if wpisy and not _ma_wyjasnienie(wpisy):
                for klucz, wartosc in wpisy:
                    # Klucz będący sam wartością słownika (`{"SPELNIA": "pass"}`) to klucz MAPY
                    # (sprawdzenie 6c / 4), nie pole statusu ładunku.
                    if not klucz_werdyktu(klucz) or wartosci_werdyktowe([klucz]):
                        continue
                    trafione = wartosci_werdyktowe(
                        _wartosci_statyczne(indeks, info, wartosc, lokalne=lokalne)
                    )
                    if trafione:
                        lancuch = lancuch_wezla(wartosc)
                        naruszenia.append(
                            Naruszenie(
                                "6a_ladunek_werdyktu",
                                f"{modul}:{lancuch}",
                                plik,
                                wartosc.lineno,
                                f"ładunek słownikowy `{klucz}` z wartością ze słownika werdyktów ("
                                + ", ".join(sorted(trafione))
                                + ") bez rekordu `wyjasnienie` obok",
                                tuple(lancuch.split(".")),
                            )
                        )
            # 6b — tekst SKŁADANY z kodem werdyktu (wersalikami) albo z wstawką-werdyktem.
            czesci = _czesci_tekstu(wezel)
            if czesci is not None:
                stale, wstawki = czesci
                kandydaci = [kod for tekst in stale for kod in kody_werdyktu_wersalikami(tekst)]
                for wstawka in wstawki:
                    for wartosc_wstawki in _wartosci_statyczne(
                        indeks, info, wstawka, lokalne=lokalne
                    ):
                        kandydaci.append(wartosc_wstawki)
                        kandydaci.extend(kody_werdyktu_wersalikami(wartosc_wstawki))
                trafione = wartosci_werdyktowe(kandydaci)
                if trafione and _otoczenie_tekstu(wezel, lancuch_wezla.rodzice) is None:
                    lancuch = lancuch_wezla(wezel)
                    for kod in sorted(trafione):
                        naruszenia.append(
                            Naruszenie(
                                "6b_tekst_werdyktu",
                                f"{modul}:{lancuch}:{kod.upper()}",
                                plik,
                                getattr(wezel, "lineno", 0),
                                f"tekst składany z kodem werdyktu `{kod.upper()}` bez rekordu "
                                "`wyjasnienie` obok — tekst werdyktu składa wyłącznie "
                                "generator `werdykt.wyjasnienie`",
                                (*lancuch.split("."), kod.upper()),
                            )
                        )
            # 6c — mapa warunkowa (przepływ sterowania) otwierana tym węzłem.
            mapy = (
                _mapy_warunkowe_wezla(indeks, info, wezel)
                if isinstance(wezel, _OTWIERAJACE_MAPE)
                else ()
            )
            for mapa, wpisy_mapy in mapy:
                naruszenie = _ocen_mape_py(
                    info, modul, plik, mapa, wpisy_mapy, lancuch_wezla, "przepływ sterowania"
                )
                if naruszenie is not None:
                    naruszenia.append(naruszenie)
            # 6c — literał mapy status → tekst poza rendererami (renderery: sprawdzenie 4).
            if isinstance(wezel, ast.Dict) and not renderer:
                wpisy_mapy = [
                    (tekst, wartosc)
                    for klucz, wartosc in zip(wezel.keys, wezel.values, strict=True)
                    if (tekst := _tekst_klucza_py(info, klucz)) is not None
                ]
                naruszenie = _ocen_mape_py(
                    info, modul, plik, wezel, wpisy_mapy, lancuch_wezla, "literał słownika"
                )
                if naruszenie is not None:
                    naruszenia.append(naruszenie)
    return naruszenia


def _ocen_mape_py(
    info: _Modul,
    modul: str,
    plik: str,
    wezel: ast.AST,
    wpisy: list[tuple[str, ast.expr]],
    lancuch_wezla: Callable[[ast.AST], str],
    postac: str,
) -> Naruszenie | None:
    """Mapa jest mapą etykiet, gdy jej klucze ze słownika werdyktów prowadzą WYŁĄCZNIE do
    tekstu (ta sama definicja tekstu co w sprawdzeniu 4: literał niebędący kodem, f-napis,
    stała z tekstem, rekord z tekstem) — i żaden z tych rekordów nie niesie `wyjasnienie`."""
    trafione = wartosci_werdyktowe(etykieta for etykieta, _ in wpisy)
    if not trafione:
        return None
    wartosci = [w for etykieta, w in wpisy if normalizuj(etykieta) in trafione]
    if not wartosci or not all(_ma_tekst(info, w) for w in wartosci):
        return None
    if all(_ma_wyjasnienie_wartosc(w) for w in wartosci):
        return None
    if all(_jest_kodem_werdyktu(w) for w in wartosci):
        return None  # tłumaczenie słownika na słownik (`SPELNIA` → `pass`), nie etykieta
    lancuch = lancuch_wezla(wezel)
    return Naruszenie(
        "6c_mapa_statusu",
        f"{modul}:{lancuch}",
        plik,
        getattr(wezel, "lineno", 0),
        f"mapa status → tekst ({postac}; klucze: "
        + ", ".join(sorted(trafione))
        + ") poza słownikiem etykiet `werdykt.etykiety`",
        tuple(lancuch.split(".")),
    )


def zmierz(
    backend_src: Path = BACKEND_SRC,
    frontend_src: Path = FRONTEND_SRC,
    migawka: Path = MIGAWKA_OPENAPI,
    modul_typescript: Path = MODUL_TYPESCRIPT,
    indeks: IndeksBackendu | None = None,
    katalog_fixtur: Path | None = None,
) -> list[Naruszenie]:
    """Wszystkie naruszenia drzewa (sześć sprawdzeń), jedno na tożsamość, posortowane.
    Korpus sprawdzenia 5: `katalog_fixtur`; domyślnie `harness-fixtures/generated` pod
    `frontend_src`."""
    if not backend_src.is_dir():
        raise BladSrodowiska(f"brak katalogu backendu: {backend_src}")
    if indeks is None:
        indeks = IndeksBackendu(backend_src)
    wszystkie = [
        *sprawdz_backend(indeks),
        *sprawdz_http(migawka),
        *sprawdz_frontend(frontend_src, modul_typescript),
        *sprawdz_dokumenty(indeks),
        *sprawdz_werdykt_poza_rekordem(indeks),
        *sprawdz_kody_w_tekscie(
            indeks,
            (
                katalog_fixtur
                if katalog_fixtur is not None
                else frontend_src / "harness-fixtures" / "generated"
            ),
        ),
    ]
    unikalne: dict[tuple[str, str], Naruszenie] = {}
    for naruszenie in sorted(wszystkie):
        unikalne.setdefault(naruszenie.klucz, naruszenie)
    return sorted(unikalne.values())


# ---------------------------------------------------------------------------
# Lista dozwolona i zapadka
# ---------------------------------------------------------------------------


def wczytaj_liste(sciezka: Path = LISTA_DOZWOLONA) -> list[dict]:
    """Wpisy listy dozwolonej po walidacji kształtu (błąd kształtu = błąd środowiska)."""
    if not sciezka.is_file():
        raise BladSrodowiska(f"brak listy dozwolonej: {sciezka}")
    try:
        dane = json.loads(sciezka.read_text(encoding="utf-8"))
    except json.JSONDecodeError as blad:
        raise BladSrodowiska(f"lista dozwolona nie jest poprawnym JSON: {blad}") from blad
    wpisy = dane.get("wpisy") if isinstance(dane, dict) else None
    if not isinstance(wpisy, list):
        raise BladSrodowiska("lista dozwolona: brak tablicy `wpisy`")
    bledy: list[str] = []
    widziane: set[tuple[str, str]] = set()
    for numer, wpis in enumerate(wpisy):
        if not isinstance(wpis, dict):
            bledy.append(f"wpis {numer}: nie jest obiektem")
            continue
        sprawdzenie = wpis.get("sprawdzenie")
        tozsamosc = wpis.get("tozsamosc")
        klasa = wpis.get("klasa")
        uzasadnienie = wpis.get("uzasadnienie_pl")
        if sprawdzenie not in SPRAWDZENIA:
            bledy.append(f"wpis {numer}: nieznane sprawdzenie {sprawdzenie!r}")
        if not isinstance(tozsamosc, str) or not tozsamosc:
            bledy.append(f"wpis {numer}: pusta tożsamość")
        if klasa not in KLASY_LISTY:
            bledy.append(f"wpis {numer} ({tozsamosc}): nieznana klasa {klasa!r}")
        if not isinstance(uzasadnienie, str):
            bledy.append(f"wpis {numer} ({tozsamosc}): `uzasadnienie_pl` nie jest tekstem")
        elif klasa == "ENUM_WEWNETRZNY" and not uzasadnienie.strip():
            bledy.append(f"wpis {numer} ({tozsamosc}): ENUM_WEWNETRZNY bez uzasadnienia")
        if "wiersz_inwentarza" not in wpis or not (
            wpis["wiersz_inwentarza"] is None or isinstance(wpis["wiersz_inwentarza"], str)
        ):
            bledy.append(
                f"wpis {numer} ({tozsamosc}): `wiersz_inwentarza` musi być tekstem albo null"
            )
        klucz = (str(sprawdzenie), str(tozsamosc))
        if klucz in widziane:
            bledy.append(f"wpis {numer}: powtórzona tożsamość {sprawdzenie}:{tozsamosc}")
        widziane.add(klucz)
    if bledy:
        raise BladSrodowiska("lista dozwolona jest uszkodzona:\n  " + "\n  ".join(bledy))
    return wpisy


def porownaj_z_lista(
    naruszenia: list[Naruszenie], wpisy: list[dict]
) -> tuple[list[str], list[str]]:
    """(błędy, informacje). Błąd: nowa tożsamość albo wpis MIGRACJA bez naruszenia."""
    lista = {(w["sprawdzenie"], w["tozsamosc"]): w for w in wpisy}
    obecne = {n.klucz for n in naruszenia}
    bledy: list[str] = []
    informacje: list[str] = []
    for naruszenie in naruszenia:
        if naruszenie.klucz not in lista:
            bledy.append(
                f"[nowa-tozsamosc] {naruszenie.sprawdzenie} {naruszenie.tozsamosc} "
                f"({naruszenie.plik}:{naruszenie.linia}) — {naruszenie.opis}"
            )
    for klucz, wpis in sorted(lista.items()):
        if klucz in obecne:
            continue
        if wpis["klasa"] == "MIGRACJA":
            bledy.append(
                f"[zapadka-w-dol] {klucz[0]} {klucz[1]} — naruszenie zniknęło z drzewa: "
                "usuń wpis z listy (zapadka w dół)"
            )
        else:
            informacje.append(
                f"[enum-bez-naruszenia] {klucz[0]} {klucz[1]} — wpis ENUM_WEWNETRZNY "
                "nie odpowiada dziś żadnemu naruszeniu (dozwolony; rozważ usunięcie)"
            )
    return bledy, informacje


# ---------------------------------------------------------------------------
# Inwentarz — propozycja klasy dla `--zmierz`
# ---------------------------------------------------------------------------

_KLASA_INWENTARZA = re.compile(r"\b(MIGRACJA|ENUM_WEWNETRZNY|LEGACY_USUNAC)\b")
_OBSZAR_INWENTARZA = re.compile(r"^## Obszar ([A-E])\b")
_WIERSZ_INWENTARZA = re.compile(r"^(?:\|\s*(\d+)\s*\||\*\*(\d+)\.\*\*|(\d+)\.)\s")
_KOD_W_TEKSCIE = re.compile(r"`([^`]+)`")
_SCIEZKA_W_KODZIE = re.compile(r"[\w$./-]+\.(?:py|tsx|ts)\b")
_SAME_LINIE = re.compile(r"^:[\d,:\- ]+$")
_ZAKRES_LINII = re.compile(r"(\d+)(?:-(\d+))?")
_IDENTYFIKATOR = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
#: Tolerancja dryfu linii inwentarza (stan `ef9f6228`) wobec drzewa bieżącego.
_TOLERANCJA_LINII = 5
#: Nazwy zbyt ogólne, by samodzielnie wiązać naruszenie z wierszem (typy wbudowane, pola statusu).
_SYMBOLE_OGOLNE = frozenset(
    "str bool int float None Any Literal Optional Union Annotated list dict tuple set "
    "status verdict werdykt ok passed overall_status ostrzezenie tone severity istotnosc".split()
)


@dataclass(frozen=True)
class WierszInwentarza:
    identyfikator: str
    klasa: str
    #: (ścieżka względem `backend/src` albo `frontend/src`, zakresy linii)
    odwolania: tuple[tuple[str, tuple[tuple[int, int], ...]], ...]
    symbole: frozenset[str]
    tekst: str

    @property
    def backend(self) -> bool:
        return self.identyfikator[0] in "ABC"


#: Zakres obszaru inwentarza (nagłówki „Obszar A…E") — pierwsze miejsce szukania nazwy pliku.
_ZAKRES_OBSZARU = {
    "A": ("network_model", "solvers", "protection"),
    "B": ("analysis", "compliance", "diagnostics", "solver_input"),
    "C": ("application", "api", "enm", "domain"),
    "D": ("ui2",),
    "E": ("ui", "engine", "types"),
}


class _PlikiDrzewa:
    """Pliki źródłowe obu stron (względem `src`) do rozwiązywania skróconych nazw inwentarza."""

    def __init__(self, backend_src: Path, frontend_src: Path) -> None:
        self.pliki = {
            True: (
                sorted(
                    p.relative_to(backend_src).as_posix()
                    for p in backend_src.rglob("*.py")
                    if "__pycache__" not in p.parts
                )
                if backend_src.is_dir()
                else []
            ),
            False: (
                sorted(
                    p.relative_to(frontend_src).as_posix()
                    for p in frontend_src.rglob("*.ts*")
                    if p.suffix in (".ts", ".tsx") and "node_modules" not in p.parts
                )
                if frontend_src.is_dir()
                else []
            ),
        }

    def jednoznaczny(self, koncowka: str, backend: bool, korzenie: tuple[str, ...]) -> str | None:
        kandydaci = [
            f
            for f in self.pliki[backend]
            if (f == koncowka or f.endswith("/" + koncowka))
            and (not korzenie or f.split("/", 1)[0] in korzenie)
        ]
        return kandydaci[0] if len(kandydaci) == 1 else None


def _sciezka_inwentarza(
    surowa: str, backend: bool, obszar: str, kontekst: dict[bool, str], drzewo: _PlikiDrzewa
) -> str:
    """Ścieżka z inwentarza → względem `src`. Inwentarz skraca kolejne odwołania (sama nazwa
    pliku albo końcówka ścieżki); rozwiązanie: zakres obszaru, potem katalog z kontekstu wiersza
    (nazwy powtarzalne: `model.ts`, `types.ts`), potem cała strona — tylko gdy wynik jest
    jednoznaczny w bieżącym drzewie."""
    sciezka = surowa.replace("$S/", "").replace("$UI2/", "ui2/")
    sciezka = re.sub(r"^(\.\.\./)+", "", sciezka)
    for prefiks in ("backend/src/", "frontend/src/"):
        if sciezka.startswith(prefiks):
            sciezka = sciezka[len(prefiks) :]
    proby = [(sciezka, _ZAKRES_OBSZARU[obszar])]
    if "/" not in sciezka and kontekst.get(backend):
        proby.append((f"{kontekst[backend]}/{sciezka}", ()))
    proby.append((sciezka, ()))
    for koncowka, korzenie in proby:
        pelna = drzewo.jednoznaczny(koncowka, backend, korzenie)
        if pelna is not None:
            sciezka = pelna
            break
    if "/" in sciezka:
        kontekst[backend] = sciezka.rsplit("/", 1)[0]
    return sciezka


def _zakresy(tekst: str) -> tuple[tuple[int, int], ...]:
    return tuple(
        (int(poczatek), int(koniec or poczatek))
        for poczatek, koniec in _ZAKRES_LINII.findall(tekst)
    )


def _odwolania_linii(
    kody: list[str],
    obszar: str,
    kontekst: dict[bool, str],
    drzewo: _PlikiDrzewa,
    domyslne: list[list],
) -> list[list]:
    """Odwołania `[ścieżka, [zakresy]]` z segmentów kodu jednej linii (tylko pliki strony)."""
    backend = obszar in "ABC"
    odwolania: list[list] = []
    ostatnie: list | None = None
    for kod in kody:
        trafienia = list(_SCIEZKA_W_KODZIE.finditer(kod))
        if not trafienia:
            if _SAME_LINIE.match(kod.strip()):
                cel = ostatnie if ostatnie is not None else (domyslne[0] if domyslne else None)
                if cel is not None:
                    if cel not in odwolania:
                        cel = [cel[0], list(cel[1])]
                        odwolania.append(cel)
                        ostatnie = cel
                    cel[1].extend(_zakresy(kod))
            continue
        for numer, trafienie in enumerate(trafienia):
            surowa = trafienie.group(0)
            if surowa.endswith(".py") != backend:
                continue
            koniec = trafienia[numer + 1].start() if numer + 1 < len(trafienia) else len(kod)
            reszta = kod[trafienie.end() : koniec]
            wpis = [
                _sciezka_inwentarza(surowa, backend, obszar, kontekst, drzewo),
                list(_zakresy(reszta)) if reszta.startswith(":") else [],
            ]
            odwolania.append(wpis)
            ostatnie = wpis
    return odwolania


def wczytaj_inwentarz(
    sciezka: Path = INWENTARZ,
    backend_src: Path = BACKEND_SRC,
    frontend_src: Path = FRONTEND_SRC,
) -> list[WierszInwentarza]:
    """Wiersze inwentarza: numer, klasa (ostatnie wystąpienie w wierszu), odwołania, symbole.

    Wiersz bez własnego pliku swojej strony (np. `:45` pod nagłówkiem sekcji z plikiem
    `v126_academic.py`) dziedziczy plik z nagłówka sekcji.
    """
    if not sciezka.is_file():
        return []
    drzewo = _PlikiDrzewa(backend_src, frontend_src)
    wiersze: list[WierszInwentarza] = []
    obszar = ""
    kontekst: dict[bool, str] = {}
    naglowek: list[list] = []
    for linia in sciezka.read_text(encoding="utf-8").splitlines():
        obszar_linii = _OBSZAR_INWENTARZA.match(linia)
        if obszar_linii:
            obszar = obszar_linii.group(1)
            naglowek = []
            continue
        if not obszar:
            continue
        kody = _KOD_W_TEKSCIE.findall(linia)
        if linia.startswith("### "):
            naglowek = _odwolania_linii(kody, obszar, kontekst, drzewo, [])
            continue
        numer = _WIERSZ_INWENTARZA.match(linia)
        klasy = _KLASA_INWENTARZA.findall(linia)
        if numer is None or not klasy:
            continue
        odwolania = _odwolania_linii(kody, obszar, kontekst, drzewo, naglowek)
        if not odwolania:
            odwolania = [[s, list(z)] for s, z in naglowek]
        if not odwolania:
            continue
        symbole = frozenset(
            identyfikator
            for kod in kody
            for identyfikator in _IDENTYFIKATOR.findall(_SCIEZKA_W_KODZIE.sub(" ", kod))
        )
        wiersze.append(
            WierszInwentarza(
                identyfikator=f"{obszar}{next(g for g in numer.groups() if g)}",
                klasa=klasy[-1],
                odwolania=tuple((s, tuple(z)) for s, z in odwolania),
                symbole=symbole,
                tekst=re.sub(r"\s+", " ", linia.strip().strip("|")).strip(),
            )
        )
    return wiersze


def _plik_zrodlowy(plik: str) -> str:
    for prefiks in ("backend/src/", "frontend/src/"):
        if plik.startswith(prefiks):
            return plik[len(prefiks) :]
    return plik


def _pasuje_plik(plik: str, sciezka: str) -> bool:
    if "/" not in sciezka:
        return plik.rsplit("/", 1)[-1] == sciezka
    return plik == sciezka or plik.endswith("/" + sciezka)


def _sila_dopasowania(
    plik: str, linia: int, symbole: tuple[str, ...], wiersz: WierszInwentarza
) -> int:
    """0 — inny plik; 1 — ten plik; 2 — linia w zakresie wiersza albo nazwa pola; 3 — symbol
    swoisty (klasa, typ pola, funkcja, nazwa mapy) wymieniony w wierszu."""
    zakresy = [z for s, z in wiersz.odwolania if _pasuje_plik(plik, s)]
    if not zakresy:
        return 0
    sila = 1
    if linia and any(
        a - _TOLERANCJA_LINII <= linia <= b + _TOLERANCJA_LINII for z in zakresy for a, b in z
    ):
        sila = 2
    if any(s in wiersz.symbole for s in symbole if s in _SYMBOLE_OGOLNE):
        sila = max(sila, 2)
    if any(s in wiersz.symbole for s in symbole if s not in _SYMBOLE_OGOLNE):
        sila = 3
    return sila


def zaproponuj_klase(
    naruszenie: Naruszenie,
    wiersze: list[WierszInwentarza],
    pliki_klas: dict[str, str] | None = None,
) -> tuple[str, str, str | None]:
    """(klasa, uzasadnienie_pl, wiersz_inwentarza) — dopasowanie po pliku i symbolu.

    ENUM_WEWNETRZNY wyłącznie przy dopasowaniu co najmniej po linii albo symbolu do wiersza
    ENUM_WEWNETRZNY; przy remisie wygrywa MIGRACJA (kierunek zachowawczy). Pakiet `werdykt/`
    (implementacja kontraktu) — ENUM_WEWNETRZNY z uzasadnieniem roli w silniku oceny.
    """
    if naruszenie.tozsamosc.startswith("werdykt."):
        return (
            "ENUM_WEWNETRZNY",
            "Typ pomocniczy implementacji kontraktu (`werdykt/`): status maszynowy wewnątrz "
            "silnika oceny, z którego powstaje rekord kanoniczny z wyjaśnieniem (reguła decyzji "
            "§2.2/§2.3) — nie jest powierzchnią dla człowieka.",
            None,
        )
    plik = _plik_zrodlowy(naruszenie.plik)
    linia = naruszenie.linia
    if naruszenie.sprawdzenie == "2_http":
        plik = (pliki_klas or {}).get(naruszenie.symbole[0], "") if naruszenie.symbole else ""
        linia = 0
    backend = naruszenie.sprawdzenie == "2_http" or naruszenie.plik.startswith("backend/")
    najlepszy: tuple[int, bool, WierszInwentarza] | None = None
    for wiersz in wiersze:
        if wiersz.backend != backend or not plik:
            continue
        sila = _sila_dopasowania(plik, linia, naruszenie.symbole, wiersz)
        if sila == 0:
            continue
        klucz = (sila, wiersz.klasa != "ENUM_WEWNETRZNY")
        if najlepszy is None or klucz > najlepszy[:2]:
            najlepszy = (*klucz, wiersz)
    if najlepszy is None:
        return (
            "MIGRACJA",
            "Stan zastany spoza inwentarza 2026-09-23 (miejsce nieznane inwentarzowi).",
            None,
        )
    sila, _, wiersz = najlepszy
    if sila == 1:
        return (
            "MIGRACJA",
            f"Stan zastany; inwentarz {wiersz.identyfikator} opisuje ten plik, nie ten symbol.",
            f"{wiersz.identyfikator} (dopasowanie po pliku)",
        )
    if wiersz.klasa == "ENUM_WEWNETRZNY":
        return (
            "ENUM_WEWNETRZNY",
            f"Inwentarz {wiersz.identyfikator}: {wiersz.tekst}",
            wiersz.identyfikator,
        )
    powod = "kasacja (fala WW-0)" if wiersz.klasa == "LEGACY_USUNAC" else "migracja (plan §8)"
    return (
        "MIGRACJA",
        f"Stan zastany; inwentarz {wiersz.identyfikator} ({wiersz.klasa}): {powod}.",
        wiersz.identyfikator,
    )


def pliki_klas_backendu(indeks: IndeksBackendu) -> dict[str, str]:
    """Nazwa klasy → plik (względem `backend/src`) dla klas o nazwie jednoznacznej w drzewie."""
    wystapienia: dict[str, set[str]] = {}
    for info in indeks.moduly.values():
        for nazwa in info.klasy:
            wystapienia.setdefault(nazwa, set()).add(
                info.sciezka.relative_to(indeks.korzen).as_posix()
            )
    return {nazwa: pliki.pop() for nazwa, pliki in wystapienia.items() if len(pliki) == 1}


def lista_z_pomiaru(
    naruszenia: list[Naruszenie],
    dotychczasowe: list[dict],
    wiersze: list[WierszInwentarza],
    pliki_klas: dict[str, str] | None = None,
) -> list[dict]:
    """Lista z pomiaru; tożsamość obecna na liście zachowuje klasę i uzasadnienie."""
    stare = {(w["sprawdzenie"], w["tozsamosc"]): w for w in dotychczasowe}
    wpisy: list[dict] = []
    for naruszenie in naruszenia:
        poprzedni = stare.get(naruszenie.klucz)
        if poprzedni is not None:
            klasa = poprzedni["klasa"]
            uzasadnienie = poprzedni["uzasadnienie_pl"]
            wiersz = poprzedni.get("wiersz_inwentarza")
        else:
            klasa, uzasadnienie, wiersz = zaproponuj_klase(naruszenie, wiersze, pliki_klas)
        wpisy.append(
            {
                "sprawdzenie": naruszenie.sprawdzenie,
                "tozsamosc": naruszenie.tozsamosc,
                "klasa": klasa,
                "uzasadnienie_pl": uzasadnienie,
                "wiersz_inwentarza": wiersz,
            }
        )
    return wpisy


def zapisz_liste(wpisy: list[dict], sciezka: Path = LISTA_DOZWOLONA) -> None:
    dane = {
        "opis": (
            "Lista dozwolona strażnika werdyktu wyjaśnialnego (kontrakt §12). Klucz: sprawdzenie "
            "+ tożsamość. MIGRACJA — stan zastany, może tylko maleć (wpis bez naruszenia = "
            "czerwony guard); ENUM_WEWNETRZNY — status maszynowy dozwolony z uzasadnieniem. "
            "Lista jest POMIAREM drzewa (`--zmierz --zapisz`), nie decyzją."
        ),
        "wpisy": sorted(wpisy, key=lambda w: (w["sprawdzenie"], w["tozsamosc"])),
    }
    sciezka.write_text(json.dumps(dane, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Wejście
# ---------------------------------------------------------------------------


def _podsumowanie(naruszenia: list[Naruszenie]) -> str:
    liczby = {s: 0 for s in SPRAWDZENIA}
    for naruszenie in naruszenia:
        liczby[naruszenie.sprawdzenie] += 1
    return ", ".join(f"{s}={liczby[s]}" for s in SPRAWDZENIA)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Strażnik kontraktu werdyktu wyjaśnialnego (§12).")
    parser.add_argument("--zmierz", action="store_true", help="wypisz wszystkie naruszenia drzewa")
    parser.add_argument(
        "--zapisz", action="store_true", help="z --zmierz: zapisz listę dozwoloną z pomiaru"
    )
    argumenty = parser.parse_args(sys.argv[1:] if argv is None else argv)
    start = time.monotonic()
    try:
        indeks = IndeksBackendu(BACKEND_SRC) if BACKEND_SRC.is_dir() else None
        naruszenia = zmierz(indeks=indeks)
        if argumenty.zmierz:
            try:
                dotychczasowe = wczytaj_liste()
            except BladSrodowiska:
                dotychczasowe = []
            wiersze = wczytaj_inwentarz()
            pliki_klas = pliki_klas_backendu(indeks) if indeks is not None else {}
            wpisy = lista_z_pomiaru(naruszenia, dotychczasowe, wiersze, pliki_klas)
            print(f"werdykt_wyjasnialny_guard --zmierz: {len(naruszenia)} kandydatów listy")
            print(f"  per sprawdzenie: {_podsumowanie(naruszenia)}")
            klasy = {k: sum(1 for w in wpisy if w["klasa"] == k) for k in KLASY_LISTY}
            print("  per klasa (propozycja): " + ", ".join(f"{k}={v}" for k, v in klasy.items()))
            print(f"  wiersze inwentarza wczytane: {len(wiersze)}")
            for naruszenie, wpis in zip(naruszenia, wpisy, strict=True):
                wiersz = wpis["wiersz_inwentarza"] or "spoza inwentarza"
                print(
                    f"  [{naruszenie.sprawdzenie}] {naruszenie.tozsamosc} "
                    f"({naruszenie.plik}:{naruszenie.linia}) — {naruszenie.opis} "
                    f"— propozycja: {wpis['klasa']} [{wiersz}]"
                )
            if argumenty.zapisz:
                zapisz_liste(wpisy)
                print(f"  zapisano {_sciezka_wzgledna(LISTA_DOZWOLONA)} ({len(wpisy)} wpisów)")
            print(f"  czas biegu: {time.monotonic() - start:.1f} s")
            return 0
        wpisy = wczytaj_liste()
    except BladSrodowiska as blad:
        print(f"werdykt_wyjasnialny_guard: BŁĄD ŚRODOWISKA: {blad}", file=sys.stderr)
        return 2

    bledy, informacje = porownaj_z_lista(naruszenia, wpisy)
    klasy = {k: sum(1 for w in wpisy if w["klasa"] == k) for k in KLASY_LISTY}
    print(
        f"werdykt_wyjasnialny_guard: {len(naruszenia)} naruszeń w drzewie ({_podsumowanie(naruszenia)}); "
        f"lista: {len(wpisy)} wpisów (" + ", ".join(f"{k}={v}" for k, v in klasy.items()) + ")"
    )
    for informacja in informacje:
        print("  " + informacja)
    print(f"  czas biegu: {time.monotonic() - start:.1f} s")
    if bledy:
        print("NARUSZENIA KONTRAKTU WERDYKTU WYJAŚNIALNEGO:", file=sys.stderr)
        for blad in bledy:
            print("  " + blad, file=sys.stderr)
        print(
            f"\n{len(bledy)} błędów. Nowa tożsamość: dołącz do rekordu `WyjasnienieWerdyktu` "
            "(albo użyj typu kanonicznego `OcenaKryterium`/`WynikWymagania`); enum wewnętrzny "
            "wymaga wpisu ENUM_WEWNETRZNY z uzasadnieniem. Zniknięte naruszenie MIGRACJA: usuń "
            "wpis z listy w tym samym commicie (zapadka w dół).",
            file=sys.stderr,
        )
        return 1
    print("OK: brak nowych tożsamości z lakonicznym werdyktem; zapadka zgodna z pomiarem.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
