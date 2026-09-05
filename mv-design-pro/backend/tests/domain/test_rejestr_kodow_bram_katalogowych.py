"""Kody bram katalogowych MAJĄ opis i nawigację naprawczą (karta W4).

DŁUG ZAMKNIĘTY (nazwany w V12K-317 poz. 8). `catalog.item_not_found` — po
ujednoliceniu parytetu torów (V12K-307/315/316) JEDYNY kod złej referencji
katalogowej — nie był zarejestrowany ani w kanonicznym rejestrze
`READINESS_CODES`, ani w mapie celów frontu. Projektant dostawał goły kod: bez
zdania po polsku i bez wskazania, gdzie to naprawić.

REGUŁA KLASA, NIE INSTANCJA (CLAUDE.md). Inwentarz przed naprawą pokazał, że
`item_not_found` był PRÓBKĄ, nie całym zbiorem: bramy katalogowe emitują
SIEDEMNAŚCIE kodów spoza rejestru. Dlatego test nie sprawdza jednego kodu, tylko
zbiór wyprowadzony Z KODU (skan AST modułów bram) — nowy kod bramy bez wpisu
zapala regresję, zamiast po cichu dołączyć do długu.

Dlaczego skan AST, a nie ręczna lista: ręczna lista jest dokładnie tym
mechanizmem, który dług wytworzył (ktoś dopisuje kod, nikt nie dopisuje wpisu).
Literał dopasowywany DOKŁADNIE wzorcem `catalog.<nazwa>` nie łapie prozy
dokumentacyjnej (docstring to jeden długi literał), a komentarzy w AST nie ma.
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

#: Moduły, w których żyją bramy katalogowe — brama API, brama końcówki, obie
#: bramy domenowe i kanoniczny materializator, z którego bramy czytają wynik.
MODULY_BRAM_KATALOGOWYCH = (
    "api/domain_ops_policy.py",
    "api/enm.py",
    "enm/domain_operations.py",
    "enm/domain_operations_v2.py",
    "network_model/catalog/materialization.py",
)

#: Moduły, które SĄ rejestrem treści — ich własne literały opisują kod, a nie go
#: emitują (ta sama zasada, co w `scripts/readiness_consumption_guard.py`).
_MODULY_REJESTRU = ("domain/canonical_operations.py", "domain/readiness_bridge.py")

_WZOR_KODU = re.compile(r"^catalog\.[a-z0-9_]+$")


def _kody_z_modulu(wzgledna: str) -> set[str]:
    plik = _SRC / wzgledna
    drzewo = ast.parse(plik.read_text(encoding="utf-8"))
    return {
        wezel.value
        for wezel in ast.walk(drzewo)
        if isinstance(wezel, ast.Constant)
        and isinstance(wezel.value, str)
        and _WZOR_KODU.match(wezel.value)
    }


def kody_bram_katalogowych() -> set[str]:
    """Kody `catalog.*` emitowane przez bramy — czytane Z KODU, nie z listy."""
    kody: set[str] = set()
    for wzgledna in MODULY_BRAM_KATALOGOWYCH:
        kody |= _kody_z_modulu(wzgledna)
    return kody


def kody_emitowane_w_backendzie() -> set[str]:
    """Wszystkie kody `catalog.*` emitowane gdziekolwiek poza rejestrem treści."""
    kody: set[str] = set()
    for plik in _SRC.rglob("*.py"):
        wzgledna = str(plik.relative_to(_SRC)).replace("\\", "/")
        if wzgledna in _MODULY_REJESTRU:
            continue
        try:
            drzewo = ast.parse(plik.read_text(encoding="utf-8"))
        except SyntaxError:  # pragma: no cover - plik niekompilowalny to inny defekt
            continue
        kody |= {
            wezel.value
            for wezel in ast.walk(drzewo)
            if isinstance(wezel, ast.Constant)
            and isinstance(wezel.value, str)
            and _WZOR_KODU.match(wezel.value)
        }
    return kody


def _mapa_celow_frontu() -> set[str]:
    """Kody `catalog.*` wypisane WPROST w mapie celów frontu.

    Czytamy plik źródłowy, a nie kopię listy — inaczej test pilnowałby własnej
    kopii, a nie tego, co widzi projektant.
    """
    tresc = _MAPA_CELOW_FRONTU.read_text(encoding="utf-8")
    return set(re.findall(r"^\s*'(catalog\.[a-z0-9_]+)':\s*'", tresc, re.MULTILINE))


# ---------------------------------------------------------------------------
# Klasa: każdy kod bramy ma opis i nawigację
# ---------------------------------------------------------------------------


def test_inwentarz_bram_nie_jest_pusty() -> None:
    """Bezpiecznik testu: pusty skan udawałby zieloną bramkę (fail-closed)."""
    kody = kody_bram_katalogowych()
    assert len(kody) >= 15, f"skan bram dał podejrzanie mało kodów: {sorted(kody)}"
    assert "catalog.item_not_found" in kody, "kod z długu V12K-317 zniknął ze skanu bram"


@pytest.mark.parametrize("kod", sorted(kody_bram_katalogowych()))
def test_kazdy_kod_bramy_ma_wpis_w_kanonicznym_rejestrze(kod: str) -> None:
    assert kod in READINESS_CODES, (
        f"kod bramy katalogowej '{kod}' nie ma wpisu w READINESS_CODES — projektant "
        f"dostanie goły kod bez zdania po polsku i bez nawigacji naprawczej"
    )


@pytest.mark.parametrize("kod", sorted(kody_bram_katalogowych()))
def test_kazdy_kod_bramy_ma_opis_obszar_i_nawigacje(kod: str) -> None:
    """Wpis bez treści byłby rejestracją na papierze — kod nadal nic nie mówi."""
    spec = READINESS_CODES[kod]
    assert spec.area is ReadinessArea.CATALOGS, f"{kod}: brama katalogowa poza obszarem CATALOGS"
    assert spec.level is ReadinessLevel.BLOCKER, f"{kod}: brama zatrzymuje operację, to blokada"
    assert len(spec.message_pl) > 20, f"{kod}: opis za krótki, żeby cokolwiek wyjaśnić"
    assert spec.fix_navigation, f"{kod}: brak nawigacji naprawczej"
    assert spec.fix_navigation.get("panel"), f"{kod}: nawigacja bez wskazania panelu"


@pytest.mark.parametrize("kod", sorted(kody_bram_katalogowych()))
def test_kazdy_kod_bramy_jest_w_mapie_celow_frontu(kod: str) -> None:
    """Wpis DOKŁADNY, nie fallback prefiksu: fallback grupuje milcząco, więc kod
    spoza rejestru wyglądałby na obsłużony, choć nikt go nie rozpoznał."""
    assert (
        kod in _mapa_celow_frontu()
    ), f"kod bramy katalogowej '{kod}' nie ma wpisu dokładnego w grupowanieCelow.ts"


def test_zaden_kod_catalog_emitowany_w_backendzie_nie_zostaje_poza_rejestrem() -> None:
    """Szersza soczewka niż same bramy — cała przestrzeń nazw `catalog.`.

    Gdyby kod tej przestrzeni powstał poza wymienionymi modułami bram, dług
    wróciłby tą samą drogą, tylko w innym pliku.
    """
    poza_rejestrem = sorted(kody_emitowane_w_backendzie() - set(READINESS_CODES))
    assert poza_rejestrem == [], (
        "kody przestrzeni `catalog.` emitowane bez wpisu w READINESS_CODES: " f"{poza_rejestrem}"
    )


def test_mapa_celow_frontu_nie_ma_sierot() -> None:
    """Mapa nie opisuje kodów, których backend nie zna — inaczej front deklaruje
    obsługę czegoś, czego nikt nie zgłasza."""
    sieroty = sorted(_mapa_celow_frontu() - set(READINESS_CODES) - kody_emitowane_w_backendzie())
    assert sieroty == [], f"mapa celów opisuje kody bez emitera i bez rejestru: {sieroty}"
