"""The UI <-> file contract: entity model <-> Markdown file with YAML frontmatter.

Rules (see docs/contract.md):
- Frontmatter keys are written in model field order; unknown keys are preserved after them.
- The Markdown body is the `body` field, stored verbatim after the closing `---`.
- Serialization is deterministic: unchanged data produces byte-identical files.
"""

import hashlib
import io
import re
import types
import typing
from typing import Any

from pydantic import BaseModel
from ruamel.yaml import YAML
from ruamel.yaml.scalarstring import LiteralScalarString

from .models import TYPES, Entity, EntityType

_FRONT = re.compile(r"\A---\n(.*?)^---[ \t]*\n?(.*)\Z", re.DOTALL | re.MULTILINE)

_yaml = YAML(typ="rt")
_yaml.default_flow_style = False
_yaml.width = 10_000
_yaml.allow_unicode = True
_yaml.indent(mapping=2, sequence=4, offset=2)


class ContractError(ValueError):
    """The file cannot be read as an entity."""


def file_hash(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def plain(value: Any) -> Any:
    """Convert ruamel containers/scalars to plain Python types."""
    if isinstance(value, dict):
        return {str(k): plain(v) for k, v in value.items()}
    if isinstance(value, list):
        return [plain(v) for v in value]
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, int):
        return int(value)
    if isinstance(value, float):
        return float(value)
    if isinstance(value, str):
        return str(value)
    return value  # dates etc.: pydantic will complain if the field is not a string


def split_document(raw: str) -> tuple[dict[str, Any], str]:
    m = _FRONT.match(raw)
    if not m:
        raise ContractError("missing YAML frontmatter (file must start with '---')")
    try:
        front = _yaml.load(m.group(1)) or {}
    except Exception as e:  # ruamel raises many types
        raise ContractError(f"invalid YAML frontmatter: {e}") from e
    if not isinstance(front, dict):
        raise ContractError("frontmatter must be a mapping")
    body = m.group(2)
    if body.startswith("\n"):
        body = body[1:]
    return plain(front), body.strip("\n")


def parse(raw: bytes, model: type[Entity]) -> tuple[Entity, dict[str, Any]]:
    """Parse file bytes into (entity, raw frontmatter dict)."""
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as e:
        raise ContractError("file is not valid UTF-8") from e
    front, body = split_document(text)
    try:
        entity = model.model_validate({**front, "body": body})
    except Exception as e:
        raise ContractError(f"invalid content: {e}") from e
    return entity, front


def identify(raw: bytes) -> tuple[EntityType, str]:
    """Work out the entity type of a file from the id in its frontmatter."""
    try:
        front, _ = split_document(raw.decode("utf-8"))
    except (UnicodeDecodeError, ContractError) as e:
        raise ContractError(str(e)) from e
    eid = front.get("id")
    if not isinstance(eid, str):
        raise ContractError("frontmatter has no string 'id'")
    for t in TYPES.values():
        if t.parent is None and re.fullmatch(rf"{t.prefix}-\d{{2,}}", eid):
            return t, eid
        if t.parent is not None and re.fullmatch(rf"{t.prefix}-\d{{2,}}\.\d+", eid):
            return t, eid
    raise ContractError(f"unrecognised id {eid!r}")


# ----------------------------------------------------------------- serialising


def _nested_model(annotation: Any) -> tuple[type[BaseModel] | None, bool]:
    """Return (model class, is_list) if the annotation is a BaseModel or list of them."""
    origin = typing.get_origin(annotation)
    if origin in (typing.Union, types.UnionType):
        for arg in typing.get_args(annotation):
            if arg is not type(None):
                return _nested_model(arg)
    if origin is list:
        inner, _ = _nested_model(typing.get_args(annotation)[0])
        return inner, True
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return annotation, False
    return None, False


def _carry_unknown(data: dict[str, Any], raw: Any, cls: type[BaseModel]) -> None:
    """Copy keys the model does not know about from the original frontmatter into `data`."""
    if not isinstance(raw, dict):
        return
    for k, v in raw.items():
        if k not in cls.model_fields:
            data[k] = v
    for name, field in cls.model_fields.items():
        sub, is_list = _nested_model(field.annotation)
        if sub is None or name not in data or name not in raw:
            continue
        if is_list:
            by_id = {i.get("id"): i for i in raw[name] if isinstance(i, dict) and i.get("id")}
            for item in data[name]:
                _carry_unknown(item, by_id.get(item.get("id")), sub)
        else:
            _carry_unknown(data[name], raw[name], sub)


def _literal(value: Any) -> Any:
    """Multi-line strings become YAML block scalars so they stay readable in diffs."""
    if isinstance(value, dict):
        return {k: _literal(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_literal(v) for v in value]
    if isinstance(value, str) and "\n" in value:
        return LiteralScalarString(value)
    return value


def frontmatter_data(entity: Entity, raw_front: dict[str, Any] | None) -> dict[str, Any]:
    data = entity.model_dump(mode="json", exclude={"body"}, context={"prune": True})
    _carry_unknown(data, raw_front, type(entity))
    return data


def render(entity: Entity, raw_front: dict[str, Any] | None = None) -> bytes:
    """Serialise an entity to file bytes, preserving unknown keys from `raw_front`."""
    buf = io.StringIO()
    _yaml.dump(_literal(frontmatter_data(entity, raw_front)), buf)
    out = f"---\n{buf.getvalue()}---\n"
    body = entity.body.strip("\n")
    if body:
        out += f"\n{body}\n"
    return out.encode("utf-8")
