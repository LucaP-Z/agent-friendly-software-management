"""JSON Schema served to the UI, with $refs inlined and Optional collapsed."""

from typing import Any

from .models import STANDARD_EDGE_CATEGORIES, TYPES, EntityType


def _resolve(node: Any, defs: dict[str, Any]) -> Any:
    if isinstance(node, list):
        return [_resolve(n, defs) for n in node]
    if not isinstance(node, dict):
        return node
    if "$ref" in node:
        target = _resolve(defs[node["$ref"].split("/")[-1]], defs)
        return {**target, **{k: v for k, v in node.items() if k != "$ref"}}
    if "anyOf" in node:
        options = [o for o in node["anyOf"] if o.get("type") != "null"]
        if len(options) == 1 and len(options) != len(node["anyOf"]):
            rest = {k: v for k, v in node.items() if k != "anyOf"}
            return {**_resolve(options[0], defs), **rest, "nullable": True}
    if "allOf" in node and len(node["allOf"]) == 1:
        rest = {k: v for k, v in node.items() if k != "allOf"}
        return {**_resolve(node["allOf"][0], defs), **rest}
    return {k: _resolve(v, defs) for k, v in node.items() if k != "$defs"}


def type_schema(t: EntityType) -> dict[str, Any]:
    raw = t.model.model_json_schema()
    schema = _resolve(raw, raw.get("$defs", {}))
    props = schema["properties"]
    # Notes (the Markdown body) always last.
    schema["properties"] = {**{k: v for k, v in props.items() if k != "body"}, "body": props["body"]}
    return schema


def describe() -> dict[str, Any]:
    return {
        "types": [
            {
                "key": t.key,
                "label": t.label,
                "plural": t.plural,
                "prefix": t.prefix,
                "parent": t.parent,
                "schema": type_schema(t),
            }
            for t in TYPES.values()
        ],
        "standard_edge_categories": STANDARD_EDGE_CATEGORIES,
    }
