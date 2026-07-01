#!/usr/bin/env python3
"""Analyze LabVIEW Save-to-CRR two-packet flow."""

CRR_PREAMBLE = bytes([0xFF] * 6)
TERMINATOR = 0xAA


def calc_crr_nibble_checksum(data: bytes) -> int:
    total = 0
    for b in data:
        total += (b >> 4) + (b & 0x0F)
    return (0xFF - (total & 0xFF)) & 0xFF


def parse_dump(text: str) -> bytes:
    out = bytearray()
    for line in text.strip().splitlines():
        parts = line.split()
        for p in parts[1:]:
            if len(p) == 2 and all(c in "0123456789abcdefABCDEF" for c in p):
                out.append(int(p, 16))
            else:
                break
    return bytes(out)


P2_TAIL = bytes.fromhex(
    "1b00508af10781abffff000000000900000100280002039505000000000000000000"
    + "00" * (0x5AD - 32)
    + "c8aa"
)

# Build packet2 from user tail - last line 05a0 has c8 aa aa at end
# Offsets: 0x5AD=c8, 0x5AE=aa, 0x5AF=aa per user dump


def analyze_packet2_end():
  # minimal: header 32 bytes + zeros + c8 aa at 0x5AD
  size = 0x5B0  # through second aa
  pkt = bytearray(size)
  hdr = bytes.fromhex("1b00508af10781abffff0000000009000001002800020395050000000000000000")
  pkt[: len(hdr)] = hdr
  pkt[0x5AD] = 0xC8
  pkt[0x5AE] = 0xAA
  pkt[0x5AF] = 0xAA
  print(f"Packet2 size (guess): {size}")
  print(f"Tail: {pkt[-8:].hex(' ')}")
  # try find framed block ending aa
  for i in range(len(pkt) - 1, max(0, len(pkt) - 32), -1):
    if pkt[i] == 0xAA:
      print(f"  AA @ 0x{i:04X}")
  # standard CRR frame at end?
  for start in range(max(0, size - 20), size):
    if pkt[start : start + 6] == CRR_PREAMBLE:
      print(f"  preamble @ 0x{start:04X}")


def try_checksum_variants(content_end_idx: int):
  """User: ends with c8 aa (maybe aa aa)."""
  # If frame is: [labview hdr][zeros][FF*6][len hi][len lo][body...][chk][AA]
  # Search backwards from 0x5AE for preamble
  pass


# Packet 1 vs 2 header diff
P1_HDR = bytes.fromhex("1b00508af10781abffff000000000900000100280002030010000000ffffffffffff")
P2_HDR = bytes.fromhex("1b00508af10781abffff0000000009000001002800020395050000000000000000")

print("=== Header diff P1 vs P2 ===")
for i in range(32):
    if P1_HDR[i] != P2_HDR[i]:
        print(f"  0x{i:02X}: P1={P1_HDR[i]:02X} P2={P2_HDR[i]:02X}")

print("\n=== P2 opcode region ===")
print("P1 bytes 0x16-0x1F:", P1_HDR[0x16:0x20].hex(" "))
print("P2 bytes 0x16-0x1F:", P2_HDR[0x16:0x20].hex(" "))

# If P2 entire payload is wrapped: try checksum over 0x00-0x5AC with 0x5AD=chk
pkt2_len = 0x5B0
body = bytearray(pkt2_len)
body[:32] = P2_HDR
body[0x5AD] = 0xC8
body[0x5AE] = 0xAA
# verify chk as nibble sum over 0..0x5AC
chk = calc_crr_nibble_checksum(bytes(body[:0x5AD]))
print(f"\nNibble checksum bytes[0:0x5AD] -> {chk:02X} (expect C8)")

# maybe checksum only from 0x1A or after labview header
for start in [0, 0x16, 0x1A, 0x20]:
    chk = calc_crr_nibble_checksum(bytes(body[start:0x5AD]))
    print(f"  checksum [{start:04X}:0x5AD) -> {chk:02X}")

# CRR frame at end: FF FF FF FF FF FF + len(2) + cmd + chk + AA
# Try last 10 bytes as chk+AA only
frame_tail = bytes([0x00, 0xC8, 0xAA])  # or with preamble
for plen in range(3, 15):
    trial = bytes([0xFF] * 6 + [0x00, plen] + [0x95, 0x05] + [0] * (plen - 3))
    if len(trial) >= 2:
        block = trial[:-1]  # without AA
        # build proper
        pass

# Explicit small CRR packet hypothesis: 95 05 commit
content = [0x95, 0x05]
length = 2 + len(content) + 1
block = [(length >> 8) & 0xFF, length & 0xFF] + content
chk = calc_crr_nibble_checksum(block)
pkt = CRR_PREAMBLE + bytes(block) + bytes([chk, TERMINATOR])
print(f"\nHypothesis CRR cmd 95 05 framed: {pkt.hex(' ')}")
print(f"  length field = {length} (0x{length:04X})")

# try single byte cmd 0x10 for commit (p1 had 10 00)
for cmd in [0x10, 0x11, 0x95, 0x05, 0x01]:
    content = [cmd]
    length = 2 + 1 + 1
    block = [(length >> 8) & 0xFF, length & 0xFF, cmd]
    chk = calc_crr_nibble_checksum(block)
    pkt = CRR_PREAMBLE + bytes(block) + bytes([chk, TERMINATOR])
    print(f"  cmd 0x{cmd:02X}: {pkt.hex(' ')}")

print("\n=== RX response ===")
rx = bytes.fromhex("2049444e5f2031")
print("ASCII:", rx.decode("ascii", errors="replace"))

analyze_packet2_end()
