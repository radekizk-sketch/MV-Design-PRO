"""Testy własne guarda formuł fizycznych poza solverami (CV-4.3 K4).

Iloczyn cech (KLASA NIE INSTANCJA, CLAUDE.md): rodzina x forma AST (wyrażenie
arytmetyczne vs napis vs komentarz vs docstring vs porównanie kryterialne),
dla KAŻDEJ z 5 rodzin — nie tylko przykład z karty.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from backend_no_physics_guard import (  # noqa: E402
    ALLOWLIST,
    BACKEND_SRC,
    WYKLUCZONY_PREFIKSY,
    ZASTANE,
    porownaj_z_zapadka,
    zlicz_wzorce,
    zmierz,
)


def _wzorce(kod: str) -> dict[str, int]:
    return zlicz_wzorce(ast.parse(kod))


# ---------------------------------------------------------------------------
# Rodzina A — √3 (TYLKO w mnożeniu/dzieleniu — K4.4)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "kod",
    [
        "import math\nx = s / (math.sqrt(3.0) * u)\n",
        "import math\nx = s / (math.sqrt(3) * u)\n",
        "from math import sqrt\nx = s / (sqrt(3.0) * u)\n",
        "x = s / (3.0**0.5 * u)\n",
        "x = s / (3**0.5 * u)\n",
        "x = s / (1.7320508075688772 * u)\n",
        "import numpy as np\nx = s / (np.sqrt(3.0) * u)\n",
        "x = u * 1000.0 / math.sqrt(3.0)\n",
    ],
)
def test_rodzina_a_wykrywa_sqrt3_w_mnozeniu_dzieleniu(kod: str) -> None:
    assert _wzorce(kod).get("A_sqrt3", 0) == 1


def test_rodzina_a_nie_liczy_bare_stalej_bez_mnozenia_dzielenia() -> None:
    """`_SQRT3 = math.sqrt(3.0)` samo, bez użycia w tej samej linii jako
    operand mnożenia/dzielenia, NIE jest formułą (K4.4: „w mnożeniu/dzieleniu")."""
    kod = "import math\n_SQRT3 = math.sqrt(3.0)\n"
    assert _wzorce(kod).get("A_sqrt3", 0) == 0


def test_rodzina_a_nie_liczy_napisu_ani_komentarza() -> None:
    kod = (
        "# formula: I = S / (sqrt(3) * U)\n"
        "def f():\n"
        '    """Ik = Sk / (sqrt(3) * Un)."""\n'
        '    return "S_k = sqrt(3) * U_n * I_k"\n'
    )
    assert _wzorce(kod).get("A_sqrt3", 0) == 0


def test_rodzina_a_nie_liczy_przypadkowego_literalu_nieblizniego_sqrt3() -> None:
    kod = "x = s / (1.5 * u)\n"
    assert _wzorce(kod).get("A_sqrt3", 0) == 0


# ---------------------------------------------------------------------------
# Rodzina B — κ IEC 60909 (narracja podstawienia)
# ---------------------------------------------------------------------------


def test_rodzina_b_wykrywa_czlon_wykladniczy() -> None:
    kod = "import math\nx = math.exp(-3 * rx)\n"
    assert _wzorce(kod).get("B_kappa_exp", 0) == 1


def test_rodzina_b_wykrywa_wzor_pelny() -> None:
    kod = "import math\nk = 1.02 + 0.98 * math.exp(-3 * rx)\n"
    assert _wzorce(kod).get("B_kappa_exp", 0) >= 1


def test_rodzina_b_nie_liczy_niepowiazanego_exp() -> None:
    kod = "import math\nx = math.exp(rx)\n"
    assert _wzorce(kod).get("B_kappa_exp", 0) == 0


def test_rodzina_b_nie_liczy_komentarza() -> None:
    kod = "# kappa = 1.02 + 0.98 * exp(-3*R/X)\nx = kappa\n"
    assert _wzorce(kod).get("B_kappa_exp", 0) == 0


# ---------------------------------------------------------------------------
# Rodzina C — całka Joule'a I²t (kwadrat RAZY wielkość CZASOWĄ)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "kod",
    [
        "x = i_ka ** 2 * tk_s\n",
        "x = i_ka ** 2 * data.tk_s\n",
        "x = data.ith_device_ka ** 2 * data.t_th_s\n",
        "x = (i / 1000.0) ** 2 * czas_s\n",
        "x = required_time * required_val ** 2\n",
    ],
)
def test_rodzina_c_wykrywa_kwadrat_razy_czas(kod: str) -> None:
    assert _wzorce(kod).get("C_i2t_joule", 0) == 1


def test_rodzina_c_nie_liczy_kwadratu_razy_wspolczynnik_bez_markera_czasu() -> None:
    """Odróżnienie od regresji wielomianowych (np. IEEE 1584 arc-flash:
    `k[7] * i_bf_ka ** 2`) — kwadrat mnożony przez współczynnik tabelaryczny,
    NIE przez czas, nie jest całką Joule'a."""
    kod = "x = k[7] * i_bf_ka ** 2\n"
    assert _wzorce(kod).get("C_i2t_joule", 0) == 0


def test_rodzina_c_nie_liczy_napiecia_kwadrat_razy_napiecie() -> None:
    kod = "x = base_delta_model * (u_nom_kv ** 2) / (u_nom_new ** 2)\n"
    assert _wzorce(kod).get("C_i2t_joule", 0) == 0


# ---------------------------------------------------------------------------
# Rodzina D — korekta temperaturowa (1 + alpha*(theta - odniesienie))
# ---------------------------------------------------------------------------


def test_rodzina_d_wykrywa_korekte_z_literalem() -> None:
    kod = "x = r20 * (1.0 + 0.004 * (theta_k - 20.0))\n"
    assert _wzorce(kod).get("D_korekta_temperaturowa", 0) == 1


def test_rodzina_d_wykrywa_korekte_ze_stala_nazwana() -> None:
    """Wartość odejmowana bywa stałą nazwaną (`REFERENCE_TEMPERATURE_C`), nie
    literałem 20 — dopasowanie po KSZTAŁCIE, nie po liczbie."""
    kod = "x = r20 * (1.0 + ALPHA * (theta_k - REFERENCE_TEMPERATURE_C))\n"
    assert _wzorce(kod).get("D_korekta_temperaturowa", 0) == 1


def test_rodzina_d_nie_liczy_dodawania_bez_odejmowania() -> None:
    kod = "x = r20 * (1.0 + 0.004 * theta_k)\n"
    assert _wzorce(kod).get("D_korekta_temperaturowa", 0) == 0


def test_rodzina_d_nie_liczy_przypadkowej_liczby_karty() -> None:
    kod = '"""PR-20: opis karty."""\nx = a - 20\n'
    assert _wzorce(kod).get("D_korekta_temperaturowa", 0) == 0


# ---------------------------------------------------------------------------
# Rodzina G — impedancja/moc bazowa Z = U²/S
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "kod",
    [
        "x = u_kv ** 2 / s_mva\n",
        "x = (u_kv ** 2) / s_mva\n",
        "x = (self.voltage_lv_kv ** 2) / self.rated_power_mva\n",
    ],
)
def test_rodzina_g_wykrywa_u2_przez_s(kod: str) -> None:
    assert _wzorce(kod).get("G_z_u2_s", 0) == 1


def test_rodzina_g_nie_liczy_gdy_kwadrat_nie_jest_wprost_licznikiem() -> None:
    """Formuły wieloczłonowe (np. `x_pu * U**2 / S` — reaktancja z pu i mocy)
    są poza zakresem karty (dokumentowane jako znalezisko, nie naprawiane) —
    kwadrat musi być WPROST licznikiem dzielenia, nie częścią mnożenia."""
    kod = "x = xd_pu * (u_kv ** 2) / s_mva\n"
    assert _wzorce(kod).get("G_z_u2_s", 0) == 0


def test_rodzina_g_nie_liczy_kwadratu_przez_kwadrat() -> None:
    kod = "x = (u_nom_kv ** 2) / (u_nom_new ** 2)\n"
    # Formalnie DZIELI kwadrat przez COŚ (tu też kwadrat) — to wciąż pasuje do
    # ksztaltu "u**2 / s" (S nie musi byc nazwane mocą); test dokumentuje, że
    # guard jest celowo szeroki na SAMYM kształcie arytmetycznym, a
    # rozróżnienie „to nie jest fizyka" (sensitivity ratio) jest wiedzą
    # DOMENOWĄ spoza AST — stąd to miejsce w repo zostało ocenione osobno w
    # meldunku karty (lf_sensitivity/builder.py), nie przez allowlistę guarda.
    assert _wzorce(kod).get("G_z_u2_s", 0) == 1


# ---------------------------------------------------------------------------
# Zapadka — porownaj_z_zapadka (wzrost/spadek, KLASA nie INSTANCJA)
# ---------------------------------------------------------------------------


def test_zapadka_nowy_plik_i_wzrost_to_dlug_urosl() -> None:
    bledy = porownaj_z_zapadka(
        {"a.py": {"A_sqrt3": 1}, "b.py": {"A_sqrt3": 2}}, {"b.py": {"A_sqrt3": 1}}
    )
    assert [b.split("]")[0] + "]" for b in bledy] == ["[dlug-urosl]", "[dlug-urosl]"]


def test_zapadka_spadek_i_zniknieciu_to_dlug_zmalal() -> None:
    bledy = porownaj_z_zapadka(
        {"b.py": {"A_sqrt3": 1}}, {"a.py": {"A_sqrt3": 1}, "b.py": {"A_sqrt3": 2}}
    )
    assert sorted(b.split("]")[0] + "]" for b in bledy) == ["[dlug-zmalal]", "[dlug-zmalal]"]
    assert porownaj_z_zapadka({"b.py": {"A_sqrt3": 1}}, {"b.py": {"A_sqrt3": 1}}) == []


def test_zapadka_pusta_pomiar_pusty_jest_zielony() -> None:
    assert porownaj_z_zapadka({}, {}) == []


# ---------------------------------------------------------------------------
# Wykluczenie solverów + allowlista pusta + pin stanu repozytorium
# ---------------------------------------------------------------------------


def test_solvery_i_pochodne_oba_wykluczone_jako_siostrzane_katalogi(tmp_path: Path) -> None:
    """Iloczyn cech (KLASA NIE INSTANCJA): plik pod `network_model/solvers/`
    (NIE `pochodne/`, np. rdzeń solvera) I plik pod `network_model/pochodne/`
    (siostrzany katalog, relokacja architekta 2026-09-06 — NIE zagnieżdżony
    pod `solvers/`) MUSZĄ być oba wykluczone ze skanu, niezależnie od siebie;
    plik poza obiema ścieżkami MUSI być zliczony. Trzy gałęzie, jedna formuła
    identyczna w każdej — jedyna zmienna to ścieżka."""
    formula = "import math\nx = s / (math.sqrt(3.0) * u)\n"
    (tmp_path / "network_model" / "solvers").mkdir(parents=True)
    (tmp_path / "network_model" / "pochodne").mkdir(parents=True)
    (tmp_path / "inny_pakiet").mkdir(parents=True)
    (tmp_path / "network_model" / "solvers" / "jakis_solver.py").write_text(
        formula, encoding="utf-8"
    )
    (tmp_path / "network_model" / "pochodne" / "wielkosci_pochodne.py").write_text(
        formula, encoding="utf-8"
    )
    (tmp_path / "inny_pakiet" / "modul.py").write_text(formula, encoding="utf-8")
    assert zmierz(tmp_path) == {"inny_pakiet/modul.py": {"A_sqrt3": 1}}


def test_allowlista_pusta() -> None:
    assert ALLOWLIST == {}


def test_pochodne_naprawde_istnieje_i_niesie_wiekszosc_rodzin() -> None:
    plik = BACKEND_SRC / "network_model" / "pochodne" / "wielkosci_pochodne.py"
    assert plik.exists()
    tree = ast.parse(plik.read_text(encoding="utf-8"))
    wzorce = zlicz_wzorce(tree)
    # `pochodne/` jest WYKLUCZONE ze skanu produkcyjnego (WYKLUCZONY_PREFIKSY),
    # ale to wlasnie tu formuly MAJA prawo zyc — sprawdzamy wprost (bez
    # przechodzenia przez `zmierz`), że faktycznie tam są, a nie że guard
    # przypadkiem nigdy ich nie widzi. `A_sqrt3` NIE jest tu oczekiwane: cały
    # plik dzieli JEDNĄ stałą modułową `SQRT3 = math.sqrt(3.0)` (jedno miejsce
    # prawdy — cel karty), więc formuły dzielą/mnożą przez NAZWĘ `SQRT3`, nie
    # przez świeże wyrażenie `sqrt(3)`/`3**0.5` w tej samej pozycji — dokładnie
    # ten sam, poprawny powód, dla którego rodzina A wymaga bezpośredniego
    # operandu mnożenia/dzielenia (test wyżej), a nie dowolnego wystąpienia.
    for rodzina in ("B_kappa_exp", "C_i2t_joule", "D_korekta_temperaturowa", "G_z_u2_s"):
        assert wzorce.get(rodzina, 0) >= 1, f"pochodne/ powinno nieść rodzinę {rodzina}"
    # Stała SQRT3 jest poprawna (wartość liczbowa, nie zależy od PYTHONPATH
    # backendu — czytamy plik jako tekst, tak jak reszta tego testu).
    assert "SQRT3: float = math.sqrt(3.0)" in plik.read_text(encoding="utf-8")


def test_pin_stanu_repozytorium() -> None:
    """Zapadka = pomiar (obie strony). Wzrost = formuła fizyczna poza
    pochodne/; spadek = obniż ZASTANE. Docelowo (po karcie A2 — kasacja
    `application/reference_networks/**`) zapadka jest PUSTA."""
    assert porownaj_z_zapadka(zmierz(), ZASTANE) == []
    assert set(ZASTANE) <= {"application/reference_networks/computation.py"}


def test_wykluczone_prefiksy_to_solvery_i_siostrzany_pochodne() -> None:
    assert WYKLUCZONY_PREFIKSY == ("network_model/solvers/", "network_model/pochodne/")
