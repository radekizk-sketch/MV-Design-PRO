"""Kontrakt wejścia solverów (v1.0): kanoniczne, wersjonowane i deterministyczne przejście
ENM (graf sieci + katalog) → wejście gotowe dla solvera, ze śladem proweniencji każdego
parametru.

Moduły importuje się WPROST (``solver_input.builder.build_solver_input``,
``solver_input.eligibility.check_eligibility``, ``solver_input.provenance`` …). Ten plik
celowo nie re-eksportuje niczego (karta AB-H0 §0.0): gorliwy import budowniczego w
``__init__`` sprawiał, że import SAMEGO modułu ``solver_input.provenance`` ładował
``solver_input.builder`` i katalog (``network_model.catalog.repository``), a katalog nie
mógł zaimportować kontraktów, które przez ten łańcuch prowadziły z powrotem do niego
(cykl ``network_model.catalog.types`` ↔ ``repository``). Pomiar przed zmianą: zero miejsc
w ``src/``, ``tests/`` i ``scripts/`` importowało nazwę z korzenia pakietu.
"""
