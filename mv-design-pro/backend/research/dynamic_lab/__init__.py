"""Laboratorium dynamiczne MV-DESIGN-PRO — KOD BADAWCZY, POZA PRODUKCJĄ.

Patrz `backend/research/README.md`. Ten pakiet celowo NIE jest w
`pyproject.toml::packages`, więc kod produkcyjny nie może go zaimportować.

Wynik z tego pakietu jest z definicji `EvidenceTier.UNVALIDATED_MODEL` i NIE MOŻE
zasilać certyfikatu, wniosku ani żadnego dowodu regulacyjnego.
"""

NIE_JEST_DOWODEM_REGULACYJNYM = True
"""Znacznik czytelny maszynowo — pilnowany przez guard izolacji."""
