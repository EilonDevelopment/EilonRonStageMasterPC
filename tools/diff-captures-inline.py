#!/usr/bin/env python3
import re

CAP1 = """
1b0020b94cd88fabffff000000000900000100280002030010000000ffffffffffff158c3100549a4803fc0603292e0607d391ff070500eb0a005d93b12d3b7322f8000730181d1cc700b0876bf8b610ea0a00114100597f3f88310bff
"""

CAP2 = """
1b005050060681abffff000000000900000100280002030010000000ffffffffffff158c3100549a4803fc0603292e0607d391ff070500ec0a005d93b12d3b7322f8000730181d1cc700b0876bf8b610ea0a00114100597f3f88310bff
"""

CAP3 = """
1b00508af10781abffff000000000900000100280002030010000000ffffffffffff158c3100549a4803fc0603292e0607d391ff070500ec0c005d93b10e3b7342f8000730181d1cc740b0876bf8b610ea0a00194100597f3f88310bff
"""

def hx(s):
    return bytes.fromhex(re.sub(r"\s+", "", s))

c1, c2, c3 = hx(CAP1), hx(CAP2), hx(CAP3)

def diff(a, b, title):
    print(title)
    for i in range(max(len(a), len(b))):
        va = a[i] if i < len(a) else None
        vb = b[i] if i < len(b) else None
        if va != vb:
            sa = f"{va:02X}" if va is not None else "--"
            sb = f"{vb:02X}" if vb is not None else "--"
            print(f"  0x{i:04X}: {sa} -> {sb}")

diff(c1, c2, "CAP1 Ch235 vs CAP2 Ch236 (first 0x60):")
diff(c2, c3, "CAP2 vs CAP3 P250->P500 (first 0x60):")

print("\nSlot1 payload map (offset from 0x24):")
base = 0x24
fields = [
    (0x00, "LC id start", c1[0x24:0x27]),
    (0x13, "channel?", c1[0x37]),
    (0x14, "power?", c1[0x38]),
    (0x2C, "reg block", c1[0x50:0x56]),
]
for rel, name, val in fields:
    if isinstance(val, int):
        print(f"  +0x{rel:02X} (0x{base+rel:04X}) {name}: 0x{val:02X} ({val})")
    else:
        print(f"  +0x{rel:02X} (0x{base+rel:04X}) {name}: {val.hex(' ')}")

print("\nChannel byte across captures @0x37:")
print(f"  cap1=0x{c1[0x37]:02X} cap2=0x{c2[0x37]:02X} cap3=0x{c3[0x37]:02X}")
print("Byte @0x38:")
print(f"  cap1=0x{c1[0x38]:02X}({c1[0x38]}) cap2=0x{c2[0x38]:02X} cap3=0x{c3[0x38]:02X}({c3[0x38]})")

print("\nRegister FSCAL0 @0x52:")
print(f"  cap1=0x{c1[0x52]:02X}({c1[0x52]}) cap3=0x{c3[0x52]:02X}({c3[0x52]})")

# Compare full packet structure constants
print("\nHeader bytes 0x00-0x21:")
for i in range(0x22):
    if c1[i] != c2[i] or c1[i] != c3[i]:
        print(f"  0x{i:02X}: c1={c1[i]:02X} c2={c2[i]:02X} c3={c3[i]:02X}")
