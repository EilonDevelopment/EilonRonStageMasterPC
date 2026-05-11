import React, { ChangeEvent, FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CommonLayout from '../../Layout/CommonLayout';
import { IGroup, ILC, IProject } from '../../helper/types';
import Button from '../../components/Buttons/Button';
import CustomDataGrid from '../../components/CustomDataGrid';
import { addOutline, createOutline, removeOutline } from 'ionicons/icons';
import useAppData from '../../hooks/useAppData';
import NewLCModal from '../../components/Modals/NewLCModal';
import { getNewLCIds, getValidLcIdList, normalizeProjectId } from '../../helper/functions';
import { Unit_List, Windmeter_Unit_List } from '../../helper/constants';
import DeleteConfirmModal from '../../components/Modals/DeleteConfirmModal';
import SuccessModal from '../../components/Modals/SuccessModal';
import LoadingModal from '../../components/Modals/LoadingModal';
import Text from '../../components/Text';
import GroupModal from '../../components/Modals/GroupModal';
import CalibrationModal from '../../components/Modals/CalibrationModal';
import BulkEditLCModal, { BulkEditLcPayload } from '../../components/Modals/BulkEditLCModal';
import { db } from '../../db'
import useFunctions from '../../hooks/useFunctions';
import './index.css';
import { logEvent } from '../../services/LogService';
import { withStableRowIndex } from '../../helper/lcStableRowIndex';
import type { GridColDef, GridValueGetterParams } from '@mui/x-data-grid';
import { gridNumberComparator } from '@mui/x-data-grid';
import { formatWeightByLcResolution } from '../../helper/weightResolution';

type SettingsLcGridRow = ILC & { __stableIndex: number };

function settingsProjectUnitKey(units: string | undefined): string {
  const u = String(units ?? 'kg').replace(/\./g, '').toLowerCase().trim();
  return u || 'kg';
}

/** Missing / invalid numerics sort last in ascending order. */
function finiteOrInfinity(n: number): number {
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

function sortLcIdNumeric(row: ILC): number {
  return finiteOrInfinity(Number(String(row.id ?? '').trim()));
}

function sortCapacityNumeric(row: ILC, projectUnits: string | undefined): number {
  const key = settingsProjectUnitKey(projectUnits) as keyof NonNullable<ILC['capacity']>;
  const cap = row.capacity?.[key];
  const n = parseFloat(String(cap ?? ''));
  return finiteOrInfinity(n);
}

function sortNumericStringField(raw: string | undefined): number {
  return finiteOrInfinity(parseFloat(String(raw ?? '').trim()));
}

function compareGroupsByRow(a: ILC, b: ILC): number {
  const pa = String(a.groups || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const pb = String(b.groups || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const na = pa.map((x) => Number(x)).filter((x) => Number.isFinite(x));
  const nb = pb.map((x) => Number(x)).filter((x) => Number.isFinite(x));
  const minA = na.length ? Math.min(...na) : Number.POSITIVE_INFINITY;
  const minB = nb.length ? Math.min(...nb) : Number.POSITIVE_INFINITY;
  if (minA !== minB) return minA - minB;
  if (pa.length !== pb.length) return pa.length - pb.length;
  const sa = [...pa].sort((x, y) => x.localeCompare(y, undefined, { numeric: true })).join(',');
  const sb = [...pb].sort((x, y) => x.localeCompare(y, undefined, { numeric: true })).join(',');
  return sa.localeCompare(sb, undefined, { numeric: true });
}

enum CalibrationModalMode {
  'None' = 0,
  'Calibrate',
  'Confirm',
}

const Settings: FC = () => {
  const { t } = useTranslation();
  const { curProject, lcs, groups, activeToastCount, updateErrStr, updateLCs, updateGroups, updateCreatingLCs } = useAppData();
  const { f_edit_lc, f_verify_lc_id, f_check_lc_in_project, f_insert_lcs_bulk, f_save_group, f_project_groups, f_delete_lc, f_reset_empty_groups_after_delete } = useFunctions()

  const [dbHanlder, setDBHandler] = useState(null)

  const [loading, setLoading] = useState<boolean>(false);
  const [visibleAddModal, setVisibleAddModal] = useState<boolean>(false);
  const [visibleBulkEditModal, setVisibleBulkEditModal] = useState<boolean>(false);
  const [calibrationModalMode, setVisibleCalibrationModal] = useState<CalibrationModalMode>(CalibrationModalMode.None);
  const [selectedProject, setSelectedProject] = useState<IProject>({} as IProject);
  const [LCList, setLCList] = useState<ILC[]>([])
  const [LCItem, setLCItem] = useState<ILC>({} as ILC)

  const [visibleDeleteModal, setVisibleDeleteModal] = useState<boolean>(false);
  const [visibleSuccessModal, setVisibleSuccessModal] = useState<boolean>(false);
  const [isCreatingLCs, setIsCreatingLCs] = useState<boolean>(false);
  const [deleteList, setDeleteList] = useState<string[]>([])
  const [selectAll, setSelectAll] = useState<boolean>(false);

  const [groupList, setGroupList] = useState<IGroup[]>([])
  const [selectedGroup, setSelectedGroup] = useState<IGroup | null>(null)
  const [errMsg, setErrMsg] = useState<string>('')
  const fxRef = useRef((curProject && curProject.units ? curProject.units.replace('.', '').toLowerCase() : 'kg') === 'mton' ? 3 : 0)

  useEffect(() => {
    fxRef.current = ((curProject && curProject.units ? curProject.units.replace('.', '').toLowerCase() : 'kg') === 'mton' ? 3 : 0)
  }, [curProject.units])

  useEffect(() => {
    void logEvent("INFO", "Entered Settings page", {}, "NAVIGATION");
  }, []);


  useEffect(() => {
    if (!curProject?.id) {
      setLCList([]);
      return;
    }
    if (lcs.length > 0) {
      setLCList(lcs.filter(item => normalizeProjectId(item.project_id) === normalizeProjectId(curProject.id)));
    } else {
      setLCList([]);
    }
  }, [lcs, curProject?.id])

  const LCListForGrid = useMemo(() => withStableRowIndex(LCList), [LCList]);

  // useEffect(() => {
  //   // console.log('groups change: ', groups)
  //   setGroupList(groups)
  // }, [groups])

  const handleDeleteList = (id: string) => {
    setDeleteList((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      return [...prev, id];
    });
  }
  const handleSelectAll = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = e.target.checked;
    setSelectAll(isChecked);

    if (isChecked) {
      const allIds = LCList.map(row => row.id);
      setDeleteList(allIds);
    } else {
      setDeleteList([]);
    }
  }, [LCList]);

  const handleDeleteCheck = useCallback((_e: any, id: string) => {
    handleDeleteList(id)
  }, [])

  const handleEditLC = useCallback((lc: ILC) => {
    setLCItem(lc)
    setVisibleAddModal(true)
  }, [])

  const columns = useMemo<GridColDef<SettingsLcGridRow>[]>(() => [
    {
      field: '__stableIndex',
      headerName: '#',
      flex: 0.055,
      minWidth: 44,
      type: 'number',
      sortable: true,
      filterable: false,
      disableReorder: true,
      valueGetter: (params: GridValueGetterParams<SettingsLcGridRow>) => params.row.__stableIndex,
      sortComparator: gridNumberComparator,
      renderCell: ({ row }) => (
        <span className="text-dark dark:text-light col-item text-center tabular-nums block w-full">{row.__stableIndex}</span>
      ),
    },
    {
      flex: 0.079,
      minWidth: 60,
      field: 'id',
      headerName: t('Setting.Id'),
      type: 'number',
      valueGetter: (params: GridValueGetterParams<SettingsLcGridRow>) => sortLcIdNumeric(params.row),
      sortComparator: gridNumberComparator,
      renderCell: ({ row }) => (
        <span className="text-dark dark:text-light col-item" onClick={() => handleEditLC(row)}>{row.id}</span>
      ),
    },
    {
      flex: 0.118,
      minWidth: 90,
      field: 'title',
      headerName: t('Setting.Name'),
      valueGetter: (params: GridValueGetterParams<SettingsLcGridRow>) =>
        String(params.row.title ?? '').trim().toLowerCase(),
      renderCell: ({ row }) => (
        <span className="text-dark dark:text-light col-item" onClick={() => handleEditLC(row)}>{row.title}</span>
      ),
    },
    {
      flex: 0.118,
      minWidth: 90,
      field: 'capacity',
      headerName: t('Setting.Capacity'),
      type: 'number',
      valueGetter: (params: GridValueGetterParams<SettingsLcGridRow>) =>
        sortCapacityNumeric(params.row, curProject?.units),
      sortComparator: gridNumberComparator,
      renderCell: ({ row }) => (
        <span className="text-dark dark:text-light col-item" onClick={() => handleEditLC(row)}>
          {row.capacity
            ? parseFloat(
                String(row.capacity[settingsProjectUnitKey(curProject?.units)] ?? '')
              ).toFixed(fxRef.current)
            : 'N/A'}{' '}
          {Number(row.id) >= 10 ? curProject.units : curProject.windmeter_units}
        </span>
      ),
    },
    {
      flex: 0.118,
      minWidth: 90,
      field: 'underload',
      headerName: t('Setting.Underload'),
      type: 'number',
      valueGetter: (params: GridValueGetterParams<SettingsLcGridRow>) =>
        sortNumericStringField(params.row.underload),
      sortComparator: gridNumberComparator,
      renderCell: ({ row }) => {
        const n = parseFloat(String(row.underload ?? ''));
        const disp =
          Number.isFinite(n) && Number.isFinite(Number(row.id))
            ? formatWeightByLcResolution(n, Number(row.id), curProject?.units, fxRef.current)
            : '';
        return (
          <span className="text-dark dark:text-light col-item" onClick={() => handleEditLC(row)}>
            {disp}
          </span>
        );
      },
    },
    {
      flex: 0.118,
      minWidth: 90,
      field: 'overload',
      headerName: t('Setting.Overload'),
      type: 'number',
      valueGetter: (params: GridValueGetterParams<SettingsLcGridRow>) =>
        sortNumericStringField(params.row.overload),
      sortComparator: gridNumberComparator,
      renderCell: ({ row }) => {
        const n = parseFloat(String(row.overload ?? ''));
        const disp =
          Number.isFinite(n) && Number.isFinite(Number(row.id))
            ? formatWeightByLcResolution(n, Number(row.id), curProject?.units, fxRef.current)
            : '';
        return (
          <span className="text-dark dark:text-light col-item" onClick={() => handleEditLC(row)}>
            {disp}
          </span>
        );
      },
    },
    {
      flex: 0.105,
      minWidth: 80,
      field: 'psw',
      headerName: t('Setting.PSW'),
      type: 'number',
      valueGetter: (params: GridValueGetterParams<SettingsLcGridRow>) =>
        sortNumericStringField(params.row.psw),
      sortComparator: gridNumberComparator,
      renderCell: ({ row }) => {
        const raw = row.psw ?? '0';
        const n = parseFloat(String(raw));
        const disp =
          Number.isFinite(n) && Number.isFinite(Number(row.id))
            ? formatWeightByLcResolution(n, Number(row.id), curProject?.units, fxRef.current)
            : String(raw || '');
        return (
          <span className="text-dark dark:text-light col-item" onClick={() => handleEditLC(row)}>
            {disp}
          </span>
        );
      },
    },
    {
      flex: 0.118,
      minWidth: 90,
      field: 'total_sum',
      headerName: t('Setting.Total'),
      type: 'number',
      valueGetter: (params: GridValueGetterParams<SettingsLcGridRow>) => (params.row.total_sum ? 1 : 0),
      sortComparator: gridNumberComparator,
      renderCell: ({ row }) => (
        <span className="text-dark dark:text-light col-item" onClick={() => handleEditLC(row)}>
          {row.total_sum ? 'Yes ' : 'No'}
        </span>
      ),
    },
    {
      flex: 0.118,
      minWidth: 90,
      field: 'groups',
      headerName: t('Setting.Groups'),
      valueGetter: (params: GridValueGetterParams<SettingsLcGridRow>) => String(params.row.groups ?? ''),
      sortComparator: (_v1, _v2, ap, bp) => {
        const ra = ap.api.getRow(ap.id) as SettingsLcGridRow | null;
        const rb = bp.api.getRow(bp.id) as SettingsLcGridRow | null;
        if (!ra || !rb) return 0;
        return compareGroupsByRow(ra, rb);
      },
      renderCell: ({ row }) => (
        <span className="text-dark dark:text-light col-item" onClick={() => handleEditLC(row)}>{row.groups || ''}</span>
      ),
    },
    {
      flex: 0.105,
      minWidth: 80,
      field: 'check',
      headerName: t('Setting.Check'),
      sortable: false,
      renderHeader: () => (
        <input
          type='checkbox'
          checked={selectAll}
          onChange={handleSelectAll}
        />
      ),
      renderCell: ({ row }) => (
        <label
          className="flex w-full h-full min-h-[32px] items-center justify-center cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type='checkbox'
            checked={deleteList.includes(row.id)}
            onChange={(e: any) => handleDeleteCheck(e, row.id)}
          />
        </label>
      ),
    },
  ], [t, curProject?.units, curProject?.windmeter_units, selectAll, deleteList, handleSelectAll, handleDeleteCheck, handleEditLC])

  const handleDeleteAction = async () => {
    const deletedLcs = lcs.filter(item => deleteList.includes(item.id))
    const filteredList: ILC[] = lcs.filter(item => !deleteList.includes(item.id))
    const delLCList = deletedLcs.map(item => item.lc_id)
    updateLCs(filteredList)
    await db.lcs.bulkDelete(delLCList)
    await f_reset_empty_groups_after_delete(deletedLcs, filteredList)

    setDeleteList([])
    setVisibleDeleteModal(false)
    setVisibleSuccessModal(true)
  }

  const handleNewLC = () => {
    if (activeToastCount > 0) {
      updateErrStr(t('Msg.ErrActiveAlertNoNewLC'))
      return
    }
    setLCItem({} as ILC)
    setVisibleAddModal(true)
  }

  const normalizeGroupsString = (raw: string) =>
    String(raw || '')
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean)
      .join(',');

  const handleBulkEditAction = async (type: 'save', payload: BulkEditLcPayload) => {
    if (type !== 'save') return;
    if (!curProject?.id) return;
    const pid = normalizeProjectId(curProject.id);
    const targetIds = new Set(payload.ids.map((id) => String(id).trim()).filter(Boolean));
    if (targetIds.size === 0) {
      updateErrStr('Select at least one LC ID.');
      return;
    }
    if (!Object.values(payload.overrides).some(Boolean)) {
      updateErrStr('Select at least one override field.');
      return;
    }

    const projectLcs = lcs.filter((lc) => normalizeProjectId(lc.project_id) === pid);
    const targetLcs = projectLcs.filter((lc) => targetIds.has(String(lc.id)));
    if (targetLcs.length === 0) {
      updateErrStr('No matching LCs found in current project for the selected IDs.');
      return;
    }

    const { overrides, values } = payload;
    if (overrides.overload) {
      const ov = Number(values.overload);
      if (!Number.isFinite(ov) || ov <= 0) {
        updateErrStr(t('Msg.ErrOverload'));
        return;
      }
    }
    if (overrides.underload) {
      const un = Number(values.underload);
      if (!Number.isFinite(un)) {
        updateErrStr(t('Msg.ErrUnderloadBigger'));
        return;
      }
    }
    if (overrides.psw) {
      const p = Number(values.psw);
      if (!Number.isFinite(p) || p < 0) {
        updateErrStr(t('Msg.ErrPSWNegative'));
        return;
      }
    }

    try {
      const updatesByLcId = new Map<string, ILC>();
      targetLcs.forEach((lc) => {
        const next: ILC = { ...lc };
        if (overrides.title) next.title = values.title;
        if (overrides.psw) next.psw = values.psw;
        if (overrides.underload) next.underload = values.underload;
        if (overrides.overload) next.overload = values.overload;
        if (overrides.total_sum) next.total_sum = values.total_sum;
        if (overrides.groups) next.groups = normalizeGroupsString(values.groups);

        const ov = Number(next.overload);
        const un = Number(next.underload);
        if (Number.isFinite(ov) && Number.isFinite(un) && un > ov) {
          throw new Error(`LC ${next.id}: underload cannot be greater than overload.`);
        }
        updatesByLcId.set(String(next.lc_id), next);
      });

      const updatedAllLcs = lcs.map((lc) => {
        const updated = updatesByLcId.get(String(lc.lc_id));
        return updated ? updated : lc;
      });

      await db.transaction('rw', db.lcs, async () => {
        const updates = Array.from(updatesByLcId.values());
        for (const updated of updates) {
          await db.lcs.put(updated);
        }
      });

      updateLCs(updatedAllLcs);
      if (overrides.groups) {
        await ensureGroupsActivated(normalizeGroupsString(values.groups).split(',').filter(Boolean));
        const updatedProjectLcs = updatedAllLcs.filter((lc) => normalizeProjectId(lc.project_id) === pid);
        await resetEmptyGroupsAfterLcSave(updatedProjectLcs);
      }
      setDeleteList([]);
      setSelectAll(false);
      setVisibleBulkEditModal(false);
    } catch (error: any) {
      updateErrStr(String(error?.message || error || 'Failed to bulk edit LCs.'));
    }
  };

  const resetEmptyGroupsAfterLcSave = async (nextProjectLcs: ILC[]) => {
    if (!curProject?.id) return;
    const pid = normalizeProjectId(curProject.id);
    const usedGroupIds = new Set<string>();
    nextProjectLcs.forEach((item) => {
      (item.groups || '')
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean)
        .forEach((g) => usedGroupIds.add(g));
    });

    const groupsToReset = groups.filter((g) => {
      if (normalizeProjectId(g.project_id) !== pid) return false;
      return !usedGroupIds.has(String(g.id));
    });

    if (groupsToReset.length > 0) {
      for (const group of groupsToReset) {
        await db.groups
          .filter((g: IGroup) => normalizeProjectId(g.project_id) === pid && String(g.id) === String(group.id))
          .modify({ overload: '', tare: '', sum: '', title: `Grp ${group.id}` });
      }
    }

    // Always refresh from DB so newly activated groups (e.g. overload "0") are not overwritten
    // by stale in-memory snapshots during the same save cycle.
    const refreshed = await db.groups
      .filter((g: IGroup) => normalizeProjectId(g.project_id) === pid)
      .toArray();
    const sorted = [...refreshed].sort((a, b) => parseInt(a.id || '0') - parseInt(b.id || '0'));
    updateGroups(sorted);
  };

  const ensureGroupsActivated = async (groupIdsRaw: string[]) => {
    if (!curProject?.id) return;
    const pid = normalizeProjectId(curProject.id);
    const defaultOverload = '0';
    const groupIds = Array.from(
      new Set(
        (groupIdsRaw || [])
          .map((g) => String(g).trim())
          .filter((g) => /^\d+$/.test(g))
      )
    );
    if (groupIds.length === 0) return;

    for (const gid of groupIds) {
      await db.groups
        .filter((g: IGroup) => normalizeProjectId(g.project_id) === pid && String(g.id) === gid)
        .modify((g: any) => {
          const currentOv = Number(g.overload);
          const hasValidOv = Number.isFinite(currentOv) && currentOv > 0;
          g.title = g.title || `Grp ${gid}`;
          if (!hasValidOv) g.overload = defaultOverload;
          if (g.tare == null) g.tare = '';
          if (g.sum == null) g.sum = '';
        });
    }

    const refreshed = await db.groups
      .filter((g: IGroup) => normalizeProjectId(g.project_id) === pid)
      .toArray();
    const sorted = [...refreshed].sort((a, b) => parseInt(a.id || '0') - parseInt(b.id || '0'));
    updateGroups(sorted);
  };

  const handleLCAction = async (type: string, lc: Partial<ILC> = {}) => {
    switch (type) {
      case 'save': {
        const { unitList, overload, underload, psw, total_sum, title, groups: lcGroups = '', capacity } = lc
        if (!overload || parseFloat(overload) <= 0) {
          updateErrStr(t('Msg.ErrOverload'))
          return
        }
        if (!underload || parseFloat(underload) > parseFloat(overload)) {
          updateErrStr(t('Msg.ErrUnderloadBigger'))
          return
        }

        if (psw && parseFloat(psw) < 0) {
          updateErrStr(t('Msg.ErrPSWNegative'))
          return
        }

        const res = getValidLcIdList(lc.id ? lc.id : unitList ?? '')
        if (!res.isValid) {
          updateErrStr(`Invalid LC unit's range ${res.startRange}-${res.endRange}. Left-hand operator must be smaller than the right-hand operator.`);
          return
        }
        const { ids: valid_ids } = res

        if (!curProject) {
          setVisibleAddModal(false);
          return
        }

        for (const lc of valid_ids) {
          const id_cap = f_verify_lc_id(lc);
          if (!id_cap) {
            updateErrStr('Invalid unit id ' + lc)
            return
          }

          if (!curProject.units) {
            setVisibleAddModal(false);
            return
          }

          const max_capacity = Number((parseFloat(id_cap.capacity[curProject.units.replace('.', '').toLowerCase()])).toFixed(fxRef.current))
          if (parseFloat(overload) > max_capacity) {
            updateErrStr(`Overload can't be higher than capacity, LC: ${lc}, Max Capacity: ${max_capacity}${curProject.units}, Requested Overload: ${overload}${curProject.units}`)
            return
          }

          if (parseFloat(psw ?? '') > max_capacity) {
            updateErrStr(`PSW can't be higher than capacity, LC: ${lc}, Max Capacity: ${max_capacity}${curProject.units}, Requested PSW: ${psw}${curProject.units}`)
            return
          }
        }

        if (!lc.id) {
          const lcs_in_project = f_check_lc_in_project(valid_ids);
          if (lcs_in_project && lcs_in_project.length > 0) {
            updateErrStr('Those units already added to the project: ' + lcs_in_project.join(","));
            return
          }
        }

        setVisibleAddModal(false);
        setIsCreatingLCs(true);
        updateCreatingLCs(true);
        const hideCreatingModal = () => {
          setTimeout(() => {
            setIsCreatingLCs(false);
            updateCreatingLCs(false);
          }, 0);
        };
        try {
          const newLCList: Partial<ILC>[] = valid_ids.map((id) => ({
            id,
            title,
            psw,
            underload,
            overload,
            total_sum,
            groups: lcGroups,
            project_id: normalizeProjectId(curProject.id),
            lc_id: lc.lc_id,
            capacity,
          }));

          if (lc.id) {
            await f_edit_lc(lc);
          } else {
            await f_insert_lcs_bulk(newLCList);
          }

          const editedLcId = lc.id ? String(lc.id) : '';
          const nextProjectLcs = lcs
            .filter((item) => normalizeProjectId(item.project_id) === normalizeProjectId(curProject.id))
            .map((item) => (String(item.id) === editedLcId ? { ...item, groups: lcGroups } : item));
          if (!lc.id && newLCList.length > 0) {
            nextProjectLcs.push(...newLCList as ILC[]);
          }
          await resetEmptyGroupsAfterLcSave(nextProjectLcs);

          const groups_list = lcGroups.split(',').map((g) => g.trim()).filter(Boolean);
          if (groups_list.length > 0) {
            await ensureGroupsActivated(groups_list);
          }
          await f_project_groups();
        } catch (e) {
          console.error('Error creating/updating LCs:', e);
        } finally {
          hideCreatingModal();
        }
        break;
      }
      case 'duplicate':
        break;
      case 'delete': {
        f_delete_lc(LCItem.id)
        setVisibleAddModal(false)
        break;
      }
      case 'calibration':
        setVisibleCalibrationModal(CalibrationModalMode.Calibrate)
        break;
      case 'calibration-delete':
        setVisibleCalibrationModal(CalibrationModalMode.Confirm)
        updateLCs({ ...LCItem, calibration_offset: '1' })
        calibreate(LCItem.lc_id, '1')
        break;
      default:
        break;
    }
  }

  const clear_lc_table = () => {
    console.log('===clear_lc_table===')
  }

  const draw_lc_row = (row: any) => {
    console.log('===draw_lc_row===')
  }

  const calibreate = async (lc_id: string, v: string) => {
    console.log('===calibreate===')
    try {
      await db.lcs
        .where('lc_id')
        .equals(lc_id)
        .modify({ calibration_offset: v })
        .then(function () {
          console.log('Calibration offset updated successfully for lc', lc_id);
        })
    } catch (error) {
      console.error('Error updating calibration offset: ' + error);
    }
  }

  const handleCalibrationAction = async (diff: string) => {
    if (!Number.isFinite(diff)) diff = ''
    const updated = { ...LCItem, calibration_offset: diff }
    updateLCs(updated)
    calibreate(LCItem.lc_id, diff)
  }

  const handleChangeGroup = async (group: IGroup) => {
    if (!group.overload || parseFloat(group.overload) === 0) {
      setErrMsg(t('Msg.ErrOverload'))
    } else {
      setErrMsg('')
      const updatedGroups = groups.map(item => {
        if (item.id === group.id)
          return group
        else
          return item
      })
      const sortedGroups = [...updatedGroups].sort((a, b) => {
        const idA = parseInt(a.id || '0');
        const idB = parseInt(b.id || '0');
        return idA - idB;
      });
      updateGroups(sortedGroups)
      setSelectedGroup(null)
      await db.groups.put(group);
    }
  }

  const gOverload = (overload: string) => {
    const f = curProject.units === Unit_List[2].value ? 3 : 0
    if (overload == null || String(overload).trim() === '') return '';
    const parsed = Number(overload);
    if (!Number.isFinite(parsed)) return '';
    const res = parsed.toFixed(f).toString()
    return res
  }
  return (
    <CommonLayout classes='p-2 gap-1' onDBHandler={setDBHandler}>
      <div className='grid grid-cols-16 h-10 w-full'>
        {groups.map((item: IGroup, index: number) => (
          <div
            key={index}
            className={`flex flex-col border-l border-dark cursor-pointer ${index === groups.length - 1 && 'border-r'}`}
            onClick={() => setSelectedGroup(item)}
          >
            <Text
              classes='h-1/2 bg-primary text-dark !text-xs flex items-center justify-center'
              label={(item.overload != null && String(item.overload).trim() !== '') ? item.title : ''}
            />
            <Text classes='h-1/2 bg-medium text-dark !text-xs flex items-center justify-center' label={gOverload(item.overload)} />
          </div>
        ))}
      </div>
      <div className='flex flex-row items-center justify-between'>
        <div className='flex flex-row items-center gap-2'>
          <Button
            icon={addOutline}
            iconColorDisable={true}
            title={t('Setting.AddLC')}
            classes='border px-2 py-1 bg-primary text-white cursor-pointer'
            textClasses='text-white font-medium'
            onAction={() => handleNewLC()}
          />
          <Button
            icon={createOutline}
            iconColorDisable={true}
            title={t('Setting.EditLC')}
            classes='border px-2 py-1 bg-primary text-white cursor-pointer'
            textClasses='text-white font-medium'
            onAction={() => setVisibleBulkEditModal(true)}
          />
        </div>
        <Button
          icon={removeOutline}
          iconColorDisable={true}
          title={t('Setting.DeleteLC')}
          classes='border px-2 py-1 bg-danger text-white cursor-pointer'
          textClasses='text-white font-medium'
          onAction={() => deleteList.length > 0 && setVisibleDeleteModal(true)}
        />
      </div>
      <div className="flex items-center justify-start px-0.5 pb-1 pt-0.5">
        <Text
          label={t('Setting.LcListTotal', { count: LCList.length })}
          classes="text-sm font-medium text-dark/80 dark:text-light/80"
        />
      </div>
      <div className="flex flex-col rounded-md dark:bg-dark w-full min-w-0">
        <CustomDataGrid
          loading={loading}
          columns={columns}
          data={LCListForGrid}
          getRowId={(row) => String((row as SettingsLcGridRow).lc_id)}
        />
      </div>
      <NewLCModal
        visible={visibleAddModal}
        data={LCItem}
        onAction={handleLCAction}
        onClose={() => setVisibleAddModal(false)}
      />
      <BulkEditLCModal
        visible={visibleBulkEditModal}
        initialIds={deleteList}
        onAction={handleBulkEditAction}
        onClose={() => setVisibleBulkEditModal(false)}
      />
      {calibrationModalMode !== CalibrationModalMode.None && <CalibrationModal
        data={LCItem}
        isConfirmModal={calibrationModalMode === CalibrationModalMode.Confirm}
        onAction={handleCalibrationAction}
        onClose={() => setVisibleCalibrationModal(CalibrationModalMode.None)}
      />}
      <DeleteConfirmModal
        visible={visibleDeleteModal}
        title={t('Msg.ConfirmDeleteTitle')}
        message={t("Msg.ConfirmDelete")}
        onAction={() => handleDeleteAction()}
        onClose={() => setVisibleDeleteModal(false)}
      />
      <SuccessModal
        visible={visibleSuccessModal}
        message={t('Msg.DeleteSuccess')}
        onClose={() => setVisibleSuccessModal(false)}
      />
      {isCreatingLCs && (
        <LoadingModal
          visible={true}
          message={t('Setting.CreatingLCs')}
        />
      )}
      <GroupModal
        visible={selectedGroup ? true : false}
        data={selectedGroup}
        errMsg={errMsg}
        onAction={handleChangeGroup}
        onClose={() => setSelectedGroup(null)}
      />

    </CommonLayout>
  )
}

export default Settings;
