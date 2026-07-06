/**
 * CRR Settings — protocol per PROTOCOLO CONFIG CRR FROM PC (Example + Example explained).
 * Logical save blob: 5525 B = header 17 + 15×367 slots + checksum + 0xAA×2.
 * Wire: P1 = bytes [0..4095], P2 = bytes [4096..5524].
 */
import {
  CRR_CC24_BAUD_KEYS,
  CRR_CC24_TEMPLATES_BY_BAUD,
  CRR_CONFIG_HEADER_SIZE,
  CRR_SI900_TEMPLATES_BY_BAUD,
  CRR_SLOT_CONFIG_SIZE,
  CRR_SLOT_SIZE,
  type CrrCc24BaudKey,
} from './crrRfTemplates';
import {
  LABVIEW_SAVE_P1_WIRE_SIZE,
  LABVIEW_SAVE_P2_WIRE_SIZE,
} from './crrSaveParameters';

/** Dropdown index written as the first byte of each Addr slot (Example explained). */
export const CRR_MODULE_TYPE_INDEX = {
  OFF: 0x00,
  RS485: 0x01,
  CC24: 0x03,
  SLAVE_CC24: 0x06,
  SI900: 0x08,
  SLAVE_SI900: 0x09,
  BLE121LR: 0x0b,
  SP_CC24: 0x0d,
  SP_SI900: 0x0e,
  SP_RS485: 0x0f,
} as const;

export type CrrModuleType =
  | 'OFF'
  | 'RS485'
  | 'CC24'
  | 'SLAVE_CC24'
  | 'SI900'
  | 'SLAVE_SI900'
  | 'BLE121LR'
  | 'SP_CC24'
  | 'SP_SI900'
  | 'SP_RS485';

export type CrrBaudRate = CrrCc24BaudKey;

export type RfSlotConfig = {
  moduleType: CrrModuleType;
  channel: number;
  /** RF baud dropdown (10 … 500). */
  baudRate: CrrBaudRate;
  /** CC1101 registers 0–46 + Patable — used for register table UI on 2.4 paths. */
  registers: number[];
};

export type CrrOptionsConfig = {
  setPoint: boolean;
  singleCable: boolean;
  slave: boolean;
  master: boolean;
  internet: boolean;
  ethernet: boolean;
  sdCard: boolean;
  slaveOneByOne: boolean;
};

export type CrrSettingsConfig = {
  /** CRR electronic serial (4 bytes, e.g. 0x0008A534). */
  crrSerial: number;
  slots: RfSlotConfig[];
  options: CrrOptionsConfig;
};

export const CRR_RF_SLOT_COUNT = 15;
export const CRR_REGISTER_COLUMN_COUNT = 5;
export const CC1101_REGISTER_COUNT = 47;
export const CRR_CONFIG_LOGICAL_SIZE =
  CRR_CONFIG_HEADER_SIZE + CRR_RF_SLOT_COUNT * CRR_SLOT_SIZE + 3;

export const CRR_DEFAULT_SERIAL = 0x0008a534;

export const RF_MODULE_TYPE_OPTIONS: { value: CrrModuleType; labelKey: string }[] = [
  { value: 'OFF', labelKey: 'ModuleOff' },
  { value: 'RS485', labelKey: 'ModuleRs485' },
  { value: 'CC24', labelKey: 'ModuleCc24' },
  { value: 'SLAVE_CC24', labelKey: 'ModuleSlaveCc24' },
  { value: 'SI900', labelKey: 'ModuleSi900' },
  { value: 'SLAVE_SI900', labelKey: 'ModuleSlaveSi900' },
  { value: 'BLE121LR', labelKey: 'ModuleBle' },
  { value: 'SP_CC24', labelKey: 'ModuleSpCc24' },
  { value: 'SP_SI900', labelKey: 'ModuleSpSi900' },
  { value: 'SP_RS485', labelKey: 'ModuleSpRs485' },
];

export const RF_BAUD_RATE_OPTIONS = CRR_CC24_BAUD_KEYS;

export const CC1101_REGISTER_NAMES: readonly string[] = [
  '0:IOCFG2', '1:IOCFG1', '2:IOCFG0', '3:FIFOTHR', '4:SYNC1', '5:SYNC0', '6:PKTLEN', '7:PKTCTRL1', '8:PKTCTRL0',
  '9:ADDR', '10:CHANNR', '11:FSCTRL1', '12:FSCTRL0', '13:FREQ2', '14:FREQ1', '15:FREQ0', '16:MDMCFG4',
  '17:MDMCFG3', '18:MDMCFG2', '19:MDMCFG1', '20:MDMCFG0', '21:DEVIATN', '22:MCSM2', '23:MCSM1', '24:MCSM0',
  '25:FOCCFG', '26:BSCFG', '27:AGCCTRL2', '28:AGCCTRL1', '29:AGCCTRL0', '30:WOREVT1', '31:WOREVT0', '32:WORCTRL',
  '33:FREND1', '34:FREND0', '35:FSCAL3', '36:FSCAL2', '37:FSCAL1', '38:FSCAL0', '39:RCCTRL1', '40:RCCTRL0',
  '41:FSTEST', '42:PTEST', '43:AGCTEST', '44:TEST2', '45:TEST1', '46:TEST0', 'Patable',
];

export const RF_COLUMN_LABELS = ['RF1', 'RF2 /485', 'RF3', 'RF4 / 485', 'RF5'] as const;

const STORAGE_KEY = 'crrSettings.v2';

const CC24_TYPES = new Set<CrrModuleType>(['CC24', 'SLAVE_CC24', 'SP_CC24']);
const SI900_TYPES = new Set<CrrModuleType>(['SI900', 'SLAVE_SI900', 'SP_SI900']);
const RS485_TYPES = new Set<CrrModuleType>(['RS485', 'BLE121LR', 'SP_RS485']);

function moduleTypeToIndex(type: CrrModuleType): number {
  return CRR_MODULE_TYPE_INDEX[type];
}

function isCc24Family(type: CrrModuleType): boolean {
  return CC24_TYPES.has(type);
}

function isSi900Family(type: CrrModuleType): boolean {
  return SI900_TYPES.has(type);
}

function isRs485Family(type: CrrModuleType): boolean {
  return RS485_TYPES.has(type);
}

function emptyRegisters(): number[] {
  return new Array(CC1101_REGISTER_COUNT).fill(0);
}

export function channelToFrequencyMhz(channel: number, moduleType: CrrModuleType): number {
  if (moduleType === 'SI900' || moduleType === 'SLAVE_SI900' || moduleType === 'SP_SI900') {
    return 902 + (channel & 0xff) * 0.25;
  }
  if (isCc24Family(moduleType)) {
    return 2400 + (channel & 0xff) * 0.1;
  }
  return 0;
}

export function encodeCrrOptionsByte(options: CrrOptionsConfig): number {
  let b = 0;
  if (options.setPoint) b |= 1 << 0;
  if (options.singleCable) b |= 1 << 1;
  if (options.slave) b |= 1 << 2;
  if (options.master) b |= 1 << 3;
  if (options.internet) b |= 1 << 4;
  if (options.ethernet) b |= 1 << 5;
  if (options.sdCard) b |= 1 << 6;
  if (options.slaveOneByOne) b |= 1 << 7;
  return b & 0xff;
}

function writeHeader(pkt: Uint8Array, config: CrrSettingsConfig): void {
  pkt[0] = 0x00;
  pkt.fill(0xff, 1, 7);
  pkt[7] = 0x15;
  pkt[8] = 0x8c;
  pkt[9] = 0x31;
  // Wire order matches Example.txt / LabVIEW: MSB first (e.g. 0x0008A534 → 00 08 A5 34).
  const serial = config.crrSerial >>> 0;
  pkt[10] = (serial >> 24) & 0xff;
  pkt[11] = (serial >> 16) & 0xff;
  pkt[12] = (serial >> 8) & 0xff;
  pkt[13] = serial & 0xff;
  pkt[14] = 0x03;
  pkt[15] = 0xfc;
  pkt[16] = encodeCrrOptionsByte(config.options);
}

function cc24ConfigBlock(slot: RfSlotConfig): Uint8Array {
  const block = new Uint8Array(CRR_SLOT_CONFIG_SIZE);
  const template = CRR_CC24_TEMPLATES_BY_BAUD[slot.baudRate] ?? CRR_CC24_TEMPLATES_BY_BAUD['10'];
  const regs = slot.registers.some((r) => (r & 0xff) !== 0) ? slot.registers : Array.from(template);
  const copyLen = Math.min(regs.length, CC1101_REGISTER_COUNT);
  for (let i = 0; i < copyLen; i += 1) {
    block[i] = regs[i] & 0xff;
  }
  if (copyLen < CC1101_REGISTER_COUNT) {
    block.set(template.subarray(copyLen), copyLen);
  }
  const ch = slot.channel & 0xff;
  block[10] = ch;
  block[47] = 0xff;
  return block;
}

/** UI baud "10" maps to the 9.6 kbaud SI-900 template (see Example Addr 3). */
function si900TemplateKey(baud: CrrBaudRate): keyof typeof CRR_SI900_TEMPLATES_BY_BAUD {
  if (baud === '10') return '9.6';
  return baud;
}

function si900ConfigBlock(slot: RfSlotConfig): Uint8Array {
  const block = new Uint8Array(CRR_SLOT_CONFIG_SIZE);
  const key = si900TemplateKey(slot.baudRate);
  const template =
    CRR_SI900_TEMPLATES_BY_BAUD[key] ?? CRR_SI900_TEMPLATES_BY_BAUD['100'];
  block.set(template.subarray(0, Math.min(template.length, CRR_SLOT_CONFIG_SIZE)));
  if (slot.moduleType === 'SP_SI900') {
    block[10] = slot.channel & 0xff;
  }
  return block;
}

function rs485ConfigBlock(slot: RfSlotConfig): Uint8Array {
  const block = new Uint8Array(CRR_SLOT_CONFIG_SIZE);
  block[10] = slot.channel & 0xff;
  return block;
}

function writeSlot(pkt: Uint8Array, slotIndex: number, slot: RfSlotConfig): void {
  const base = CRR_CONFIG_HEADER_SIZE + slotIndex * CRR_SLOT_SIZE;
  const out = pkt.subarray(base, base + CRR_SLOT_SIZE);
  out.fill(0);

  if (slot.moduleType === 'OFF') {
    return;
  }

  const typeIdx = moduleTypeToIndex(slot.moduleType);
  out[0] = typeIdx;

  let config: Uint8Array;
  if (isCc24Family(slot.moduleType)) {
    config = cc24ConfigBlock(slot);
  } else if (isSi900Family(slot.moduleType)) {
    config = si900ConfigBlock(slot);
  } else if (isRs485Family(slot.moduleType)) {
    config = rs485ConfigBlock(slot);
  } else {
    config = new Uint8Array(CRR_SLOT_CONFIG_SIZE);
  }

  out.set(config.subarray(0, CRR_SLOT_CONFIG_SIZE), 1);
  const ch = slot.channel & 0xff;
  out[CRR_SLOT_SIZE - 2] = ch;
  out[CRR_SLOT_SIZE - 1] = ch;
}

/** Sum bytes from 0x158C (index 7) through byte before checksum; matches Example (sum − 0x10). */
export function calcCrrConfigChecksum(pkt: Uint8Array): number {
  let sum = 0;
  const end = pkt.length - 3;
  for (let i = 7; i < end; i += 1) {
    sum += pkt[i] & 0xff;
  }
  return (sum - 0x10) & 0xff;
}

/** Build the full 5525-byte logical CRR config (P1 + P2 wire concatenated). */
export function buildCrrLogicalConfigPacket(config: CrrSettingsConfig): Uint8Array {
  const pkt = new Uint8Array(CRR_CONFIG_LOGICAL_SIZE);
  writeHeader(pkt, config);
  for (let i = 0; i < CRR_RF_SLOT_COUNT; i += 1) {
    writeSlot(pkt, i, config.slots[i]);
  }
  pkt[pkt.length - 3] = calcCrrConfigChecksum(pkt);
  pkt[pkt.length - 2] = 0xaa;
  pkt[pkt.length - 1] = 0xaa;
  return pkt;
}

export function splitCrrWireSavePackets(logical: Uint8Array): { p1: Uint8Array; p2: Uint8Array } {
  if (logical.length < LABVIEW_SAVE_P1_WIRE_SIZE + LABVIEW_SAVE_P2_WIRE_SIZE) {
    throw new Error(`CRR logical packet too short: ${logical.length}`);
  }
  return {
    p1: logical.slice(0, LABVIEW_SAVE_P1_WIRE_SIZE),
    p2: logical.slice(LABVIEW_SAVE_P1_WIRE_SIZE, LABVIEW_SAVE_P1_WIRE_SIZE + LABVIEW_SAVE_P2_WIRE_SIZE),
  };
}

/** Build wire P1/P2 from UI settings (replaces legacy encodeCrrSettingsToP1). */
export function buildCrrSettingsWirePackets(config: CrrSettingsConfig): { p1: Uint8Array; p2: Uint8Array } {
  return splitCrrWireSavePackets(buildCrrLogicalConfigPacket(config));
}

/** @deprecated Use {@link buildCrrSettingsWirePackets}. */
export function encodeCrrSettingsToP1(config: CrrSettingsConfig): Uint8Array {
  return buildCrrSettingsWirePackets(config).p1;
}

export function defaultSlotFromScreenshot(index: number): RfSlotConfig {
  const cc24Regs = Array.from(CRR_CC24_TEMPLATES_BY_BAUD['10']);
  const defaults: Partial<Record<number, RfSlotConfig>> = {
    0: { moduleType: 'CC24', channel: 0, baudRate: '10', registers: cc24Regs },
    1: { moduleType: 'CC24', channel: 205, baudRate: '100', registers: Array.from(CRR_CC24_TEMPLATES_BY_BAUD['100']) },
    2: { moduleType: 'SI900', channel: 235, baudRate: '10', registers: emptyRegisters() },
    3: { moduleType: 'SI900', channel: 205, baudRate: '250', registers: emptyRegisters() },
    4: { moduleType: 'RS485', channel: 203, baudRate: '10', registers: emptyRegisters() },
    5: { moduleType: 'SP_CC24', channel: 235, baudRate: '10', registers: Array.from(CRR_CC24_TEMPLATES_BY_BAUD['10']) },
    14: { moduleType: 'SP_SI900', channel: 205, baudRate: '100', registers: emptyRegisters() },
  };
  return {
    moduleType: 'OFF',
    channel: 0,
    baudRate: '10',
    registers: emptyRegisters(),
    ...defaults[index],
  };
}

export function createDefaultCrrSettings(): CrrSettingsConfig {
  const slots: RfSlotConfig[] = [];
  for (let i = 0; i < CRR_RF_SLOT_COUNT; i += 1) {
    slots.push(defaultSlotFromScreenshot(i));
  }
  return {
    crrSerial: CRR_DEFAULT_SERIAL,
    slots,
    options: {
      setPoint: false,
      singleCable: true,
      slave: true,
      slaveOneByOne: false,
      master: false,
      internet: false,
      ethernet: false,
      sdCard: false,
    },
  };
}

export function loadCrrSettingsFromStorage(): CrrSettingsConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacy = localStorage.getItem('crrSettings.v1');
      if (legacy) return migrateLegacySettings(JSON.parse(legacy));
      return createDefaultCrrSettings();
    }
    const parsed = JSON.parse(raw) as CrrSettingsConfig;
    if (!parsed?.slots || parsed.slots.length !== CRR_RF_SLOT_COUNT) {
      return createDefaultCrrSettings();
    }
    return parsed;
  } catch {
    return createDefaultCrrSettings();
  }
}

function migrateLegacySettings(legacy: { slots?: Array<Record<string, unknown>>; options?: CrrOptionsConfig }): CrrSettingsConfig {
  const base = createDefaultCrrSettings();
  if (legacy.options) base.options = { ...base.options, ...legacy.options };
  legacy.slots?.forEach((s, i) => {
    if (i >= CRR_RF_SLOT_COUNT) return;
    const mt = String(s.moduleType ?? 'OFF');
    const mapped = mt === 'CC24' ? 'CC24' : mt === 'RS485' ? 'RS485' : mt === 'BLE121LR' ? 'BLE121LR' : mt === 'OFF' ? 'OFF' : 'CC24';
    base.slots[i] = {
      moduleType: mapped as CrrModuleType,
      channel: Number(s.channel) || 0,
      baudRate: '10',
      registers: Array.isArray(s.registers) ? s.registers.map((n) => Number(n) & 0xff) : emptyRegisters(),
    };
  });
  return base;
}

export function saveCrrSettingsToStorage(config: CrrSettingsConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}

export function resetCrrSettingsToTemplate(): CrrSettingsConfig {
  const defaults = createDefaultCrrSettings();
  saveCrrSettingsToStorage(defaults);
  return defaults;
}
