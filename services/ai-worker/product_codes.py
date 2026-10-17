"""Recognize complete MVP identifiers without checking Commerce existence.

Commerce also contains AO01TFORMRONG and AO-SM-LUA. They are unsupported
by this MVP grammar, not invalid Commerce identifiers. Product codes, SKU
codes, AI codes and database IDs are not interchangeable here.
"""

import re
import unicodedata


_TOKEN = re.compile(r"[\w./+−-]+")
_LETTER = re.compile(r"[^\W\d_]")
_DIGIT = re.compile(r"\d")
_SUPPORTED_CODE = re.compile(r"[A-Za-z]+(?:-[A-Za-z]+)*-?\d+(?:-[A-Za-z0-9]+)*")
MAX_CODE_LENGTH = 50


def is_supported_product_code(code: str) -> bool:
    """Apply the MVP grammar and length bound to an entire identifier."""
    return len(code) <= MAX_CODE_LENGTH and _SUPPORTED_CODE.fullmatch(code) is not None


def find_product_identifiers(content: str) -> list[str]:
    """Return distinct complete identifier-like tokens, including unsupported ones.

    A letter before the first digit distinguishes identifiers from quantities
    and prices such as +2cai, 2e3 and 200k. Ordinary words are not identifiers.
    Only supported codes are uppercased; Unicode folding must not repair an
    unsupported identifier. Surrounding sentence periods are punctuation.
    """
    identifiers = []
    for match in _TOKEN.finditer(unicodedata.normalize("NFC", content)):
        token = match.group().rstrip(".")
        letter, digit = _LETTER.search(token), _DIGIT.search(token)
        if letter and digit and letter.start() < digit.start():
            identifiers.append(token.upper() if is_supported_product_code(token) else token)
    return list(dict.fromkeys(identifiers))


def mask_product_codes(content: str) -> str:
    """Hide supported code spans only in a normalized attribute-reading copy.

    Non-word, non-whitespace markers keep separate color words from joining
    across a hidden code. Sentence punctuation and external attributes remain.
    """
    def mask(match: re.Match[str]) -> str:
        token = match.group().rstrip(".")
        if is_supported_product_code(token):
            return "#" * len(token) + match.group()[len(token):]
        return match.group()

    return _TOKEN.sub(mask, unicodedata.normalize("NFC", content))
