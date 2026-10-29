"""Parytet zbiorów rodzajów aparatu pola backend ↔ schemat SLD (karta UX-04/POLE-LINIOWE-WZORZEC).

Schemat nie ma własnej definicji „co jest łącznikiem pola", „który łącznik leży w torze",
„które położenie odcina tor" ani „jakie porty ma aparat": czyta lustro
`frontend/src/ui/sld/v3/compose/rodzajeAparatuPola.ts`. Test parsuje ten plik i porównuje
każdy zbiór z jedynym źródłem w backendzie (`network_model.catalog.rodzaje_aparatury`) —
zmiana po jednej stronie czerwieni test (predykat ramki SCADA i reguła blokad z jednego
źródła, reguła KLASA §3).
"""

from __future__ import annotations

import re
from pathlib import Path

from network_model.catalog import rodzaje_aparatury as ra

LUSTRO = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "src"
    / "ui"
    / "sld"
    / "v3"
    / "compose"
    / "rodzajeAparatuPola.ts"
)


def _zrodlo() -> str:
    return LUSTRO.read_text(encoding="utf-8")


def _napisy_literalu(nazwa: str, zrodlo: str) -> list[str]:
    """Napisy w literale tablicy/zbioru przypisanym do stałej `nazwa`."""
    m = re.search(rf"export const {nazwa}\b[^=]*=\s*(?:new Set<[^>]*>\()?\[(.*?)\]", zrodlo, re.S)
    assert m, f"brak deklaracji {nazwa} w lustrze frontu"
    return re.findall(r"'([^']+)'", m.group(1))


def _stala_napisowa(nazwa: str, zrodlo: str) -> str:
    m = re.search(rf"export const {nazwa}\b[^=]*=\s*'([^']+)'", zrodlo)
    assert m, f"brak stałej {nazwa} w lustrze frontu"
    return m.group(1)


def _porty_aparatow(zrodlo: str) -> dict[str, tuple[str, ...]]:
    m = re.search(r"export const PORTY_APARATU_POLA\b[^=]*=\s*\{(.*?)\n\};", zrodlo, re.S)
    assert m, "brak deklaracji PORTY_APARATU_POLA w lustrze frontu"
    stale = {
        n: _stala_napisowa(n, zrodlo)
        for n in ("PORT_WEJSCIA", "PORT_WYJSCIA", "PORT_PRZYLACZA", "PORT_OBWODU")
    }
    wynik: dict[str, tuple[str, ...]] = {}
    for rodzaj, porty in re.findall(r"^\s*([A-Z_]+):\s*\[([^\]]*)\]", m.group(1), re.M):
        wynik[rodzaj] = tuple(stale[p.strip()] for p in porty.split(",") if p.strip())
    return wynik


def test_lacznik_pola_i_lacznik_toru_te_same_zbiory():
    zrodlo = _zrodlo()
    assert set(_napisy_literalu("RODZAJE_LACZNIKOW_POLA", zrodlo)) == set(ra.RODZAJE_LACZNIKOW_POLA)
    assert _stala_napisowa("RODZAJ_UZIEMNIKA", zrodlo) == ra.RODZAJ_UZIEMNIKA
    # Front wyprowadza łączniki toru z łączników pola bez uziemnika — ta sama reguła co
    # backend; sprawdzamy, że formuła nie została zastąpiona literałem.
    assert "[...RODZAJE_LACZNIKOW_POLA].filter((rodzaj) => rodzaj !== RODZAJ_UZIEMNIKA)" in zrodlo
    assert ra.RODZAJE_LACZNIKOW_TORU == ra.RODZAJE_LACZNIKOW_POLA - {ra.RODZAJ_UZIEMNIKA}


def test_stany_otwarte_w_torze_te_same():
    zrodlo = _zrodlo()
    assert tuple(_napisy_literalu("STANY_OTWARTE_W_TORZE", zrodlo)) == ra.STANY_OTWARTE_W_TORZE
    assert ra.STAN_UZIEMIONY in ra.STANY_OTWARTE_W_TORZE


def test_porty_aparatow_i_wezel_szyny_te_same():
    zrodlo = _zrodlo()
    assert _porty_aparatow(zrodlo) == ra.PORTY_APARATU_POLA
    assert _stala_napisowa("WEZEL_SZYNY", zrodlo) == ra.WEZEL_SZYNY
    assert _stala_napisowa("PORT_WEJSCIA", zrodlo) == ra.PORT_WEJSCIA
    assert _stala_napisowa("PORT_WYJSCIA", zrodlo) == ra.PORT_WYJSCIA
    assert _stala_napisowa("PORT_PRZYLACZA", zrodlo) == ra.PORT_PRZYLACZA
    assert _stala_napisowa("PORT_OBWODU", zrodlo) == ra.PORT_OBWODU


def test_iniekcja_rozjazd_zbioru_lacznikow_czerwieni_porownanie():
    """Iniekcja: usunięcie łącznika trójpołożeniowego z lustra musi dać rozjazd zbiorów."""
    zrodlo = _zrodlo().replace("  'THREE_POSITION_SWITCH',\n", "", 1)
    assert set(_napisy_literalu("RODZAJE_LACZNIKOW_POLA", zrodlo)) != set(ra.RODZAJE_LACZNIKOW_POLA)


def test_iniekcja_rozjazd_portow_czerwieni_porownanie():
    """Iniekcja: przekładnik Ferrantiego z portami toru zamiast „obwod" — rozjazd portów."""
    zrodlo = _zrodlo().replace(
        "CORE_BALANCE_CT: [PORT_OBWODU]", "CORE_BALANCE_CT: [PORT_WEJSCIA, PORT_WYJSCIA]", 1
    )
    assert _porty_aparatow(zrodlo) != ra.PORTY_APARATU_POLA


def test_wezly_konca_toru_te_same():
    """Tor główny pola kończy się w tym samym zbiorze węzłów po obu stronach (rozszerzenie 4:
    odgałęzienie przekładnika napięciowego — tor główny = jedyna droga do węzła końca toru)."""
    assert set(_napisy_literalu("WEZLY_KONCA_TORU", _zrodlo())) == set(ra.WEZLY_KONCA_TORU)


def test_iniekcja_rozjazd_wezlow_konca_toru_czerwieni_porownanie():
    """Iniekcja: węzeł odpływu usunięty z lustra — rozjazd zbioru węzłów końca toru."""
    zrodlo = _zrodlo().replace("'transformator', 'odplyw'", "'transformator'", 1)
    assert set(_napisy_literalu("WEZLY_KONCA_TORU", zrodlo)) != set(ra.WEZLY_KONCA_TORU)


_PICKER_SZABLONU = LUSTRO.parents[3] / "catalog" / "BayTemplatePicker.tsx"


def _rodzaje_szablonu_frontu(zrodlo: str) -> set[str]:
    m = re.search(r"export interface BayDeviceTemplateWire \{.*?readonly kind:(.*?);", zrodlo, re.S)
    assert m, "brak deklaracji BayDeviceTemplateWire.kind w BayTemplatePicker.tsx"
    return set(re.findall(r"'([A-Z_]+)'", m.group(1)))


def test_rodzaje_aparatu_szablonu_pola_te_same():
    """`BayDeviceTemplateWire.kind` (odbiornik `base_template.devices`, klucze tablicy BOM
    `generatorSldPola.RODZAJ_Z_KIND_SZABLONU`) = `BayDeviceTemplate.kind` backendu."""
    from typing import get_args

    from network_model.catalog.bay_templates import BayDeviceTemplate

    backend = set(get_args(BayDeviceTemplate.model_fields["kind"].annotation))
    assert _rodzaje_szablonu_frontu(_PICKER_SZABLONU.read_text(encoding="utf-8")) == backend


def test_iniekcja_rozjazd_rodzajow_szablonu_czerwieni_porownanie():
    """Iniekcja: odłącznik odgałęzienia usunięty z lustra — rozjazd zbiorów."""
    from typing import get_args

    from network_model.catalog.bay_templates import BayDeviceTemplate

    zrodlo = _PICKER_SZABLONU.read_text(encoding="utf-8").replace("    | 'DS_BRANCH'\n", "", 1)
    backend = set(get_args(BayDeviceTemplate.model_fields["kind"].annotation))
    assert _rodzaje_szablonu_frontu(zrodlo) != backend
