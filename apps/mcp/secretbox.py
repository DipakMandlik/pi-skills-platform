from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from typing import Any


class SecretBoxError(ValueError):
    pass


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def _derive_key(secret: str, label: str) -> bytes:
    return hashlib.sha256(f"{label}:{secret}".encode("utf-8")).digest()


def _keystream(key: bytes, nonce: bytes, length: int) -> bytes:
    blocks: list[bytes] = []
    counter = 0
    while sum(len(block) for block in blocks) < length:
        counter_bytes = counter.to_bytes(4, "big", signed=False)
        blocks.append(hashlib.sha256(key + nonce + counter_bytes).digest())
        counter += 1
    return b"".join(blocks)[:length]


def encrypt_json(payload: dict[str, Any], secret: str) -> str:
    if not secret:
        raise SecretBoxError("encryption secret is required")

    plaintext = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    nonce = secrets.token_bytes(16)
    enc_key = _derive_key(secret, "enc")
    mac_key = _derive_key(secret, "mac")

    stream = _keystream(enc_key, nonce, len(plaintext))
    ciphertext = bytes(a ^ b for a, b in zip(plaintext, stream))

    mac_input = b"v1" + nonce + ciphertext
    mac = hmac.new(mac_key, mac_input, hashlib.sha256).digest()
    return f"v1.{_b64encode(nonce)}.{_b64encode(ciphertext)}.{_b64encode(mac)}"


def decrypt_json(token: str, secret: str) -> dict[str, Any]:
    if not token:
        raise SecretBoxError("encrypted payload is required")
    if not secret:
        raise SecretBoxError("decryption secret is required")

    parts = token.split(".")
    if len(parts) != 4 or parts[0] != "v1":
        raise SecretBoxError("invalid encrypted payload format")

    nonce = _b64decode(parts[1])
    ciphertext = _b64decode(parts[2])
    mac = _b64decode(parts[3])

    mac_key = _derive_key(secret, "mac")
    expected_mac = hmac.new(mac_key, b"v1" + nonce + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(mac, expected_mac):
        raise SecretBoxError("encrypted payload integrity check failed")

    enc_key = _derive_key(secret, "enc")
    stream = _keystream(enc_key, nonce, len(ciphertext))
    plaintext = bytes(a ^ b for a, b in zip(ciphertext, stream))

    try:
      decoded = json.loads(plaintext.decode("utf-8"))
    except Exception as exc:  # pragma: no cover - malformed payloads are rare
        raise SecretBoxError("failed to decode encrypted payload") from exc

    if not isinstance(decoded, dict):
        raise SecretBoxError("decrypted payload must be an object")
    return decoded
