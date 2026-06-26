// db.ts
import Dexie, { Table } from 'dexie';

export class MySubClassedDexie extends Dexie {

  projects!: Table<any>;
  lcs!: Table<any>;
  groups!: Table<any>;
  logs!: Table<any>;
  daily_logs!: Table<any>;
  logs_archive!: Table<any>;
  logs_agg!: Table<any>;
  project_details!: Table<any>;
  logs_proofftest!: Table<any>;
  totalizer!: Table<any>;
  app_state!: Table<{ id: number; cur_project_id: string }>;
  crash_logs!: Table<any>;
  monitor_plans!: Table<any>;
  monitor_plan_lc_layouts!: Table<any>;
  monitor_plan_state!: Table<any>;

  constructor() {
    super('rsm');
    this.version(15).stores({
      projects: '++id, title, units, pre_overload, total_overload, reports, cycle, last_settings_change, stage_x, stage_y, p_image, show_graphs, windmeter_units',
      lcs: '++lc_id, id, project_id, title, psw, underload, overload, total_sum, groups, view_x, view_y, calibration_offset, zero, tare, logoheaderpdf, certnumber, certcompany, certcompanyaddress, companytel,companycontact, productdescription, serialortag, wll, testmethod, loadtestto, notes, machinecode, productname, modelname, testlocation',
      groups: '++group_id, id, project_id, title, overload, tare',
      logs: '++id, lc_id, project_id, log_date, value, overload, underload, unit, realval, battery, [log_date]',
      project_details: '++id, project_id, logoheaderpdf, certnumber, certcompany, certcompanyaddress, companytel, companycontact, productdescription, serialortag, wll, testmethod, loadtestto, notes, machinecode, productname, modelname, testlocation',
      logs_proofftest: '++id, group_id, lc_id, project_id, log_date, value, overload, underload, unit, realval',
      totalizer: '++id, group_id, project_id, sum, log_date',
      
    });
    this.version(16).stores({
      app_state: 'id, cur_project_id',
      crash_logs: '++id, timestamp' // <--- Nueva tabla
    });
    this.version(17).stores({
      projects: '++id, title, units, pre_overload, total_overload, reports, cycle, last_settings_change, stage_x, stage_y, p_image, show_graphs, windmeter_units',
      lcs: '++lc_id, id, project_id, title, psw, underload, overload, total_sum, groups, view_x, view_y, calibration_offset, zero, tare, logoheaderpdf, certnumber, certcompany, certcompanyaddress, companytel,companycontact, productdescription, serialortag, wll, testmethod, loadtestto, notes, machinecode, productname, modelname, testlocation',
      groups: '++group_id, id, project_id, title, overload, tare',
      logs: '++id, lc_id, project_id, log_date, value, overload, underload, unit, realval, battery, log_type, [project_id+log_date], [log_date]',
      logs_archive: '++id, lc_id, project_id, log_date, value, overload, underload, unit, realval, battery, log_type, [project_id+log_date], [log_date]',
      project_details: '++id, project_id, logoheaderpdf, certnumber, certcompany, certcompanyaddress, companytel, companycontact, productdescription, serialortag, wll, testmethod, loadtestto, notes, machinecode, productname, modelname, testlocation',
      logs_proofftest: '++id, group_id, lc_id, project_id, log_date, value, overload, underload, unit, realval',
      totalizer: '++id, group_id, project_id, sum, log_date',
      app_state: 'id, cur_project_id',
      crash_logs: '++id, timestamp'
    });
    this.version(18).stores({
      projects: '++id, title, units, pre_overload, total_overload, reports, cycle, last_settings_change, stage_x, stage_y, p_image, show_graphs, windmeter_units',
      lcs: '++lc_id, id, project_id, title, psw, underload, overload, total_sum, groups, view_x, view_y, calibration_offset, zero, tare, logoheaderpdf, certnumber, certcompany, certcompanyaddress, companytel,companycontact, productdescription, serialortag, wll, testmethod, loadtestto, notes, machinecode, productname, modelname, testlocation',
      groups: '++group_id, id, project_id, title, overload, tare',
      logs: '++id, lc_id, project_id, log_date, value, overload, underload, unit, realval, battery, log_type, [project_id+log_date], [log_date]',
      logs_archive: '++id, lc_id, project_id, log_date, value, overload, underload, unit, realval, battery, log_type, [project_id+log_date], [log_date]',
      // Aggregated time series: one row per (project, lc_id, bucket)
      logs_agg: '[project_id+lc_id+bucket], project_id, lc_id, bucket, [project_id+bucket], [bucket]',
      project_details: '++id, project_id, logoheaderpdf, certnumber, certcompany, certcompanyaddress, companytel, companycontact, productdescription, serialortag, wll, testmethod, loadtestto, notes, machinecode, productname, modelname, testlocation',
      logs_proofftest: '++id, group_id, lc_id, project_id, log_date, value, overload, underload, unit, realval',
      totalizer: '++id, group_id, project_id, sum, log_date',
      app_state: 'id, cur_project_id',
      crash_logs: '++id, timestamp'
    });

    // IMPORTANT: v16 previously declared only app_state/crash_logs. On some installs that can result in
    // missing tables like `logs`, causing report logging to silently fail. v19 enforces a complete schema.
    this.version(19).stores({
      projects: '++id, title, units, pre_overload, total_overload, reports, cycle, last_settings_change, stage_x, stage_y, p_image, show_graphs, windmeter_units',
      lcs: '++lc_id, id, project_id, title, psw, underload, overload, total_sum, groups, view_x, view_y, calibration_offset, zero, tare, logoheaderpdf, certnumber, certcompany, certcompanyaddress, companytel,companycontact, productdescription, serialortag, wll, testmethod, loadtestto, notes, machinecode, productname, modelname, testlocation',
      groups: '++group_id, id, project_id, title, overload, tare',
      logs: '++id, lc_id, project_id, log_date, value, overload, underload, unit, realval, battery, log_type, [project_id+log_date], [log_date]',
      logs_archive: '++id, lc_id, project_id, log_date, value, overload, underload, unit, realval, battery, log_type, [project_id+log_date], [log_date]',
      logs_agg: '[project_id+lc_id+bucket], project_id, lc_id, bucket, [project_id+bucket], [bucket]',
      project_details: '++id, project_id, logoheaderpdf, certnumber, certcompany, certcompanyaddress, companytel, companycontact, productdescription, serialortag, wll, testmethod, loadtestto, notes, machinecode, productname, modelname, testlocation',
      logs_proofftest: '++id, group_id, lc_id, project_id, log_date, value, overload, underload, unit, realval',
      totalizer: '++id, group_id, project_id, sum, log_date',
      app_state: 'id, cur_project_id',
      crash_logs: '++id, timestamp'
    });
    this.version(20).stores({
      projects: '++id, title, units, pre_overload, total_overload, reports, cycle, last_settings_change, stage_x, stage_y, p_image, show_graphs, windmeter_units',
      lcs: '++lc_id, id, project_id, title, psw, underload, overload, total_sum, groups, view_x, view_y, calibration_offset, zero, tare, logoheaderpdf, certnumber, certcompany, certcompanyaddress, companytel,companycontact, productdescription, serialortag, wll, testmethod, loadtestto, notes, machinecode, productname, modelname, testlocation',
      groups: '++group_id, id, project_id, title, overload, tare',
      // New raw-only daily store for reports
      daily_logs: '++id, project_id, day_key, log_date, lc_id, log_type, status_code, [project_id+day_key], [project_id+day_key+log_date], [day_key+log_date], [log_date]',
      // Legacy stores kept in schema for compatibility, but no longer used by reports pipeline
      logs: '++id, lc_id, project_id, log_date, value, overload, underload, unit, realval, battery, log_type, [project_id+log_date], [log_date]',
      logs_archive: '++id, lc_id, project_id, log_date, value, overload, underload, unit, realval, battery, log_type, [project_id+log_date], [log_date]',
      logs_agg: '[project_id+lc_id+bucket], project_id, lc_id, bucket, [project_id+bucket], [bucket]',
      project_details: '++id, project_id, logoheaderpdf, certnumber, certcompany, certcompanyaddress, companytel, companycontact, productdescription, serialortag, wll, testmethod, loadtestto, notes, machinecode, productname, modelname, testlocation',
      logs_proofftest: '++id, group_id, lc_id, project_id, log_date, value, overload, underload, unit, realval',
      totalizer: '++id, group_id, project_id, sum, log_date',
      app_state: 'id, cur_project_id',
      crash_logs: '++id, timestamp'
    }).upgrade(async () => {
      // Preserve legacy report history; Reports layer now reads both daily_logs and legacy stores.
    });
    this.version(21).stores({
      projects: '++id, title, units, pre_overload, total_overload, reports, cycle, last_settings_change, stage_x, stage_y, p_image, show_graphs, windmeter_units',
      lcs: '++lc_id, id, project_id, title, psw, underload, overload, total_sum, groups, view_x, view_y, calibration_offset, zero, tare, logoheaderpdf, certnumber, certcompany, certcompanyaddress, companytel,companycontact, productdescription, serialortag, wll, testmethod, loadtestto, notes, machinecode, productname, modelname, testlocation',
      groups: '++group_id, id, project_id, title, overload, tare',
      daily_logs: '++id, project_id, day_key, log_date, lc_id, log_type, status_code, [project_id+day_key], [project_id+day_key+log_date], [project_id+day_key+status_code+log_date], [day_key+log_date], [log_date]',
      logs: '++id, lc_id, project_id, log_date, value, overload, underload, unit, realval, battery, log_type, [project_id+log_date], [log_date]',
      logs_archive: '++id, lc_id, project_id, log_date, value, overload, underload, unit, realval, battery, log_type, [project_id+log_date], [log_date]',
      logs_agg: '[project_id+lc_id+bucket], project_id, lc_id, bucket, [project_id+bucket], [bucket]',
      project_details: '++id, project_id, logoheaderpdf, certnumber, certcompany, certcompanyaddress, companytel, companycontact, productdescription, serialortag, wll, testmethod, loadtestto, notes, machinecode, productname, modelname, testlocation',
      logs_proofftest: '++id, group_id, lc_id, project_id, log_date, value, overload, underload, unit, realval',
      totalizer: '++id, group_id, project_id, sum, log_date',
      app_state: 'id, cur_project_id',
      crash_logs: '++id, timestamp'
    });
    this.version(22).stores({
      projects: '++id, title, units, pre_overload, total_overload, reports, cycle, last_settings_change, stage_x, stage_y, p_image, show_graphs, windmeter_units',
      lcs: '++lc_id, id, project_id, title, psw, underload, overload, total_sum, groups, view_x, view_y, calibration_offset, zero, tare, logoheaderpdf, certnumber, certcompany, certcompanyaddress, companytel,companycontact, productdescription, serialortag, wll, testmethod, loadtestto, notes, machinecode, productname, modelname, testlocation',
      groups: '++group_id, id, project_id, title, overload, tare',
      daily_logs: '++id, project_id, day_key, hour_key, log_date, lc_id, log_type, status_code, [project_id+day_key], [project_id+day_key+log_date], [project_id+day_key+hour_key], [project_id+day_key+hour_key+log_date], [project_id+day_key+hour_key+status_code+log_date], [project_id+day_key+status_code+log_date], [day_key+log_date], [log_date]',
      logs: '++id, lc_id, project_id, log_date, value, overload, underload, unit, realval, battery, log_type, [project_id+log_date], [log_date]',
      logs_archive: '++id, lc_id, project_id, log_date, value, overload, underload, unit, realval, battery, log_type, [project_id+log_date], [log_date]',
      logs_agg: '[project_id+lc_id+bucket], project_id, lc_id, bucket, [project_id+bucket], [bucket]',
      project_details: '++id, project_id, logoheaderpdf, certnumber, certcompany, certcompanyaddress, companytel, companycontact, productdescription, serialortag, wll, testmethod, loadtestto, notes, machinecode, productname, modelname, testlocation',
      logs_proofftest: '++id, group_id, lc_id, project_id, log_date, value, overload, underload, unit, realval',
      totalizer: '++id, group_id, project_id, sum, log_date',
      app_state: 'id, cur_project_id',
      crash_logs: '++id, timestamp'
    });
    this.version(23).stores({
      projects: '++id, title, units, pre_overload, total_overload, reports, cycle, last_settings_change, stage_x, stage_y, p_image, show_graphs, windmeter_units',
      lcs: '++lc_id, id, project_id, title, psw, underload, overload, total_sum, groups, view_x, view_y, calibration_offset, zero, tare, logoheaderpdf, certnumber, certcompany, certcompanyaddress, companytel,companycontact, productdescription, serialortag, wll, testmethod, loadtestto, notes, machinecode, productname, modelname, testlocation',
      groups: '++group_id, id, project_id, title, overload, tare',
      // Ensure legacy-compatible index exists for menu/hour rebuilds
      daily_logs: '++id, project_id, day_key, hour_key, log_date, lc_id, log_type, status_code, [project_id+day_key], [project_id+day_key+log_date], [project_id+day_key+hour_key], [project_id+day_key+hour_key+log_date], [project_id+day_key+hour_key+status_code+log_date], [project_id+day_key+status_code+log_date], [day_key+log_date], [log_date]',
      logs: '++id, lc_id, project_id, log_date, value, overload, underload, unit, realval, battery, log_type, [project_id+log_date], [log_date]',
      logs_archive: '++id, lc_id, project_id, log_date, value, overload, underload, unit, realval, battery, log_type, [project_id+log_date], [log_date]',
      logs_agg: '[project_id+lc_id+bucket], project_id, lc_id, bucket, [project_id+bucket], [bucket]',
      project_details: '++id, project_id, logoheaderpdf, certnumber, certcompany, certcompanyaddress, companytel, companycontact, productdescription, serialortag, wll, testmethod, loadtestto, notes, machinecode, productname, modelname, testlocation',
      logs_proofftest: '++id, group_id, lc_id, project_id, log_date, value, overload, underload, unit, realval',
      totalizer: '++id, group_id, project_id, sum, log_date',
      app_state: 'id, cur_project_id',
      crash_logs: '++id, timestamp'
    });
    this.version(24).stores({
      projects: '++id, title, units, pre_overload, total_overload, reports, cycle, last_settings_change, stage_x, stage_y, p_image, show_graphs, windmeter_units',
      lcs: '++lc_id, id, project_id, title, psw, underload, overload, total_sum, groups, view_x, view_y, calibration_offset, zero, tare, logoheaderpdf, certnumber, certcompany, certcompanyaddress, companytel,companycontact, productdescription, serialortag, wll, testmethod, loadtestto, notes, machinecode, productname, modelname, testlocation',
      groups: '++group_id, id, project_id, title, overload, tare',
      daily_logs: '++id, project_id, day_key, hour_key, log_date, lc_id, log_type, status_code, [project_id+day_key], [project_id+day_key+log_date], [project_id+day_key+hour_key], [project_id+day_key+hour_key+log_date], [project_id+day_key+hour_key+status_code+log_date], [project_id+day_key+status_code+log_date], [day_key+log_date], [log_date]',
      logs: '++id, lc_id, project_id, log_date, value, overload, underload, unit, realval, battery, log_type, [project_id+log_date], [log_date]',
      logs_archive: '++id, lc_id, project_id, log_date, value, overload, underload, unit, realval, battery, log_type, [project_id+log_date], [log_date]',
      logs_agg: '[project_id+lc_id+bucket], project_id, lc_id, bucket, [project_id+bucket], [bucket]',
      project_details: '++id, project_id, logoheaderpdf, certnumber, certcompany, certcompanyaddress, companytel, companycontact, productdescription, serialortag, wll, testmethod, loadtestto, notes, machinecode, productname, modelname, testlocation',
      logs_proofftest: '++id, group_id, lc_id, project_id, log_date, value, overload, underload, unit, realval',
      totalizer: '++id, group_id, project_id, sum, log_date',
      app_state: 'id, cur_project_id',
      crash_logs: '++id, timestamp',
      monitor_plans: '++id, project_id, name, is_default, created_at, updated_at, [project_id+name], [project_id+updated_at]',
      monitor_plan_lc_layouts: '++id, project_id, plan_id, lc_id, view_x, view_y, updated_at, [project_id+plan_id], [project_id+plan_id+lc_id]',
      monitor_plan_state: 'project_id, selected_plan_id, updated_at'
    });
  }
}

export const db = new MySubClassedDexie();

/** Await before any Dexie read/write (avoids race on cold start). */
export const dbReady = db.open().catch((error) => {
  console.error('Dexie open failed:', error);
  throw error;
});