"""
Moduł modelu sieci elektroenergetycznej.

Pakiet zawiera komponenty do modelowania sieci elektroenergetycznych
średniego napięcia (SN) i obliczeń rozpływu mocy.
"""

# Pierwszy import pakietu: jedna polityka wątków BLAS procesu (`watki_blas.py`), zanim
# którykolwiek moduł `network_model` policzy macierz — wynik solvera nie zależy od
# `OPENBLAS_NUM_THREADS` ani od historii procesu.
from . import watki_blas  # noqa: F401  # isort: skip
from .core import Bus, Node, NodeType

__all__ = ["Bus", "Node", "NodeType"]
