"""Kody certyfikatu PTPiREE mają treść, nawigację i CEL na froncie (karta P2).

Wzorzec przejęty z `test_rejestr_kodow_bram_katalogowych.py` (karta W4) i z tego
samego powodu: ręczna lista kodów jest dokładnie tym mechanizmem, który dług
wytwarza — ktoś dopisuje kod emisji, nikt nie dopisuje wpisu w rejestrze ani w
mapie celów, a projektant dostaje goły identyfikator bez zdania po polsku i bez
wskazania, gdzie to naprawić. Dlatego zbiór kodów jest WYPROWADZANY Z KODU (skan
AST), a nie wpisany tutaj z palca.

DWA ROZŁĄCZNE KANAŁY O TYM SAMYM PRZEDROSTKU — ustalenie z inwentarza karty P2.
Przestrzeń nazw `der.` niesie w backendzie DWA różne rodzaje komunikatu i mylenie
ich byłoby fabrykacją długu tam, gdzie go nie ma:

  1. KANAŁ GOTOWOŚCI (`enm/domain_operations.py`) — wpisy trafiające do
     `readiness.warnings`/`blockers` i dalej na ekran gotowości. Tylko one
     wymagają wpisu w `READINESS_CODES` i w mapie celów frontu, bo tylko one
     pokazują się projektantowi jako brak do naprawienia.
  2. KANAŁ BŁĘDU OPERACJI (`enm/domain_operations_v2.py`) — kody odrzucenia
     operacji kreatora DER, oddawane w `result["error"]` razem ze zdaniem po
     polsku W TYM SAMYM wywołaniu (np. „Tor DER-SN wymaga wskazania szyny SN
     stacji"). Operacja się NIE WYKONUJE, więc nie ma czego pokazywać w torze
     gotowości i wpis w rejestrze gotowości byłby wpisem o zdarzeniu, które
     nigdy do niego nie trafia.

Rozdział kanałów nie jest tu deklaracją na słowo honoru — pilnuje go
`test_kody_der_kreatora_naleza_do_kanalu_bledu_operacji`. Gdyby kreator zaczął
emitować kod gotowości, test wskaże to miejsce zamiast przepuścić kod bez treści.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest
from domain.canonical_operations import READINESS_CODES, ReadinessArea, ReadinessLevel

_KORZEN_BACKENDU = Path(__file__).resolve().parents[2]
_SRC = _KORZEN_BACKENDU / "src"
_MAPA_CELOW_FRONTU = (
    _KORZEN_BACKENDU.parent
    / "frontend"
    / "src"
    / "ui2"
    / "spaces"
    / "gotowosc"
    / "grupowanieCelow.ts"
)

#: Moduł, w którym powstaje sygnał gotowości (`_build_readiness`).
_MODUL_GOTOWOSCI = "enm/domain_operations.py"

#: Moduł operacji kreatora DER — kanał błędu operacji, nie gotowości.
_MODUL_KREATORA = "enm/domain_operations_v2.py"

_WZOR_KODU = re.compile(r"^der\.[a-z0-9_]+$")

#: Cel, pod którym oba kody muszą się pokazać. Skutkiem braku (albo warunkowego)
#: powiązania certyfikatu jest ryzyko odrzucenia WNIOSKU przez OSD, a nie błąd
#: obliczeń rozpływowych — mimo obszaru GENERATORS w rejestrze.
_OCZEKIWANY_CEL = "wniosekOsd"


def _drzewo(wzgledna: str) -> ast.Module:
    return ast.parse((_SRC / wzgledna).read_text(encoding="utf-8"))


def _kody_der(wzgledna: str) -> set[str]:
    """Literały `der.<nazwa>` modułu — dopasowanie DOKŁADNE całego literału.

    Proza dokumentacyjna nie wchodzi (docstring to jeden długi literał),
    komentarzy w AST nie ma.
    """
    return {
        wezel.value
        for wezel in ast.walk(_drzewo(wzgledna))
        if isinstance(wezel, ast.Constant)
        and isinstance(wezel.value, str)
        and _WZOR_KODU.match(wezel.value)
    }


def _kody_kanalu_bledu(wzgledna: str) -> set[str]:
    """Kody oddawane jako BŁĄD OPERACJI: `_error_response(...)` albo `context_code=`."""
    kody: set[str] = set()
    for wezel in ast.walk(_drzewo(wzgledna)):
        if not isinstance(wezel, ast.Call):
            continue
        nazwa = wezel.func.id if isinstance(wezel.func, ast.Name) else None
        pozycyjne = wezel.args if nazwa == "_error_response" else []
        nazwane = [kw.value for kw in wezel.keywords if kw.arg == "context_code"]
        for arg in [*pozycyjne, *nazwane]:
            if (
                isinstance(arg, ast.Constant)
                and isinstance(arg.value, str)
                and _WZOR_KODU.match(arg.value)
            ):
                kody.add(arg.value)
    return kody


def _mapa_celow_frontu() -> dict[str, str]:
    """Wpisy DOKŁADNE `der.*` czytane z pliku mapy, nie z kopii listy."""
    tresc = _MAPA_CELOW_FRONTU.read_text(encoding="utf-8")
    return dict(re.findall(r"^\s*'(der\.[a-z0-9_]+)':\s*'([a-zA-Z]+)'", tresc, re.MULTILINE))


def test_inwentarz_kanalu_gotowosci_nie_jest_pusty() -> None:
    """Bezpiecznik: pusty skan udawałby zieloną bramkę (fail-closed)."""
    kody = _kody_der(_MODUL_GOTOWOSCI)
    assert kody >= {
        "der.inverter_certificate_unlinked",
        "der.inverter_certificate_conditional",
    }, f"skan toru gotowosci zgubil kody certyfikatu PTPiREE: {sorted(kody)}"


@pytest.mark.parametrize("kod", sorted(_kody_der(_MODUL_GOTOWOSCI)))
def test_kazdy_kod_ma_wpis_w_kanonicznym_rejestrze(kod: str) -> None:
    assert kod in READINESS_CODES, (
        f"kod '{kod}' nie ma wpisu w READINESS_CODES — projektant dostanie goly "
        f"kod bez zdania po polsku i bez nawigacji naprawczej"
    )


@pytest.mark.parametrize("kod", sorted(_kody_der(_MODUL_GOTOWOSCI)))
def test_kazdy_kod_ma_opis_obszar_poziom_i_nawigacje(kod: str) -> None:
    """Wpis bez treści byłby rejestracją na papierze — kod nadal nic nie mówi."""
    spec = READINESS_CODES[kod]
    assert spec.area is ReadinessArea.GENERATORS, f"{kod}: certyfikat DER poza obszarem GENERATORS"
    assert spec.level is ReadinessLevel.WARNING, (
        f"{kod}: to OSTRZEZENIE — manifest katalogu PTPiREE mowi, ze ostateczna "
        f"akceptacja przylaczeniowa pozostaje po stronie wlasciwego OSD"
    )
    assert len(spec.message_pl) > 20, f"{kod}: opis za krotki, zeby cokolwiek wyjasnic"
    assert spec.fix_navigation, f"{kod}: brak nawigacji naprawczej"
    assert spec.fix_navigation.get("panel"), f"{kod}: nawigacja bez wskazania panelu"


@pytest.mark.parametrize("kod", sorted(_kody_der(_MODUL_GOTOWOSCI)))
def test_kazdy_kod_ma_cel_dokladny_na_froncie(kod: str) -> None:
    """Wpis DOKŁADNY, nie fallback prefiksu.

    Prefiks `der` nie ma fallbacku w mapie, więc kod bez wpisu wpadłby do
    „Pozostałe" — widoczny, ale oderwany od celu inżyniera.
    """
    mapa = _mapa_celow_frontu()
    assert kod in mapa, f"kod '{kod}' nie ma wpisu dokladnego w grupowanieCelow.ts"
    assert mapa[kod] == _OCZEKIWANY_CEL, (
        f"kod '{kod}' prowadzi do celu '{mapa[kod]}', a certyfikat PTPiREE jest "
        f"bramka pakietu przylaczeniowego ('{_OCZEKIWANY_CEL}')"
    )


def test_mapa_celow_frontu_nie_ma_sierot_w_przestrzeni_der() -> None:
    """Front nie deklaruje obsługi kodów, których tor gotowości nie zgłasza."""
    sieroty = sorted(set(_mapa_celow_frontu()) - _kody_der(_MODUL_GOTOWOSCI))
    assert sieroty == [], f"mapa celow opisuje kody `der.` bez emitera gotowosci: {sieroty}"


def test_kody_der_kreatora_naleza_do_kanalu_bledu_operacji() -> None:
    """Rozdział kanałów jest SPRAWDZANY, nie deklarowany (CLAUDE.md pkt 4).

    Każdy kod `der.*` kreatora musi być oddawany jako błąd operacji. Kod, który
    wyszedłby z tego wzorca, byłby albo nowym sygnałem gotowości bez wpisu w
    rejestrze, albo martwym literałem — jedno i drugie warto zobaczyć od razu.
    """
    wszystkie = _kody_der(_MODUL_KREATORA)
    assert wszystkie, "skan kreatora DER nie znalazl zadnego kodu — wzorzec sie rozjechal"
    poza_kanalem = sorted(wszystkie - _kody_kanalu_bledu(_MODUL_KREATORA))
    assert poza_kanalem == [], (
        f"kody `der.` kreatora poza kanalem bledu operacji: {poza_kanalem}. "
        f"Jesli to sygnal GOTOWOSCI, wymaga wpisu w READINESS_CODES i w mapie celow."
    )


def test_kanaly_der_sa_rozlaczne() -> None:
    """Ten sam kod w obu kanałach znaczyłby dwie różne rzeczy pod jedną nazwą."""
    wspolne = sorted(_kody_der(_MODUL_GOTOWOSCI) & _kody_der(_MODUL_KREATORA))
    assert wspolne == [], f"kod `der.` uzyty w obu kanalach naraz: {wspolne}"
