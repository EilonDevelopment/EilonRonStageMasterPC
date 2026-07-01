#!/usr/bin/env python3
"""Parse LabVIEW 'Save Parameters to CRR' hex capture."""

HEX_LINES = """
0000   1b 00 10 40 b6 f6 8f ab ff ff 00 00 00 00 09 00   ...@............
0010   00 01 00 28 00 02 03 00 10 00 00 00 ff ff ff ff   ...(............
0020   ff ff 15 8c 31 00 54 9a 48 03 fc 06 03 29 2e 06   ....1.T.H....)..
0030   07 d3 91 ff 07 05 00 eb 0a 00 5d 93 b1 2d 3b 73   ..........]..-;s
0040   22 f8 00 07 30 18 1d 1c c7 00 b0 87 6b f8 b6 10   "...0.......k...
0050   ea 0a 00 11 41 00 59 7f 3f 88 31 0b ff 00 00 00   ....A.Y.?.1.....
"""

def parse_hex_dump(text: str) -> bytes:
    out = bytearray()
    for line in text.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        # skip offset column
        hex_part = []
        for p in parts[1:]:
            if len(p) == 2 and all(c in "0123456789abcdefABCDEF" for c in p):
                hex_part.append(p)
            else:
                break
        out.extend(bytes.fromhex("".join(hex_part)))
    return bytes(out)


# Full dump from user message (truncated in file - read from stdin or embed)
import re
import sys

def load_full_dump() -> bytes:
    path = r"C:\Users\Moshe\Cursor\EilonRonStageMasterPC\tools\save-crr-capture.hex"
    try:
        with open(path, "r", encoding="utf-8") as f:
            return parse_hex_dump(f.read())
    except FileNotFoundError:
        return b""


def find_markers(data: bytes):
    markers = [
        (b"\xff\xff", "FF FF"),
        (b"\xeb\xeb", "EB EB (ch235?)"),
        (b"\xcd\xcd", "CD CD (ch205?)"),
        (b"\x32\x32", "32 32 (ch50?)"),
        (b"\x0b\x00\x00\x00", "0B slot?"),
    ]
    for m, name in markers:
        idx = 0
        while True:
            i = data.find(m, idx)
            if i < 0:
                break
            print(f"  {name} @ 0x{i:04X}")
            idx = i + 1


def main():
    data = load_full_dump()
    if not data:
        print("No capture file; run with save-crr-capture.hex")
        return
    print(f"Total length: {len(data)} bytes (0x{len(data):X})")
    print("\nHeader (first 32 bytes):")
    for i in range(0, min(32, len(data)), 16):
        chunk = data[i : i + 16]
        print(f"  {i:04X}: {chunk.hex(' ')}")
    print("\nMarkers:")
    find_markers(data)
    # section distances
    sections = [0x22, 0x19A, 0x30A, 0x478, 0x5EC]
    print("\nSection starts:")
    for i, off in enumerate(sections):
        nxt = sections[i + 1] if i + 1 < len(sections) else len(data)
        print(f"  sec{i+1} @ 0x{off:04X} len={nxt-off} marker={data[off-2:off].hex() if off>=2 else '?'}")

    # registers from UI: 0x0A,0,0x11,0x41,0,0x3B for RF1
    pat = bytes([0x0A, 0x00, 0x11, 0x41])
    i = data.find(pat)
    print(f"\nRegister block 0A 00 11 41 @ 0x{i:04X}" if i >= 0 else "\nRegister block not found")

    # channel bytes
    for ch, name in [(235, "Ch235"), (205, "Ch205"), (50, "Ch50"), (250, "Pwr250"), (10, "Pwr10")]:
        hits = [i for i in range(len(data)) if data[i] == ch]
        print(f"{name} (0x{ch:02X}): {len(hits)} hits, first @ {[f'0x{x:04X}' for x in hits[:5]]}")


if __name__ == "__main__":
    main()
