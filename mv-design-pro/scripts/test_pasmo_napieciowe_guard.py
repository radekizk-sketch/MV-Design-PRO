"""Testy własne strażnika predykatu pasma napięciowego (karta PASMO-1KV).

Iloczyn cech (KLASA, NIE INSTANCJA): język {Python AST, TypeScript tekst} × forma
{porównanie literał po prawej, literał po lewej, łańcuch, stała lokalna, porównanie ze stałą
pasma, stała strony z progiem spoza literałów granic} × literał {1, 1.0, 60, 110, 1000} ×
operator {<, <=, >, >=} oraz formy, które NIE są tą klasą {równość z literałem, wielkość
względna p.u., moc kVA, liczność kolekcji, odchyłka `abs`, komentarz, napis, przelicznik
jednostek}. Do tego pomiar repozytorium: zero naruszeń przy pustej allowliście.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pasmo_napieciowe_guard as guard  # noqa: E402

# ---------------------------------------------------------------------------
# Python
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("literal", ["1", "1.0", "60", "60.0", "110", "1000.0"])
@pytest.mark.parametrize("operator", ["<", "<=", ">", ">="])
@pytest.mark.parametrize(
    "operand", ["voltage_kv", "bus.voltage_kv", "u_n", "napiecie_kv", "ulv_kv"]
)
def test_python_porownanie_napiecia_z_literalem_granicy(
    literal: str, operator: str, operand: str
) -> None:
    assert guard.skanuj_python(f"x = {operand} {operator} {literal}\n")
    assert guard.skanuj_python(f"x = {literal} {operator} {operand}\n")


@pytest.mark.parametrize(
    "kod",
    [
        "x = 1.0 < float(napiecie) <= 60.0\n",
        "x = 0.0 < node.voltage_level < PASMO_NN_MAX_KV\n",
        "x = v <= LV_BAND_LIMIT_KV\n",
        "x = bus.voltage_kv > STATION_LV_VOLTAGE_LIMIT_KV\n",
        "PASMO_SN_MAX_KV = 60.0\n",
        "LV_BAND_LIMIT_KV = 1.0\n",
        "STATION_LV_VOLTAGE_LIMIT_KV = 0.5\n",
        "MAX_STATION_NN_SOURCE_VOLTAGE_KV: float = 1.0\n",
    ],
)
def test_python_lokalne_kopie_granicy(kod: str) -> None:
    assert guard.skanuj_python(kod)


@pytest.mark.parametrize(
    "kod",
    [
        "x = hv_voltage_key != 110\n",
        "x = voltage_kv == 1.0\n",
        "x = voltage_pu < 1.0\n",
        "x = kva < 1000\n",
        "x = len(voltage_nodes) > 1\n",
        "x = abs(lv_kv - 15) < 1\n",
        "_KV_TO_V = 1000.0\n",
        "voltage_damping = 1.0\n",
        "x = off_nominal_ratio < 1.0\n",
        "s = 'voltage_kv < 1.0'\n",
        "# voltage_kv < 1.0\nx = 0\n",
        'def f():\n    """voltage_kv < 1.0"""\n',
        "x = pasmo_napieciowe(voltage_kv) == 'nN'\n",
    ],
)
def test_python_formy_spoza_klasy(kod: str) -> None:
    assert guard.skanuj_python(kod) == []


# ---------------------------------------------------------------------------
# TypeScript
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("literal", ["1", "1.0", "60", "110"])
@pytest.mark.parametrize("operator", ["<", "<=", ">", ">="])
@pytest.mark.parametrize(
    "operand", ["bus.voltage_kv", "busVoltageKv", "item.un_kv", "t.uhv_kv", "bus.unKv"]
)
def test_ts_porownanie_napiecia_z_literalem_granicy(
    literal: str, operator: str, operand: str
) -> None:
    assert guard.skanuj_ts(f"const x = {operand} {operator} {literal};\n")
    assert guard.skanuj_ts(f"const x = {literal} {operator} {operand};\n")


@pytest.mark.parametrize(
    "kod",
    [
        "const PASMO_NN_MAX_KV = 1.0;\n",
        "const LV_DOMAIN_MAX_KV = 1.0;\n",
        "export const STATION_LV_VOLTAGE_LIMIT_KV = 0.5;\n",
        "if (bus.voltage_kv > STATION_LV_VOLTAGE_LIMIT_KV) {}\n",
        "const s = `U=${vf.u_kv.toFixed(vf.un_kv < 1 ? 3 : 2)} kV`;\n",
        "const k = (b) => (side === 'hv' ? b.voltage_kv >= 60 : b.voltage_kv < 60);\n",
    ],
)
def test_ts_lokalne_kopie_i_wyrazenia_szablonu(kod: str) -> None:
    assert guard.skanuj_ts(kod)


@pytest.mark.parametrize(
    "kod",
    [
        "const x = kva >= 1000;\n",
        "const x = nnVoltageLevels.length > 1;\n",
        "const x = nnVoltageLevelsCount > 1;\n",
        "const x = Math.abs(lvKv - 15) < 1;\n",
        "const x = voltage_kv === 1;\n",
        "// bus.voltage_kv < 1\n",
        "/* bus.voltage_kv < 1 */\n",
        "const s = 'bus.voltage_kv < 1';\n",
        'const s = "voltage_kv >= 60";\n',
        "const s = `napięcie voltage_kv < 1 kV`;\n",
        "const x = wPasmieNn(bus.voltage_kv);\n",
        "const LV_BUS_GAP = 110;\n",
    ],
)
def test_ts_formy_spoza_klasy(kod: str) -> None:
    assert guard.skanuj_ts(kod) == []


def test_ts_zdejmowanie_zachowuje_numeracje_linii() -> None:
    kod = "/* a\nb */\nconst s = 'x\\'y';\nconst v = bus.voltage_kv < 1;\n"
    assert guard.skanuj_ts(kod) == [(4, "const v = bus.voltage_kv < 1;")]


# ---------------------------------------------------------------------------
# Pomiar repozytorium
# ---------------------------------------------------------------------------


def test_allowlista_pusta() -> None:
    assert guard.ALLOWLIST == {}


def test_zrodlo_i_lustro_istnieja() -> None:
    assert (guard.BACKEND_SRC / guard.ZRODLO_PY).is_file()
    assert (guard.FRONTEND_SRC / guard.LUSTRO_TS).is_file()


def test_repozytorium_bez_naruszen() -> None:
    naruszenia, b01, liczba = guard.zmierz()
    assert naruszenia == [], "\n".join(str(t) for t in naruszenia)
    assert b01 == [], "\n".join(str(t) for t in b01)
    assert liczba > 1000, "pusty skan nie jest zielenią"


def test_main_kod_wyjscia_zero() -> None:
    assert guard.main() == 0
