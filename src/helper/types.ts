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
  report_interval_seconds?: number;
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
  id: string;
  project_id: string;
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
