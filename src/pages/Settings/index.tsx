import React, { ChangeEvent, FC, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CommonLayout from '../../Layout/CommonLayout';
import { IGroup, ILC, IProject } from '../../helper/types';
import Button from '../../components/Buttons/Button';
import CustomDataGrid from '../../components/CustomDataGrid';
import { addOutline, removeOutline } from 'ionicons/icons';
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
import { db } from '../../db'
import useFunctions from '../../hooks/useFunctions';
import './index.css';
import { logEvent } from '../../services/LogService';

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

  // useEffect(() => {
  //   // console.log('groups change: ', groups)
  //   setGroupList(groups)
  // }, [groups])

  const handleDeleteList = (id: string) => {
    if (deleteList.includes(id))
      setDeleteList(v => v.filter(item => item !== id))
    else
      setDeleteList(v => [...v, id])
  }
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = e.target.checked;
    setSelectAll(isChecked);

    if (isChecked) {
      const allIds = LCList.map(row => row.id); // Assuming `rows` is your data array
      setDeleteList(allIds);
    } else {
      setDeleteList([]);
    }
  };

  const handleDeleteCheck = (e: ChangeEvent<HTMLIonCheckboxElement>, id: string) => {
    e.preventDefault()
    handleDeleteList(id)
  }

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

  const columns = [
    {
      field: '__uiRowIndex',
      headerName: '#',
      flex: 0.055,
      minWidth: 44,
      sortable: false,
      filterable: false,
      disableReorder: true,
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: (params) => {
        const sortedIds = params.api.getSortedRowIds();
        const idx = sortedIds.indexOf(params.id);
        const n = idx >= 0 ? idx + 1 : '';
        return (
          <span className="text-dark dark:text-light col-item text-center tabular-nums block w-full">
            {n}
          </span>
        );
      },
    },
    {
      flex: 0.079,
      minWidth: 60,
      field: 'id',
      headerName: t('Setting.Id'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => <span className="text-dark dark:text-light col-item" onClick={() => handleEditLC(row)}>{row.id}</span>
    },
    {
      flex: 0.118,
      minWidth: 90,
      field: 'title',
      headerName: t('Setting.Name'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => <span className="text-dark dark:text-light col-item" onClick={() => handleEditLC(row)}>{row.title}</span>
    },
    {
      flex: 0.118,
      minWidth: 90,
      field: 'Capacity',
      headerName: t('Setting.Capacity'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => (
        <span className="text-dark dark:text-light col-item" onClick={() => handleEditLC(row)}>
          {row.capacity ? parseFloat(row.capacity[(curProject && curProject.units ? curProject.units.replace('.', '').toLowerCase() : 'kg')]).toFixed(fxRef.current) : 'N/A'} {row.id >= 10 ? curProject.units : curProject.windmeter_units}
        </span>
      )

      // renderCell: ({ row }) => <span className="text-dark dark:text-light col-item" onClick={() => handleEditLC(row)}>{parseFloat(row.capacity?.kg).toFixed(2)}{row.id >= 10 ? curProject.units : curProject.windmeter_units}</span>
    },
    {
      flex: 0.118,
      minWidth: 90,
      field: 'underload',
      headerName: t('Setting.Underload'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => <span className="text-dark dark:text-light col-item" onClick={() => handleEditLC(row)}>{parseFloat(row.underload).toFixed(2)}</span>
    },
    {
      flex: 0.118,
      minWidth: 90,
      field: 'overload',
      headerName: t('Setting.Overload'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => <span className="text-dark dark:text-light col-item" onClick={() => handleEditLC(row)}>{parseFloat(row.overload).toFixed(2)}</span>
    },
    {
      flex: 0.105,
      minWidth: 80,
      field: 'psw',
      headerName: t('Setting.PSW'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => <span className="text-dark dark:text-light col-item" onClick={() => handleEditLC(row)}>{row.psw || 0}</span>
    },
    {
      flex: 0.118,
      minWidth: 90,
      field: 'total_sum',
      headerName: t('Setting.Total'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => <span className="text-dark dark:text-light col-item" onClick={() => handleEditLC(row)}>{row.total_sum ? 'Yes ' : 'No'}</span>
    },
    {
      flex: 0.118,
      minWidth: 90,
      field: 'groups',
      headerName: t('Setting.Groups'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => <span className="text-dark dark:text-light col-item" onClick={() => handleEditLC(row)}>{row.groups || ''}</span>
    },
    {
      flex: 0.105,
      minWidth: 80,
      field: 'check',
      headerName: t('Setting.Check'),
      // eslint-disable-next-line
      // @ts-ignore
      renderHeader: () => (
        <input
          type='checkbox'
          checked={selectAll}
          onChange={handleSelectAll}
        />
      ),
      // eslint-disable-next-line
      //@ts-ignore
      renderCell: ({ row }) => <div onClick={(e) => handleDeleteCheck(e, row.id)}>
        <input type='checkbox' checked={deleteList.includes(row.id)} onChange={(e: any) => handleDeleteCheck(e, row.id)} />
      </div>
    },
  ];

  const handleNewLC = () => {
    if (activeToastCount > 0) {
      updateErrStr(t('Msg.ErrActiveAlertNoNewLC'))
      return
    }
    setLCItem({} as ILC)
    setVisibleAddModal(true)
  }

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

    if (groupsToReset.length === 0) return;

    for (const group of groupsToReset) {
      await db.groups
        .filter((g: IGroup) => normalizeProjectId(g.project_id) === pid && String(g.id) === String(group.id))
        .modify({ overload: '', tare: '', sum: '', title: `Grp ${group.id}` });
    }

    const resetIds = new Set(groupsToReset.map((g) => String(g.id)));
    const nextGroups = groups.map((g) =>
      resetIds.has(String(g.id))
        ? { ...g, overload: '', tare: '', sum: '', title: `Grp ${g.id}` }
        : g
    );
    updateGroups(nextGroups);
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

          const groups_list = lcGroups.split(',');
          if (groups_list.length > 0) {
            for (const g of groups_list) {
              if (!isNaN(parseInt(g)) && groups[parseInt(g) - 1]?.id) {
                await f_save_group(normalizeProjectId(curProject.id), g, `Grp ${g}`, '0');
              }
            }
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

  const handleEditLC = (lc: ILC) => {
    setLCItem(lc)
    setVisibleAddModal(true)
  }
  const gOverload = (overload: string) => {
    const f = curProject.units === Unit_List[2].value ? 3 : 0
    const res = overload && parseFloat(overload).toFixed(f).toString()
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
            <Text classes='h-1/2 bg-primary text-dark !text-xs flex items-center justify-center' label={(item.overload) ? item.title : ''} />
            <Text classes='h-1/2 bg-medium text-dark !text-xs flex items-center justify-center' label={gOverload(item.overload)} />
          </div>
        ))}
      </div>
      <div className='flex flex-row items-center justify-between'>
        <Button
          icon={addOutline}
          iconColorDisable={true}
          title={t('Setting.AddLC')}
          classes='border px-2 py-1 bg-primary text-white cursor-pointer'
          textClasses='text-white font-medium'
          onAction={() => handleNewLC()}
        />
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
          data={LCList}
        />
      </div>
      <NewLCModal
        visible={visibleAddModal}
        data={LCItem}
        onAction={handleLCAction}
        onClose={() => setVisibleAddModal(false)}
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
