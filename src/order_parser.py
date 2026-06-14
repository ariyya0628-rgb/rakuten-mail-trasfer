import base64
import re
from html import unescape


def _decode_body_data(data):
    if not data:
        return ""
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding).decode("utf-8", errors="replace")


def extract_text_from_payload(payload):
    texts = []

    def walk(part):
        mime_type = part.get("mimeType", "")
        body = part.get("body", {})
        data = body.get("data")

        if mime_type == "text/plain" and data:
            texts.append(_decode_body_data(data))
            return

        if "parts" in part:
            for child in part["parts"]:
                walk(child)
            return

        if mime_type == "text/html" and data and not texts:
            html = _decode_body_data(data)
            text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
            text = re.sub(r"<[^>]+>", "", text)
            texts.append(unescape(text))

    walk(payload)
    return "\n".join(texts)


def parse_order_email(text):
    order_number = _find_first(r"\[受注番号\]\s*([^\n\r]+)", text)
    ordered_at = _find_first(r"\[日時\]\s*([^\n\r]+)", text)
    product_block = _extract_product_block(text)
    products = _parse_products(product_block)

    return {
        "order_number": order_number,
        "ordered_at": ordered_at,
        "products": products,
    }


def format_line_message(order, prefix="楽天 注文商品"):
    lines = [prefix]

    if order.get("order_number"):
        lines.append(f"受注番号: {order['order_number']}")
    if order.get("ordered_at"):
        lines.append(f"日時: {order['ordered_at']}")

    products = order.get("products", [])
    if not products:
        lines.append("商品情報を抽出できませんでした。")
        return "\n".join(lines)

    for index, product in enumerate(products, start=1):
        lines.append("")
        lines.append(f"{index}. {product['name']}")
        for option in product.get("options", []):
            lines.append(option)
        if product.get("price"):
            lines.append(product["price"])

    return "\n".join(lines)


def _find_first(pattern, text):
    match = re.search(pattern, text)
    if not match:
        return ""
    return match.group(1).strip()


def _extract_product_block(text):
    match = re.search(
        r"\[商品\]\s*(.*?)(?:\n\*{10,}|\n送料計|\n支払い金額|\n-+\n|\n\[受注番号\])",
        text,
        flags=re.DOTALL,
    )
    if not match:
        return ""
    return match.group(1).strip()


def _parse_products(product_block):
    products = []
    name_lines = []
    options = []

    for raw_line in product_block.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if line.startswith("価格"):
            if name_lines:
                products.append(
                    {
                        "name": " ".join(name_lines).strip(),
                        "options": options,
                        "price": re.sub(r"\s+", " ", line),
                    }
                )
            name_lines = []
            options = []
            continue

        if line.startswith(("SKU管理番号", "サイズ", "カラー", "色", "数量")):
            options.append(line)
            continue

        name_lines.append(line)

    if name_lines:
        products.append({"name": " ".join(name_lines).strip(), "options": options, "price": ""})

    return products
