"""
MathSpecVersion — versioned mathematical specification (PR-34).

Semver for the mathematical specification used in trace generation.
Pinned to each Run for reproducibility.

Rules:
- Equation change → MINOR bump
- Parameter change → PATCH bump
- Breaking change → MAJOR bump
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_SEMVER_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")

CURRENT_MATH_SPEC_VERSION = "1.0.0"


@dataclass(frozen=True)
class MathSpecVersion:
    """Semver for the math spec.

    Attributes:
        major: Breaking changes to equations
        minor: New equations or equation modifications
        patch: Parameter changes, formatting changes
    """

    major: int
    minor: int
    patch: int

    def __str__(self) -> str:
        return f"{self.major}.{self.minor}.{self.patch}"

    @classmethod
    def parse(cls, version_str: str) -> MathSpecVersion:
        """Parse semver string like '1.0.0'."""
        match = _SEMVER_RE.match(version_str)
        if not match:
            raise ValueError(f"Invalid MathSpecVersion: {version_str!r}")
        return cls(
            major=int(match.group(1)),
            minor=int(match.group(2)),
            patch=int(match.group(3)),
        )

    @classmethod
    def current(cls) -> MathSpecVersion:
        """Return the current math spec version."""
        return cls.parse(CURRENT_MATH_SPEC_VERSION)

    def is_compatible_with(self, other: MathSpecVersion) -> bool:
        """Check if this version is compatible with another (same major)."""
        return self.major == other.major

    def __lt__(self, other: MathSpecVersion) -> bool:
        return (self.major, self.minor, self.patch) < (other.major, other.minor, other.patch)

    def __le__(self, other: MathSpecVersion) -> bool:
        return (self.major, self.minor, self.patch) <= (other.major, other.minor, other.patch)
