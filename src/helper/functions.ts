import { getTime } from "date-fns"
import { t } from "i18next"
import Swal from "sweetalert2"
import { ILC } from "./types"

/** Normalize project_id to string so DB queries and comparisons work for both number and string (existing + imported). */
export const normalizeProjectId = (id: string | number | undefined): string =>
  (id == null || id === '') ? '' : String(id)

/** Get natural width/height from a data URL (e.g. after camera/gallery). Caps at maxSize. */
export const getImageDimensions = (
  dataUrl: string,
  
  maxSize = 600
): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxSize || h > maxSize) {
        const r = Math.min(maxSize / w, maxSize / h);
        w = Math.round(w * r);
        h = Math.round(h * r);
      }
      resolve({ width: w, height: h });
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
};

interface getValidLcIdListType {
  isValid: boolean,
  startRange?: string,
  endRange?: string,
  ids: string[]
}
const getValidLcIdList = (unitList: string):getValidLcIdListType => {
  const ids = unitList.split(',').map((part) => part.trim()).filter(Boolean);
  const valid_ids: string[] = [];
  for (const id of ids) {
    if (id.includes('-')) {
      const range = id.split('-');
      const startRange = parseInt(range[0], 10);
      const endRange = parseInt(range[1], 10);

      if (startRange > endRange) {
        return { isValid: false, startRange: String(startRange), endRange: String(endRange), ids: [] };
      }
      for (let index = startRange; index <= endRange; index++) {
        valid_ids.push(index.toString());
      }
    } else {
      valid_ids.push(id);
    }
  }
  const sortedUnique = Array.from(new Set(valid_ids)).sort(
    (a, b) => parseInt(a, 10) - parseInt(b, 10),
  );
  return { isValid: true, ids: sortedUnique };
}
const getNewLCIds = (ids: string[], unitStr: string) => {
  const totalReg = /^[1-9,-]+$/
  const numberReg = /^[0-9]+$/
  const rangeReg = /^([0-9]+)-([0-9]+$)/

  console.log('data status: ', ids, unitStr, totalReg.test(unitStr))
  if (!totalReg.test(unitStr) && !numberReg.test(unitStr)) return false;

  let idList: number[] = [];

  const list = unitStr.split(',');

  list.forEach(item => {
    if (numberReg.test(item) && parseInt(item) > 0)
      idList.push(parseInt(item))
    else if (rangeReg.test(item)) {
      const start = parseInt(item.split('-')[0])
      const end = parseInt(item.split('-')[1])
      if (start < 1 || start >= end) return false
      for (let index = start; index <= end; index++) {
        idList.push(index)
      }
    } else
      return false
  })

  if (unitStr && unitStr.split(',').length > 0) {
    idList = idList.filter(item => !ids.includes(item.toString()))
  }

  return idList.map(item => item.toString())
}

const validateNumber = (value: string) => {
  return Number.isNaN(parseFloat(value))
}

function parseHeartRate(value: DataView): number {
  const flags = value.getUint8(0);
  const rate16Bits = flags & 0x1;
  let heartRate: number;
  if (rate16Bits > 0) {
    heartRate = value.getUint16(1, true);
  } else {
    heartRate = value.getUint8(1);
  }
  return heartRate;
}

function toHexString(byteArray: any): string {
  return Array.prototype.map.call(byteArray, function (byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
}

function hexToInt(hex: string) {
  if (hex.length % 2 != 0) {
    hex = "0" + hex;
  }
  let num = parseInt(hex, 16);
  const maxVal = Math.pow(2, hex.length / 2 * 8);
  if (num > maxVal / 2 - 1) {
    num = num - maxVal
  }
  return num;
}

const toByteArray = (hexString: any) => {
  console.log('===toByteArray===')
  const result = [];
  for (let i = 0; i < hexString.length; i += 2) {
    result.push(parseInt(hexString.substr(i, 2), 16));
  }
  return result;
}

const fire_error = (text: string) => {
  Swal.fire({
    icon: 'error',
    title: `<h2 class="text-danger">${t('Common.Error')}</h2>`,
    html: '<p>' + text + '</p>',
    heightAuto: false
  });
}

const fire_success = (text: string) => {
  Swal.fire({
    icon: 'success',
    title: `<h2 class="text-success">${t('Common.Confirmed')}</h2>`,
    html: '<p>' + text + '</p>',
    heightAuto: false
  });
}



const b64toBlob = (b64Data: any, contentType: any, sliceSize: any) => {
  console.log('===b64toBlob===')
  contentType = contentType || '';
  sliceSize = sliceSize || 512;
  const byteCharacters = atob(b64Data);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  const blob = new Blob(byteArrays, { type: contentType });
  return blob;
}
const are_equal = (argument: any) => {
  console.log('===are_equal===')
  const len = argument.length;
  for (let i = 1; i < len; i++) {
    if (argument[i] === null || argument[i] !== argument[i - 1])
      return false;
  }
  return true;
}

const convert_wind_speed = (speed: any, targetUnit: any) => {
  console.log('===convert_wind_speed===')
  // Conversion factors
  const conversionFactors: any = {
    'KMH': 3.6,          // 1 m/s = 3.6 km/h
    'MLH': 2.23694,      // 1 m/s = 2.23694 mph
    'FS': 3.28084,       // 1 m/s = 3.28084 ft/s
    'MS': 1              // 1 m/s = 1 m/s
  };

  // Check if the target unit is valid
  if (!(targetUnit in conversionFactors)) {
    console.error('Invalid target unit');
    return null;
  }

  // Perform the conversion
  const convertedSpeed = speed * conversionFactors[targetUnit];

  return convertedSpeed.toFixed(2);
}

const isNumber = (str: any) => {
  const num = parseFloat(str);
  return !isNaN(num);
}

const getLCsByGroup = (lcs: ILC[], group_id: string) => {
  const gid = String(group_id).trim()
  return lcs.filter((item) => {
    const parts = item.groups?.split(',').map((g) => String(g).trim()) ?? []
    return parts.includes(gid)
  })
}

const strToFloat = (str: any) => {
  const val = !str ? 0 : parseFloat(str)
  if (!Number.isFinite(val))
    return 0
  return val
}
const strToInt = (str: any) => {
  const val = !str ? 0 : parseInt(str)
  if (!Number.isFinite(val))
    return 0
  return val
}

export {
  getValidLcIdList,
  getNewLCIds,
  validateNumber,
  parseHeartRate,
  toHexString,
  hexToInt,
  toByteArray,
  fire_error,
  fire_success,
  b64toBlob,
  are_equal,
  convert_wind_speed,
  isNumber,
  getLCsByGroup,
  strToFloat,
  strToInt,
}