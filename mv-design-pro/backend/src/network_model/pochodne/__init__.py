"""Wielkości pochodne — jedno recenzowane miejsce dla formuł algebraicznych
wyprowadzających jedną wielkość znamionową z drugiej, poza rdzeniami solverów
(CV-4.3 K4, konstytucja C.2.3). Zobacz `wielkosci_pochodne.py`.
"""

from __future__ import annotations

from network_model.pochodne.wielkosci_pochodne import (
    SQRT2,
    SQRT3,
    calka_joule_ka2s,
    czlon_wykladniczy_kappa,
    impedancja_z_napiecia_i_mocy_ohm,
    impedancja_z_napiecia_i_pradu_ohm,
    moc_bierna_z_czynnej_i_cos_phi,
    moc_pozorna_z_czynnej_mva,
    moc_zwarciowa_z_pradu_mva,
    napiecie_fazowe_v,
    prad_roboczy_a,
    prad_z_mocy_pozornej_ka,
    prad_znamionowy_a,
    prad_znamionowy_z_mocy_czynnej_a,
    rezystancja_w_temperaturze,
    tan_phi_z_cos_phi,
    wspolczynnik_kappa,
)

__all__ = [
    "SQRT2",
    "SQRT3",
    "calka_joule_ka2s",
    "czlon_wykladniczy_kappa",
    "impedancja_z_napiecia_i_mocy_ohm",
    "impedancja_z_napiecia_i_pradu_ohm",
    "moc_bierna_z_czynnej_i_cos_phi",
    "moc_pozorna_z_czynnej_mva",
    "moc_zwarciowa_z_pradu_mva",
    "napiecie_fazowe_v",
    "prad_roboczy_a",
    "prad_z_mocy_pozornej_ka",
    "prad_znamionowy_a",
    "prad_znamionowy_z_mocy_czynnej_a",
    "rezystancja_w_temperaturze",
    "tan_phi_z_cos_phi",
    "wspolczynnik_kappa",
]
