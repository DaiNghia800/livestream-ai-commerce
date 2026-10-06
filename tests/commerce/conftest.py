"""conftest.py — cho pytest thấy mã nguồn của Commerce Service.

Thêm 'services/commerce/' vào sys.path để test import được `app.*`,
giống cách tests/ai-worker/conftest.py đang làm.
"""

from pathlib import Path
import sys


COMMERCE_DIR = Path(__file__).resolve().parents[2] / "services" / "commerce"
sys.path.insert(0, str(COMMERCE_DIR))