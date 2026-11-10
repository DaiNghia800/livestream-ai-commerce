"""Catalog provider foundation for product attributes (colors and sizes)."""

from typing import Protocol, runtime_checkable

DEFAULT_COLORS: tuple[str, ...] = (
    "xanh dương", "xanh lá",
    "đen", "trắng", "đỏ", "xanh", "hồng",
    "vàng", "nâu", "xám", "tím", "cam",
    "be", "kem",
)

DEFAULT_SIZES: tuple[str, ...] = (
    "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"
)


@runtime_checkable
class CatalogProvider(Protocol):
    """Protocol defining the read-only catalog interface."""

    @property
    def known_colors(self) -> list[str]:
        """Return a copy of known color names."""
        ...

    @property
    def known_sizes(self) -> list[str]:
        """Return a copy of known size labels."""
        ...


class StaticCatalog:
    """In-memory immutable catalog provider for offline processing and testing."""

    def __init__(
        self,
        colors: list[str] | tuple[str, ...] | None = None,
        sizes: list[str] | tuple[str, ...] | None = None,
    ) -> None:
        if colors is None:
            self._colors: tuple[str, ...] = DEFAULT_COLORS
        else:
            # Defensive tuple copy, sorted longest-first so multi-word colors match before single-word
            self._colors = tuple(sorted(colors, key=len, reverse=True))

        if sizes is None:
            self._sizes: tuple[str, ...] = DEFAULT_SIZES
        else:
            self._sizes = tuple(sizes)

    @property
    def known_colors(self) -> list[str]:
        """Return a defensive copy of known colors to guarantee immutability."""
        return list(self._colors)

    @property
    def known_sizes(self) -> list[str]:
        """Return a defensive copy of known sizes to guarantee immutability."""
        return list(self._sizes)


DEFAULT_CATALOG = StaticCatalog()
