import { ISelect } from "./types"

const ROUTES = {
  Login: '/login',
  Verify: '/verify',
  Monitor: '/monitor',
  Projects: '/projects',
  Settings: '/settings',
  Reports: '/reports',
  ConnectDevice: '/connect',
  ProofTest: '/proof',
  Totalizer: '/totalizer',
  Document: '/document',
  SerialDebug: '/serial-debug',
  // StressTest: '/stress-test',
};

const AUTH_ROUTE = [
  '/login', '/verify'
];

const MENUS = {
  Monitor: "Monitor",
  Projects: "Projects",
  Settings: "Settings",
  Reports: "Reports",
  ConnectDevice: "ConnectDevice",
  ProofTest: "ProofTest",
  Totalizer: "Totalizer",
  Document: "Document",
  SerialDebug: "SerialDebug",
}

const ModalMenus = [
  MENUS.Monitor,
  MENUS.Projects,
  MENUS.ProofTest,
  MENUS.ConnectDevice,
  MENUS.Totalizer,
  MENUS.Document,
  MENUS.Totalizer,
]

const ModalNames = {
  ProjectInformation: 'Project Information',
  NewProject: 'New Project',
  WarningList: 'Warning List',
}

const MonitorStatus: ('view' | 'list' | 'prog' | 'stop')[] = ['view', 'list', 'prog', 'stop'];

/* 1t = 2205lbs = 1000kg */
const Unit_List: ISelect[] = [
  { value: 'KG', title: 'KG' },
  { value: 'LBS', title: 'LBS' },
  { value: 'M.TON', title: 'M.TON' },
];

const Windmeter_Unit_List: ISelect[] = [
  { value: 'KMH', title: 'KM/H', short: 'KMH' },       // km per hour
  { value: 'MLH', title: 'Mile/H', short: 'MLH' },   // mile per hour
  { value: 'MS', title: 'Meter/S', short: 'MS' },  // meter per second
  { value: 'FS', title: 'Foot/S', short: 'FS' },    // foot per second
];

enum Colors {
  primary,
  secondary,
  success,
  warning,
  danger,
  light,
  medium,
  dark,
}

interface LC_SerialsRangeType {
  from: number,
  to: number,
}
interface LC_SerialsCapacityType {
  mton: number,
  kg: number,
  lbs: number,
}
interface LC_SerialsResolutionType {
  meter?: number,
  mile?: number,
  km?: number,
  meterpersecond?: number,
  footpersecond?: number,
  mton?: number,
  kg?: number,
  lbs?: number,
}
// export interface LC_SerialsType {
//   range: LC_SerialsRangeType[],
//   capacity: LC_SerialsCapacityType,
//   resolution: LC_SerialsResolutionType,
// }
export interface LC_SerialsType {
  range: any[],
  capacity: any,
  resolution: any,
}

const LC_Serials: LC_SerialsType[] = [
  {
    range: [{ from: 1, to: 10 }],
    capacity: { mton: 0.25, kg: 250, lbs: 551.25 },
    resolution: { meter: 1, mile: 0.000621371, km: 0.0001, meterpersecond: 0.277778, footpersecond: 0.911344 }
  },
  {
    range: [{ from: 250, to: 499 }],
    capacity: { mton: 0.25, kg: 250, lbs: 551.25 },
    resolution: { mton: 0.0005, kg: 0.5, lbs: 1 }
  }, {
    range: [{ from: 500, to: 999 }],
    capacity: { mton: 0.5, kg: 500, lbs: 1102.5 },
    resolution: { mton: 0.001, kg: 1, lbs: 2 }
  }, {
    range: [{ from: 1000, to: 1499 }, { from: 11000, to: 11899 }],
    capacity: { mton: 1, kg: 1000, lbs: 2205 },
    resolution: { mton: 0.001, kg: 1, lbs: 2 }
  }, {
    range: [{ from: 1500, to: 1999 }, { from: 11900, to: 12799 }],
    capacity: { mton: 1.5, kg: 1500, lbs: 3307.5 },
    resolution: { mton: 0.001, kg: 1, lbs: 2 }
  }, {
    range: [{ from: 2000, to: 2499 }, { from: 12800, to: 13699 }],
    capacity: { mton: 2, kg: 2000, lbs: 4410 },
    resolution: { mton: 0.002, kg: 2, lbs: 5 }
  }, {
    range: [{ from: 2500, to: 2999 }, { from: 13700, to: 14599 }],
    capacity: { mton: 2.5, kg: 2500, lbs: 5512.5 },
    resolution: { mton: 0.002, kg: 2, lbs: 5 }
  }, {
    range: [{ from: 3000, to: 3999 }, { from: 14600, to: 14999 }],
    capacity: { mton: 3, kg: 3000, lbs: 6615 },
    resolution: { mton: 0.002, kg: 2, lbs: 5 }
  }, {
    range: [{ from: 4000, to: 4999 }, { from: 15000, to: 15399 }],
    capacity: { mton: 4, kg: 4000, lbs: 8820 },
    resolution: { mton: 0.002, kg: 2, lbs: 5 }
  }, {
    range: [{ from: 5000, to: 5999 }, { from: 15400, to: 15799 }],
    capacity: { mton: 5, kg: 5000, lbs: 11025 },
    resolution: { mton: 0.005, kg: 5, lbs: 10 }
  }, {
    range: [{ from: 6000, to: 6999 }, { from: 15800, to: 16000 }],
    capacity: { mton: 6, kg: 6000, lbs: 13230 },
    resolution: { mton: 0.005, kg: 5, lbs: 10 }
  }, {
    range: [{ from: 7000, to: 7499 }],
    capacity: { mton: 8, kg: 8000, lbs: 17640 },
    resolution: { mton: 0.005, kg: 5, lbs: 10 }
  }, {
    range: [{ from: 7500, to: 7999 }],
    capacity: { mton: 10, kg: 10000, lbs: 22050 },
    resolution: { mton: 0.01, kg: 10, lbs: 20 }
  }, {
    range: [{ from: 8000, to: 8499 }],
    capacity: { mton: 12.5, kg: 12000, lbs: 27558 },
    resolution: { mton: 0.01, kg: 10, lbs: 20 }
  }, {
    range: [{ from: 8500, to: 8999 }],
    capacity: { mton: 15, kg: 15000, lbs: 33075 },
    resolution: { mton: 0.01, kg: 10, lbs: 20 }
  }, {
    range: [{ from: 9000, to: 9249 }],
    capacity: { mton: 20, kg: 20000, lbs: 44100 },
    resolution: { mton: 0.01, kg: 10, lbs: 20 }
  }, {
    range: [{ from: 9250, to: 9499 }],
    capacity: { mton: 25, kg: 25000, lbs: 55125 },
    resolution: { mton: 0.02, kg: 20, lbs: 50 }
  }, {
    range: [{ from: 9500, to: 9999 }],
    capacity: { mton: 30, kg: 30000, lbs: 66150 },
    resolution: { mton: 0.02, kg: 20, lbs: 50 }
  }, {
    range: [{ from: 10000, to: 10249 }],
    capacity: { mton: 40, kg: 40000, lbs: 88200 },
    resolution: { mton: 0.02, kg: 20, lbs: 50 }
  }, {
    range: [{ from: 10250, to: 10499 }],
    capacity: { mton: 50, kg: 50000, lbs: 110250 },
    resolution: { mton: 0.04, kg: 50, lbs: 100 }
  }, {
    range: [{ from: 10500, to: 10599 }],
    capacity: { mton: 80, kg: 80000, lbs: 176400 },
    resolution: { mton: 0.05, kg: 50, lbs: 100 }
  }, {
    range: [{ from: 10600, to: 10699 }],
    capacity: { mton: 125, kg: 125000, lbs: 275625 },
    resolution: { mton: 0.05, kg: 50, lbs: 100 }
  }, {
    range: [{ from: 10700, to: 10799 }],
    capacity: { mton: 200, kg: 200000, lbs: 441000 },
    resolution: { mton: 0.1, kg: 100, lbs: 200 }
  }, {
    range: [{ from: 10800, to: 10899 }],
    capacity: { mton: 250, kg: 250000, lbs: 551250 },
    resolution: { mton: 0.1, kg: 100, lbs: 200 }
  }, {
    range: [{ from: 10900, to: 10999 }],
    capacity: { mton: 300, kg: 300000, lbs: 661500 },
    resolution: { mton: 0.1, kg: 100, lbs: 200 }
  }
]

export {
  ROUTES,
  AUTH_ROUTE,
  MENUS,
  ModalMenus,
  ModalNames,
  MonitorStatus,
  Unit_List,
  Windmeter_Unit_List,
  Colors,
  LC_Serials,
}
