"""Testy własne guarda formuł fizycznych poza solverami (CV-4.3 K4; rodzina E
dopisana kartą W3-A, 2026-09).

Iloczyn cech (KLASA NIE INSTANCJA, CLAUDE.md): rodzina x forma AST (wyrażenie
arytmetyczne vs napis vs komentarz vs docstring vs porównanie kryterialne),
dla KAŻDEJ z 6 rodzin — nie tylko przykład z karty.
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
# Rodzina E — IDMT IEC 60255 t = TMS*A/(M^B-1) (karta W3-A)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "kod",
    [
        # Inline: wykladnik literalem != 2.0 (SI/NI, A=0.14, B=0.02).
        "x = tms * 0.14 / (m ** 0.02 - 1.0)\n",
        # Inline: wykladnik literalem 1.0 (VI/RI) — odejmowanie 1 (int, nie float).
        "x = tms * 13.5 / (m ** 1.0 - 1)\n",
        # Inline: wykladnik literalem 2.0 (EI) — MIMO ze rodzina C tez rozpoznaje
        # `m**2.0`, tu jest ODEJMOWANIE w mianowniku dzielenia, nie mnozenie
        # przez znacznik czasu — rodzina E i C sie nie wykluczaja wzajemnie.
        "x = tms * 80.0 / (m ** 2.0 - 1.0)\n",
        # Inline: wykladnik to ZMIENNA (nie literal) — dokladnie ksztalt, ktory
        # `_is_pow2` (rodzina C) NIE lapie (wymaga literalu 2.0).
        "x = tms * a / (m ** b - 1.0)\n",
        # `math.pow(m, b)` jako WYWOLANIE, nie ast.BinOp(Pow) — INLINE wariant
        # ksztaltu uzytego (przez zmienna posrednia) w `domain/
        # protection_engine_v1.py::iec_curve_time_seconds` (drugi silnik IDMT,
        # B-01 STOP — ZOSTAJE, nie skasowany; patrz test ponizej dla
        # dwupoziomowej posredniosci i test udokumentowanego ograniczenia).
        "import math\nx = tms * a / (math.pow(m, b) - 1.0)\n",
        # Wywolanie bare `pow(...)`.
        "x = tms * a / (pow(m, b) - 1.0)\n",
        # Zmienna posrednia: `denominator = (ratio**b) - 1.0; ... / denominator`
        # — REALNY ksztalt znaleziony w 3 z 4 zdublowanych implementacji IDMT
        # inwentarza W3 rodzina A (protection_analysis/engine.py PRZED W3-A,
        # domain_operations_v2.py PRZED W3-A, overcurrent/calculator.py —
        # ten ostatni ZOSTAJE zywy do W3-C, stad wpis w ZASTANE).
        "def f(ratio, tms, a, b):\n"
        "    denominator = (ratio ** b) - 1.0\n"
        "    if denominator <= 0:\n"
        "        return None\n"
        "    return tms * a / denominator\n",
    ],
)
def test_rodzina_e_wykrywa_ksztalt_idmt(kod: str) -> None:
    assert _wzorce(kod).get("E_idmt_shape", 0) == 1


def test_rodzina_e_liczy_zagniezdzona_funkcje_osobno_bez_przecieku() -> None:
    """Dwie funkcje, KAZDA z WLASNA zmienna `denominator` — zasieg funkcji nie
    przecieka miedzy nimi (2 trafienia, nie 1 i nie 4 przez skrzyzowanie)."""
    kod = (
        "def f(m, b, a, tms):\n"
        "    denominator = (m ** b) - 1.0\n"
        "    return tms * a / denominator\n"
        "def g(m2, b2, a2, tms2):\n"
        "    denominator = (m2 ** b2) - 1.0\n"
        "    return tms2 * a2 / denominator\n"
    )
    assert _wzorce(kod).get("E_idmt_shape", 0) == 2


def test_rodzina_e_wykrywa_dwupoziomowa_posredniosc() -> None:
    """`m_power_b = math.pow(m, b)` (osobne przypisanie), POTEM
    `denominator = m_power_b - 1.0`, POTEM `a / denominator` — DRUGI poziom
    pośredniości (potęga sama jest nazwą, nie inline), dokładnie kształt
    `domain/protection_engine_v1.py::iec_curve_time_seconds` (drugi silnik
    IDMT, B-01 STOP)."""
    kod = (
        "import math\n"
        "def f(m, b, a, tms):\n"
        "    m_power_b = math.pow(m, b)\n"
        "    denominator = m_power_b - 1.0\n"
        "    return tms * a / denominator\n"
    )
    assert _wzorce(kod).get("E_idmt_shape", 0) == 1


def test_rodzina_e_nie_lapie_mianownika_za_zaslonieta_warunkowym_ponownym_przypisaniem() -> None:
    """Znane, udokumentowane ograniczenie (KLASA NIE INSTANCJA, ale bez pełnej
    analizy przepływu sterowania — patrz docstring `_idmt_lokalne_przypisania`):
    gdy `denominator` jest PONOWNIE przypisany wewnątrz `if` (numeryczny
    guard/floor, jak `if denominator <= 1e-12: denominator = 1e-12`), ostatnie
    przypisanie w PROSTYM przejściu tekstowym wygrywa i zasłania fizykę —
    DOKŁADNIE kształt `iec_curve_time_seconds` w `domain/
    protection_engine_v1.py` (B-01 STOP, karta W3-A): guard tego NIE łapie.
    Ten test PRZYPINA fałszywy negatyw jako świadomy, nie cichy — poprawność
    formuły w tym miejscu pilnuje B-01 (edycja wymaga sankcji właściciela),
    nie ten guard."""
    kod = (
        "import math\n"
        "def f(m, b, a, tms):\n"
        "    m_power_b = math.pow(m, b)\n"
        "    denominator = m_power_b - 1.0\n"
        "    if denominator <= 1e-12:\n"
        "        denominator = 1e-12\n"
        "    return tms * a / denominator\n"
    )
    assert _wzorce(kod).get("E_idmt_shape", 0) == 0


def test_rodzina_e_nie_liczy_i2t_ksztaltu_rodziny_c() -> None:
    """`x**2 * t` (calka Joule'a, rodzina C) NIE moze zaliczyc sie do IDMT —
    to MNOZENIE przez znacznik czasu, nie ODEJMOWANIE jedynki pod dzieleniem;
    zero wspolnego ksztaltu AST miedzy C i E mimo wspolnego `Pow`."""
    kod = "x = i_ka ** 2 * tk_s\n"
    wzorce = _wzorce(kod)
    assert wzorce.get("E_idmt_shape", 0) == 0
    assert wzorce.get("C_i2t_joule", 0) == 1  # rodzina C nadal dziala na tym kodzie


def test_rodzina_e_nie_liczy_mianownika_bez_odejmowania_jedynki() -> None:
    kod = "x = tms * a / (m ** b)\n"
    assert _wzorce(kod).get("E_idmt_shape", 0) == 0


def test_rodzina_e_nie_liczy_odejmowania_innej_stalej_niz_jeden() -> None:
    kod = "x = tms * a / (m ** b - 2.0)\n"
    assert _wzorce(kod).get("E_idmt_shape", 0) == 0


def test_rodzina_e_nie_liczy_potegi_w_liczniku() -> None:
    """`(m**b - 1) / s` — odejmowanie potegi jest LICZNIKIEM, nie mianownikiem
    dzielenia; ksztalt rodziny E wymaga go WPROST w mianowniku (analogicznie
    do rodziny G, ktora wymaga kwadratu WPROST w liczniku)."""
    kod = "x = (m ** b - 1.0) / s\n"
    assert _wzorce(kod).get("E_idmt_shape", 0) == 0


def test_rodzina_e_nie_liczy_napisu_ani_komentarza() -> None:
    kod = (
        "# formula: t = TMS * A / (M**B - 1)\n"
        "def f():\n"
        '    """t = TMS * A / (M**B - 1)."""\n'
        '    return "t = TMS * A / (M**B - 1)"\n'
    )
    assert _wzorce(kod).get("E_idmt_shape", 0) == 0


def test_rodzina_e_nie_liczy_przypisania_bez_uzycia_w_dzieleniu() -> None:
    """`denominator = (m**b) - 1.0` samo, bez UZYCIA w dzieleniu w tym samym
    zasiegu, nie jest jeszcze formula IDMT (analogicznie do rodziny A, ktora
    tez wymaga bezposredniego kontekstu mnozenia/dzielenia, nie bare
    przypisania)."""
    kod = "def f(m, b):\n    denominator = (m ** b) - 1.0\n    return denominator\n"
    assert _wzorce(kod).get("E_idmt_shape", 0) == 0


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
# Rodzina J — skalowanie jednostek (karta W3-F §0.3)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "kod",
    [
        "x = p_kw / 1000.0\n",
        "x = 1000 * u_kv\n",
        'x = float(row["ikss_a"]) / 1000.0\n',
        "x = abs(p_mw) * 1000.0\n",
        'x = f"{i_a/1000:.2f}"\n',
        "x = trafo.pk_kw * 1000.0\n",
        "x = b_us_per_km * 1e-6\n",
        "x = t_ms / 1000\n",
        "x = c_nf_per_km * 1e-3\n",
        "x = float(b_us_per_km) / 1_000_000.0\n",
        "x = voltage_kv * 1e3\n",
    ],
)
def test_rodzina_j_wykrywa_skalowanie_jednostek(kod: str) -> None:
    assert _wzorce(kod).get("J_skalowanie_jednostek", 0) == 1


@pytest.mark.parametrize(
    "kod",
    [
        "x = abs(a - b) > 1e-6\n",
        "x = max(u_kv, 0.001)\n",
        "x = Field(ge=0.001)\n",
        "x = 1e-6 * max(1.0, abs(b))\n",
        "x = (t1 - t0) * 1000\n",
        "x = x_kv * 100.0\n",
        'x = {"sn_mva": 0.001}\n',
        "x = complex(1e6, 0.0)\n",
        'x = "x_kv * 1000"\n',
        "x = 1000 / x_kv\n",
    ],
)
def test_rodzina_j_nie_liczy_negatywnych_przykladow(kod: str) -> None:
    assert _wzorce(kod).get("J_skalowanie_jednostek", 0) == 0


# --- Iloczyn cech: forma literalu x forma operandu x Mult/Div (KLASA NIE INSTANCJA) ---


@pytest.mark.parametrize(
    "literal",
    ["1000", "1000.0", "1e3", "1_000.0"],
)
def test_rodzina_j_formy_literalu_1000_sa_tym_samym_floatem(literal: str) -> None:
    assert _wzorce(f"x = u_kv * {literal}\n").get("J_skalowanie_jednostek", 0) == 1
    assert _wzorce(f"x = u_kv / {literal}\n").get("J_skalowanie_jednostek", 0) == 1


@pytest.mark.parametrize(
    "literal",
    ["1000000", "1000000.0", "1e6", "1_000_000.0", "1_000_000"],
)
def test_rodzina_j_formy_literalu_1e6_sa_tym_samym_floatem(literal: str) -> None:
    assert _wzorce(f"x = admitancja_s * {literal}\n").get("J_skalowanie_jednostek", 0) == 1


@pytest.mark.parametrize("op", ["*", "/"])
def test_rodzina_j_stala_1e_minus_6_w_obu_kierunkach(op: str) -> None:
    assert _wzorce(f"x = b_us_per_km {op} 1e-6\n").get("J_skalowanie_jednostek", 0) == 1


def test_rodzina_j_div_liczy_stala_wylacznie_po_prawej() -> None:
    """`1000 / x_kv` NIE jest skalowaniem x_kv (dzielnik jest zmienną, nie
    literałem) — dla Div rodzina J liczy WYŁĄCZNIE prawy operand jako
    kandydata na stałą (§0.3 karty, odwrotnie niż Mult, gdzie stała może być
    po obu stronach)."""
    assert _wzorce("x = 1000 / x_kv\n").get("J_skalowanie_jednostek", 0) == 0
    assert _wzorce("x = x_kv / 1000\n").get("J_skalowanie_jednostek", 0) == 1


def test_rodzina_j_mult_liczy_stala_po_obu_stronach() -> None:
    assert _wzorce("x = 1000 * u_kv\n").get("J_skalowanie_jednostek", 0) == 1
    assert _wzorce("x = u_kv * 1000\n").get("J_skalowanie_jednostek", 0) == 1


@pytest.mark.parametrize(
    "wrapper",
    ["float({})", "abs({})", "int({})", "float(abs({}))"],
)
def test_rodzina_j_zdejmuje_float_abs_int_zagniezdzone(wrapper: str) -> None:
    operand = wrapper.format("p_kw")
    assert _wzorce(f"x = {operand} / 1000.0\n").get("J_skalowanie_jednostek", 0) == 1


def test_rodzina_j_nie_zdejmuje_innych_wolan() -> None:
    """Tylko `float`/`abs`/`int` są zdejmowane — `round(p_kw)` zostaje Call,
    nie Name/Attribute, więc NIE pasuje (miejsce „poza kształtem", migrowane
    ręcznie — dowodem kompletności jest inwentarz grep karty, nie guard)."""
    assert _wzorce("x = round(p_kw) / 1000.0\n").get("J_skalowanie_jednostek", 0) == 0
    assert _wzorce("x = max(p_kw, 0.0) / 1000.0\n").get("J_skalowanie_jednostek", 0) == 0


def test_rodzina_j_subscript_z_kluczem_napisowym() -> None:
    assert _wzorce('x = row["prad_a"] / 1000.0\n').get("J_skalowanie_jednostek", 0) == 1
    assert _wzorce('x = linia["dlugosc_km"] * 1000.0\n').get("J_skalowanie_jednostek", 0) == 1


def test_rodzina_j_subscript_z_kluczem_nienapisowym_nie_liczy_sie() -> None:
    """Klucz zmienny (nie literał-napis) nie niesie tokenu jednostki do
    odczytania statycznie — poza kształtem."""
    assert _wzorce("x = row[klucz] / 1000.0\n").get("J_skalowanie_jednostek", 0) == 0


@pytest.mark.parametrize(
    "identyfikator",
    [
        "wartosc_a",
        "prad_ka",
        "napiecie_v",
        "u_kv",
        "dlugosc_m",
        "odcinek_km",
        "moc_kw",
        "moc_mw",
        "energia_wh",
        "energia_kwh",
        "energia_mwh",
        "moc_pozorna_va",
        "moc_pozorna_kva",
        "moc_pozorna_mva",
        "moc_bierna_var",
        "moc_bierna_kvar",
        "moc_bierna_mvar",
        "czas_s",
        "czas_ms",
        "admitancja_us",
        "pojemnosc_nf",
        "rezystancja_ohm",
        "_SQLITE_BUSY_TIMEOUT_S",
        "b_us_per_km",
        "c_nf_per_km",
        "clearing_time_ms",
        "MM",
        "przekroj_mm",
    ],
)
def test_rodzina_j_rozpoznaje_wszystkie_tokeny_jednostek_case_insensitive(
    identyfikator: str,
) -> None:
    assert _wzorce(f"x = {identyfikator} * 1000.0\n").get("J_skalowanie_jednostek", 0) == 1
    assert _wzorce(f"x = {identyfikator}.upper() * 1000.0\n") == {}


def test_rodzina_j_identyfikator_bez_tokenu_jednostki_nie_liczy_sie() -> None:
    assert _wzorce("x = numeric * 1000.0\n").get("J_skalowanie_jednostek", 0) == 0
    assert _wzorce("x = ikss * 1000.0\n").get("J_skalowanie_jednostek", 0) == 0
    assert _wzorce("x = arc_time * 1000.0\n").get("J_skalowanie_jednostek", 0) == 0


def test_rodzina_j_attribute_liczy_sie_po_ostatnim_segmencie() -> None:
    assert _wzorce("x = self.trafo.pk_kw * 1000.0\n").get("J_skalowanie_jednostek", 0) == 1
    assert _wzorce("x = self.trafo.label * 1000.0\n").get("J_skalowanie_jednostek", 0) == 0


def test_rodzina_j_operand_binop_jest_poza_ksztaltem() -> None:
    """`sum(...) * 1000.0`, `(a - b) * 1000.0`, `r_pu * base_mva * 1000.0` —
    drugi operand nie jest Name/Attribute/Subscript-z-kluczem-napisowym, więc
    guard ich NIE liczy (migrowane ręcznie, dowód w inwentarzu karty, nie w
    guardzie — §0.3)."""
    assert (
        _wzorce("x = sum(c.length_km for c in kable) * 1000.0\n").get("J_skalowanie_jednostek", 0)
        == 0
    )
    assert _wzorce("x = (time.monotonic() - start) * 1000\n").get("J_skalowanie_jednostek", 0) == 0
    assert _wzorce("x = r_pu * base_mva * 1000.0\n").get("J_skalowanie_jednostek", 0) == 0


def test_rodzina_j_fstring_wielokrotny_w_jednej_linii() -> None:
    kod = 'x = f"{a_ka*1000:.1f} A / {b_ka*1000:.1f} A"\n'
    assert _wzorce(kod).get("J_skalowanie_jednostek", 0) == 2


def test_rodzina_j_nie_liczy_napisu_ani_komentarza_ani_docstringu() -> None:
    kod = (
        "# przelicznik: wartosc_kw * 1000.0 -> W\n"
        "def f():\n"
        '    """b_us_per_km * 1e-6 -> S/km."""\n'
        '    return "x_kv * 1000"\n'
    )
    assert _wzorce(kod).get("J_skalowanie_jednostek", 0) == 0


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


def test_jednostki_naprawde_istnieje_i_niesie_rodzine_j() -> None:
    """`jednostki.py` (karta W3-F, §0.1) jest siostrą `wielkosci_pochodne.py`
    w TYM SAMYM pakiecie wykluczonym ze skanu produkcyjnego — sprawdzamy
    wprost (jak precedens dla `wielkosci_pochodne.py` powyżej), że każda
    funkcja skalowania faktycznie ma kształt rodziny J (operand = WŁASNY
    parametr funkcji, kończący się tokenem jednostki — dokładnie ten sam
    kształt co u wołającego)."""
    plik = BACKEND_SRC / "network_model" / "pochodne" / "jednostki.py"
    assert plik.exists()
    tekst = plik.read_text(encoding="utf-8")
    # Liść grafu importów: bez importów poza `from __future__ import annotations`
    # (K4.1/§0.1 karty W3-F — ani `math`, w odróżnieniu od `wielkosci_pochodne.py`).
    linie_importow = [
        linia
        for linia in tekst.splitlines()
        if linia.startswith("import ") or linia.startswith("from ")
    ]
    assert linie_importow == ["from __future__ import annotations"]
    for nazwa in (
        "kw_na_mw",
        "mw_na_kw",
        "kvar_na_mvar",
        "mvar_na_kvar",
        "kva_na_mva",
        "mva_na_kva",
        "kw_na_w",
        "mw_na_w",
        "mwh_na_kwh",
        "a_na_ka",
        "ka_na_a",
        "v_na_kv",
        "kv_na_v",
        "m_na_km",
        "km_na_m",
        "ms_na_s",
        "s_na_ms",
        "mikrosimens_na_simens",
        "mikrosimens_na_simens_ybus",
        "simens_na_mikrosimens",
    ):
        assert f"def {nazwa}(" in tekst, f"jednostki.py powinno definiować {nazwa}"
    wzorce = zlicz_wzorce(ast.parse(tekst))
    # Pin: dokladnie 20 funkcji, kazda z JEDNA operacja rodziny J na WLASNYM
    # parametrze (§0.1 karty) — precyzyjny pin silniejszy niz luzny prog,
    # zgodnie z regula "deklaracja bez testu = falszywa pewnosc".
    assert wzorce.get("J_skalowanie_jednostek", 0) == 20, (
        "jednostki.py powinno nieść dokladnie 20 wystapien ksztaltu rodziny J "
        "(kazda funkcja skaluje WLASNY parametr, ktorego nazwa konczy sie "
        "tokenem jednostki) — zmiana liczby funkcji wymaga aktualizacji pinu"
    )


def test_pin_stanu_repozytorium() -> None:
    """Zapadka = pomiar (obie strony). Wzrost = formuła fizyczna poza
    pochodne/; spadek = obniż ZASTANE. Karta K2 (2026-09-09) skasowała
    `application/reference_networks/**`; po W3-C1 (kasacja
    `application/analyses/protection/overcurrent/**`) i W3-C2 (kasacja
    `application/analyses/protection/line_overcurrent_setting/**`) zapadka
    rodzin E i J tych plików jest PUSTA."""
    assert porownaj_z_zapadka(zmierz(), ZASTANE) == []
    assert set(ZASTANE) <= {
        "application/analyses/protection/overcurrent/calculator.py",
        "application/analyses/protection/line_overcurrent_setting/analyzer.py",
        "application/analyses/protection/line_overcurrent_setting/spz_lookup.py",
    }


def test_rodzina_e_zastane_ma_jedyny_wpis_overcurrent_kalkulatora() -> None:
    """Rodzina E, DoD W3-A §4.1: `--pomiar` = 0 trafień poza ZASTANE, a jedyny
    dopuszczalny wpis ZASTANE dla tej rodziny to `overcurrent/calculator.py`
    (W3-C kasuje razem z V12K-189) — żadne inne miejsce nie ma prawa mieć
    tego kształtu w ZASTANE."""
    e_zastane = {
        plik: licznik["E_idmt_shape"]
        for plik, licznik in ZASTANE.items()
        if "E_idmt_shape" in licznik
    }
    assert e_zastane == {"application/analyses/protection/overcurrent/calculator.py": 1}


def test_wykluczone_prefiksy_to_solvery_i_siostrzany_pochodne() -> None:
    assert WYKLUCZONY_PREFIKSY == ("network_model/solvers/", "network_model/pochodne/")
