"""Proza dokumentu dowodowego z symbolami jako segmentami ``$…$`` (karta PROZA-BEZ-SYMBOLI-ASCII).

Kontrakt prezentacji: symbol wielkości jest składany jako wzór, nigdy pokazywany ASCII. Renderer
LaTeX dokumentu (``LaTeXRenderer._proza``) zostawia segment ``$…$`` wzorem w linii, a resztę
escapuje jak dotąd. Iloczyn: {tekst bez segmentu · z segmentem · z kilkoma segmentami} ×
{znaki specjalne LaTeX poza segmentem · bez nich} oraz miejsca wpięcia (tytuł kroku,
ostrzeżenia, tytuł dokumentu) w realnym dokumencie SC3F.
"""

from __future__ import annotations

import pytest
from application.proof_engine.latex_renderer import LaTeXRenderer


@pytest.mark.parametrize(
    ("tekst", "oczekiwany"),
    [
        ("Prąd zwarciowy początkowy", "Prąd zwarciowy początkowy"),
        ("Udział 50% i klucz ik_ka", r"Udział 50\% i klucz ik\_ka"),
        ("Prąd $I_k''$ w punkcie", "Prąd $I_k''$ w punkcie"),
        ("Prąd $I_{th}$ i 5% zapasu", r"Prąd $I_{th}$ i 5\% zapasu"),
        ("$R_k/X_k$ pętli z $Z_f$ & sieć", r"$R_k/X_k$ pętli z $Z_f$ \& sieć"),
    ],
)
def test_proza_zostawia_segment_wzoru_i_escapuje_reszte(tekst: str, oczekiwany: str) -> None:
    assert LaTeXRenderer._proza(tekst) == oczekiwany


def test_dokument_sc3f_sklada_symbole_prozy_jako_wzory() -> None:
    """Realna ścieżka: dowód SC3F → LaTeX. Tytuł kroku z rejestru równań niesie symbol jako
    segment `$…$`; w dokumencie segment zostaje wzorem (bez `\\$` i bez `\\_`)."""
    from application.proof_engine.packs.sc_symmetrical import SC3FProofPack

    from tests.proof_engine.test_sc3f_pack import _ARTIFACT, _enm, _fault_node_id, _pack_input

    enm = _enm(with_machine=True)
    dane = _pack_input(enm, _fault_node_id(enm, "Szyna OZE"), tb_s=None)
    dokument = SC3FProofPack.generate(dane, _ARTIFACT).proof_sc3f
    tex = LaTeXRenderer.render(dokument)
    tytuly = [krok.title_pl for krok in dokument.steps if "$" in krok.title_pl]
    assert tytuly, "dowód SC3F z maszyną ma tytuły kroków z symbolami"
    for tytul in tytuly:
        assert LaTeXRenderer._proza(tytul) in tex
    assert r"\$" not in tex
    # Ostrzeżenie o czasie wyłączenia będącym wartością roboczą — proza słowami, bez symbolu.
    assert any("wyłączenia będącym wartością roboczą" in w for w in dokument.summary.warnings)
    assert not any("t_b" in w or "I_b" in w for w in dokument.summary.warnings)
