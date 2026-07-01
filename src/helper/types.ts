export type LoginDataType = {
  username: string;
  password: string;
}

export type ISelect = {
  value: string | number;
  title: string;
  short?: string;
}
export type ISelectOption = {
  value: string | number;
  label: string;
}

export type IProject = {
  id: string;
  title: string;
  units?: string;
  pre_overload?: string;
  total_overload?: string;
  reports?: string;
  cycle?: boolean;
  /** Empty string allowed while editing (web/native draft). */
  report_interval_seconds?: number | '';
  last_settings_change?: string;
  stage_x?: string;
  stage_y?: string;
  p_image?: string;
  show_graphs?: boolean;
  windmeter_units?: string;
  p_image_w?: number;
  p_image_h?: number;
  p_image_l?: number;
  p_image_t?: number;
  lc_display_mode?: 'home' | 'user';
}

export type IProjectDetail = {
  id?: string | number;
  project_id: string;
  logoheaderpdf?: string;
  /** PDF/CSV report header — artist name */
  report_artist?: string;
  /** PDF/CSV report header — city / venue */
  report_city?: string;
  /** PDF/CSV report header — operator / user name */
  report_user?: string;
  /** Website URL — printed in footer and encoded in QR when enabled */
  report_website_url?: string;
  /** When false, QR code is omitted even if website URL is set */
  report_show_qr?: boolean;
  certnumber?: string;
  certcompany?: string;
  certcompanyaddress?: string;
  companytel?: string;
  companycontact?: string;
  productdescription?: string;
  serialortag?: string;
  wll?: string;
  testmethod?: string;
  loadtestto?: string;
  notes?: string;
  machinecode?: string;
  productname?: string;
  modelname?: string;
  testlocation?: string;
}

export type ILC = {
  lc_id: string;
  id: string;
  project_id: string;
  title: string;
  psw?: string;
  underload?: string;
  overload?: string;
  total_sum?: boolean;
  groups?: string;
  /** CRR path: RF (wireless) or RS485 (wired). Defaults to RF when unset. */
  link_type?: 'rf' | 'rs485' | string;

  // for monitor list
  value?: string;
  realval?: string;
  battery?: string;
  max?: string;
  realTime?: string;
  weightnotare?:string

  unitList?: string;
  capacity: {
    mton: string | any,
    kg: string | any,
    lbs: string | any,
  } | any
  view_x?: string;
  view_y?: string;
  calibration_offset?: string;
  zero?: number;
  tare?: number;
  status_tare?:boolean;
  logoheaderpdf?: string;
  certnumber?: string;
  certcompany?: string;
  certcompanyaddress?: string;
  companytel?: string;
  companycontact?: string;
  productdescription?: string;
  serialortag?: string;
  wll?: string;
  testmethod?: string;
  loadtestto?: string;
  notes?: string;
  machinecode?: string;
  productname?: string;
  modelname?: string;
  testlocation?: string;
}

export type IGroup = {
  group_id?: string;
  id: string;
  project_id?: string;
  title: string;
  overload: string;
  tare?: string;
  sum?: string;
}

export type IProofTest = {
  id: string;
  group_id: string;
  lc_id: string;
  project_id: string;
  log_date: string;
  value?: string;
  overload?: string;
  underload?: string;
  unit?: string;
  realval?: string;
}

export type ILog = {
  id: string;
  lc_id: string;
  lc_title?: string;
  project_id: string;
  log_date: string;
  value?: number;
  overload?: number;
  underload?: number;
  unit?: string;
  realval?: string;
  battery?: string;
  log_type?: string;
}

export type ITotalizer = {
  id: string;
  group_id: string;
  project_id: string;
  sum: string;
  log_date: string;
}

export type ILCOverloadAlert = {
  id: string;
  last_alert: number;
  overload: number;
  value: number;
}
