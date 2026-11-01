"""
ai_prompt.py — Prompt, output schema and result shaping shared by every AI
provider (Gemini, OpenAI).

The AI is the decision maker for anything the regex fast path cannot settle:
it reads the whole comment, the livestream's product list, and returns what
the customer wants as a list of items. The worker never invents a quantity
or a product code on the AI's behalf.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class PurchaseItem(BaseModel):
    """One product the customer named, as the AI read it."""

    model_config = ConfigDict(strict=True)

    product_code: str | None = Field(
        None, description="Product or SKU code from the catalogue, else null"
    )
    quantity: int | None = Field(
        None, description="Explicit quantity as an integer, else null"
    )
    color: str | None = Field(None, description="Colour mentioned, else null")
    size: str | None = Field(None, description="Size mentioned, else null")


class PurchaseIntentSchema(BaseModel):
    """Structured answer the AI must return."""

    # Giữ đúng kiểu JSON: boolean, chuỗi, số nguyên; không ép kiểu ngầm.
    model_config = ConfigDict(strict=True)

    has_intent: bool = Field(description="True if the customer wants to buy")
    kind: Literal["purchase", "question", "other"] | None = Field(
        None, description="purchase = wants to buy now; question = asking the shop; other = chatter, negation, condition"
    )
    items: list[PurchaseItem] = Field(
        default_factory=list, description="Products the customer wants, empty if none"
    )
    # Dạng phẳng một sản phẩm (hợp đồng cũ). AI mới trả items; nếu chỉ có
    # các trường này thì to_result gói chúng thành một item.
    product_code: str | None = Field(None, description="Legacy single product code; prefer items")
    quantity: int | None = Field(None, description="Legacy single quantity; prefer items")
    color: str | None = Field(None, description="Legacy single colour; prefer items")
    size: str | None = Field(None, description="Legacy single size; prefer items")


SYSTEM_PROMPT = """\
You are the purchase intent reader for a Vietnamese livestream commerce platform.
Viewers comment in Vietnamese, often without accents, with slang, typos and
teasing. Read the WHOLE comment in context and decide what the viewer wants.

Return ONLY a JSON object with this shape:
{
  "has_intent": true/false,
  "kind": "purchase" | "question" | "other",
  "items": [ { "product_code": "string or null", "quantity": integer or null,
               "color": "string or null", "size": "string or null" } ],
  "product_code": null, "quantity": null, "color": null, "size": null
}
The four top-level fields after "items" are legacy: always leave them null
and put everything in "items".

How to decide "kind":
- "purchase": the viewer wants to buy now ("chốt", "mua", "lấy", "cho em",
  "order", "đặt", or any phrasing that clearly means buying), even when
  wrapped in jokes or extra words ("tao se vi em ma mua 5 cai ...").
- "question": the viewer is asking the shop something ("còn hàng không?",
  "giá bao nhiêu", "ship về X được không") and has NOT committed to buy.
  A purchase phrased as a question ("mua A12 2 cái được không?") is still a
  question.
- "other": chatter, compliments, complaints, explicit refusal ("không mua"),
  or a purchase that depends on a condition ("nếu còn hàng thì lấy").

How to fill "items":
- One entry per product the viewer wants; several products in one comment
  give several entries, each with its own quantity.
- You receive the livestream's product list (product code, SKU code, name,
  variant). Map what the viewer says to that list: a code typed by the
  viewer, or a product NAME / description ("áo thun demo", "cái áo đen size M").
  When the viewer types a SKU code, return that exact SKU code. When the
  colour/size they mention identify one SKU, return that SKU code. Otherwise
  return the product code. If nothing in the list matches, set product_code
  to null.
- quantity: only when the viewer states a number ("2 cái", "hai cái", "x3",
  "sl 5"). Never default to 1. Never take prices, product-code digits,
  sizes or phone numbers as quantities. Must be a JSON integer or null.
- color/size: only if mentioned, as written in Vietnamese.
- Corrections like "nhầm, 10 cái" or "thêm 5 cái nữa" refer to a previous
  comment you cannot see: return kind "purchase" with the quantity stated and
  product_code null unless the product is named in this comment.
- For "question"/"other", items may still list products mentioned, with
  quantity only if stated.
"""


def _catalogue_lines(catalogue: list[dict[str, Any]]) -> str:
    """Render the product list the AI must map names to."""
    if not catalogue:
        return "(no product list available for this livestream)"
    rows = []
    for p in catalogue:
        code = p.get("productCode") or "?"
        sku = p.get("skuCode") or ""
        name = p.get("productName") or ""
        variant = p.get("variantName") or ""
        rows.append(f"- product_code={code}" + (f" sku_code={sku}" if sku else "")
                    + f" name=\"{name}\"" + (f" variant=\"{variant}\"" if variant else ""))
    return "\n".join(rows)


def build_user_prompt(content: str, catalogue: list[dict[str, Any]] | None = None) -> str:
    """Build the user message: product list first, then the comment."""
    return (
        "Products in this livestream:\n"
        f"{_catalogue_lines(catalogue or [])}\n\n"
        f"Viewer comment:\n\"{content}\""
    )


def to_result(parsed: PurchaseIntentSchema) -> dict[str, Any]:
    """Flatten the schema into the dict shape the worker passes around.

    Legacy single-product fields mirror the first item so older callers and
    the comment.analyzed contract keep working.
    """
    items = [
        {"product_code": i.product_code, "quantity": i.quantity, "color": i.color, "size": i.size}
        for i in parsed.items
    ]
    legacy = {"product_code": parsed.product_code, "quantity": parsed.quantity,
              "color": parsed.color, "size": parsed.size}
    if not items and (parsed.has_intent or any(v is not None for v in legacy.values())):
        items = [legacy]
    first = items[0] if items else {"product_code": None, "quantity": None, "color": None, "size": None}
    return {
        "has_intent": parsed.has_intent,
        "kind": parsed.kind or ("purchase" if parsed.has_intent else "other"),
        "items": items,
        "product_code": first["product_code"],
        "quantity": first["quantity"],
        "color": first["color"],
        "size": first["size"],
    }
