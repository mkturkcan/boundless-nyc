"""A small PNG writer (zlib + struct only), so sensor data can be saved without PIL or numpy."""
from __future__ import annotations

import struct
import zlib

_COLOR_TYPE = {1: 0, 2: 4, 3: 2, 4: 6}  # channels -> PNG colour type (gray, gray+alpha, RGB, RGBA)


def _chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def encode_png(width: int, height: int, data, channels: int = 4, bitdepth: int = 8, level: int = 6) -> bytes:
    """`data`: top-down rows, `channels` samples per pixel. For bitdepth 16 the samples must already be big-endian."""
    if channels not in _COLOR_TYPE:
        raise ValueError("channels must be 1, 2, 3 or 4")
    mv = memoryview(data).cast("B")
    stride = width * channels * (bitdepth // 8)
    if len(mv) != stride * height:
        raise ValueError(f"expected {stride * height} bytes, got {len(mv)}")
    raw = bytearray()
    for y in range(height):
        raw.append(0)                        # filter: none
        raw += mv[y * stride:(y + 1) * stride]
    ihdr = struct.pack(">IIBBBBB", width, height, bitdepth, _COLOR_TYPE[channels], 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", zlib.compress(bytes(raw), level)) + _chunk(b"IEND", b"")


def write_png(path: str, width: int, height: int, data, channels: int = 4, bitdepth: int = 8) -> str:
    with open(path, "wb") as f:
        f.write(encode_png(width, height, data, channels, bitdepth))
    return path
