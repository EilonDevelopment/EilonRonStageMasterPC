/** CRR USB protocol helpers (S2S LC list, identify, checksum). */

export const CRR_BROADCAST_PREAMBLE = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff] as const;
export const CRR_PACKET_TERMINATOR = 0xaa;
export const CRR_CMD_RETURN_CODE = 0x34;
export const CRR_CMD_SET_LC_LIST = 0x32;
export const CRR_IDENTITY_RESPONSE = ' IDN_ 4';
/** LabVIEW Save Parameters commit (packet 2) — CRR ack. */
export const CRR_IDENTITY_SAVE_RESPONSE = ' IDN_ 1';

export function formatCrrIdnScanLabel(asciiSlice: string): string {
  const trimmed = asciiSlice.trim();
  if (asciiSlice === CRR_IDENTITY_RESPONSE || trimmed === 'IDN_ 4') {
    return `identify OK ("${CRR_IDENTITY_RESPONSE.trim()}")`;
  }
  if (asciiSlice === CRR_IDENTITY_SAVE_RESPONSE || trimmed === 'IDN_ 1') {
    return `save parameters OK ("${CRR_IDENTITY_SAVE_RESPONSE.trim()}")`;
  }
  return `IDN_ fragment "${trimmed.slice(0, 16)}"`;
}

export type CrrS2sCell = {
  /** Hardware export socket on the CRR (0 = default RF path). */
  export: number;
  id: number;
};

export function calcCrrNibbleChecksum(bytes: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i] & 0xff;
    sum += (b >> 4) + (b & 0x0f);
  }
  return (0xff - (sum & 0xff)) & 0xff;
}

function buildCrrPacket(content: readonly number[]): Uint8Array {
  const length = 2 + content.length + 1;
  const block = [(length >> 8) & 0xff, length & 0xff, ...content];
  const checksum = calcCrrNibbleChecksum(block);
  return new Uint8Array([...CRR_BROADCAST_PREAMBLE, ...block, checksum, CRR_PACKET_TERMINATOR]);
}

/** CMD_ReturnCode — expect ASCII response ` IDN_ 4`. */
export function buildCrrReturnCodePacket(): Uint8Array {
  return buildCrrPacket([CRR_CMD_RETURN_CODE]);
}

function appendS2sCell(body: number[], cell: CrrS2sCell): void {
  const id = Math.max(0, Math.floor(cell.id)) & 0xffffff;
  body.push(cell.export & 0xff);
  body.push((id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff);
}

/** Build Set-LC-List (0x32): section 1 = all LCs (RF+RS485), section 2 = RS485 only (LabVIEW). */
export function buildCrrS2sPacket(allCells: CrrS2sCell[], wiredCells: CrrS2sCell[] = []): Uint8Array {
  const content: number[] = [CRR_CMD_SET_LC_LIST, allCells.length & 0xff];
  allCells.forEach((cell) => appendS2sCell(content, cell));
  content.push(CRR_CMD_SET_LC_LIST, wiredCells.length & 0xff);
  wiredCells.forEach((cell) => appendS2sCell(content, cell));
  return buildCrrPacket(content);
}

/** Human-readable summary for Serial Debug / logs. */
export function formatCrrS2sPacketSummary(allCells: CrrS2sCell[], wiredCells: CrrS2sCell[] = []): string {
  const fmtIds = (cells: CrrS2sCell[]) =>
    cells.length === 0
      ? '—'
      : cells
          .map((c) => (c.export ? `${c.id}(exp${c.export})` : String(c.id)))
          .join(', ');
  return `S2S 0x32 | ALL×${allCells.length}: ${fmtIds(allCells)} | RS485×${wiredCells.length}: ${fmtIds(wiredCells)}`;
}

export function bytesToAscii(data: Uint8Array): string {
  let text = '';
  for (let i = 0; i < data.length; i += 1) {
    const code = data[i];
    text += code >= 0x20 && code <= 0x7e ? String.fromCharCode(code) : '.';
  }
  return text;
}

export function bufferContainsCrrIdentity(data: Uint8Array): boolean {
  return bytesToAscii(data).includes(CRR_IDENTITY_RESPONSE);
}
