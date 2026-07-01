#!/usr/bin/env python3
"""Diff LabVIEW Save-to-CRR captures."""

import re
from pathlib import Path


def parse_hex_dump(text: str) -> bytes:
    out = bytearray()
    for line in text.strip().splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        hex_part = []
        for p in parts[1:]:
            if len(p) == 2 and all(c in "0123456789abcdefABCDEF" for c in p):
                hex_part.append(p)
            else:
                break
        if hex_part:
            out.extend(bytes.fromhex("".join(hex_part)))
    return bytes(out)


def load(name: str) -> bytes:
    return parse_hex_dump(Path(__file__).with_name(name).read_text(encoding="utf-8"))


def diff(a: bytes, b: bytes, label: str):
    print(f"\n=== {label} ===")
    n = max(len(a), len(b))
    changes = []
    for i in range(n):
        va = a[i] if i < len(a) else None
        vb = b[i] if i < len(b) else None
        if va != vb:
            changes.append((i, va, vb))
    print(f"Total diffs: {len(changes)}")
    for i, va, vb in changes[:80]:
        ctx_a = a[max(0, i - 4) : i + 5].hex(" ") if i < len(a) else ""
        print(f"  0x{i:04X}: {va:02X if va is not None else '--'} -> {vb:02X if vb is not None else '--'}  ctx: {ctx_a}")


def slot_markers(data: bytes):
    print("\n=== Slot markers (every 0x16E from 0x198) ===")
    for slot in range(2, 16):
        off = 0x198 + (slot - 2) * 0x16E
        if off + 2 <= len(data):
            m = data[off : off + 4]
            print(f"  Slot {slot:2d} @ 0x{off:04X}: {m.hex(' ')}")


def analyze_addr1_block(c1: bytes):
    print("\n=== Addr1 active block (0x22-0x197) non-zero ranges ===")
    block = c1[0x22:0x198]
    i = 0
    while i < len(block):
        if block[i] != 0:
            start = i
            while i < len(block) and block[i] != 0:
                i += 1
            print(f"  +0x{start:03X} (abs 0x{0x22+start:04X}): {block[start:i].hex(' ')}")
        i += 1


def main():
    c1 = load("capture1.hex")
    c2 = load("capture2.hex")
    c3 = load("capture3.hex")
    print(f"Lengths: c1={len(c1)} c2={len(c2)} c3={len(c3)}")

    diff(c1, c2, "CAP1 (Ch235) vs CAP2 (Ch236)")
    diff(c2, c3, "CAP2 (Ch236,P250) vs CAP3 (Ch236,P500)")
    diff(c1, c3, "CAP1 vs CAP3")

    for name, data in [("CAP1", c1), ("CAP2", c2), ("CAP3", c3)]:
        print(f"\n--- Header {name} ---")
        print(data[0:0x22].hex(" "))
        slot_markers(data)

    analyze_addr1_block(c1)

    # Channel/power offsets relative to slot1 payload start 0x24
    print("\n=== Confirmed field offsets (slot 1 payload) ===")
    print("  Channel @ 0x037 (slot1): EB=235, EC=236")
    print("  Power   @ 0x038? check cap3")
    for off in [0x35, 0x36, 0x37, 0x38, 0x39]:
        print(f"  0x{off:04X}: cap1={c1[off]:02X} cap2={c2[off]:02X} cap3={c3[off]:02X}")


if __name__ == "__main__":
    main()
