import React, { FC, useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import Text from '../Text';
import { ILC } from '../../helper/types';
import TextInput from '../TextInput';
import { IonToggle } from '@ionic/react';
import Button from '../Buttons/Button';
import { getNewLCIds } from '../../helper/functions';
import useAppData from '../../hooks/useAppData';
import useFunctions from '../../hooks/useFunctions';
interface NewLCModalProps {
  visible: boolean;
  data: Partial<ILC>;
  onAction: (type: string, lc?: Partial<ILC>) => void;
  onClose: () => void;
}

const NewLCModal: FC<NewLCModalProps> = props => {
  const {
    visible,
    data,
    onAction,
    onClose,
  } = props;
  const { t } = useTranslation();
  const { f_verify_lc_id } = useFunctions()

  const [lc, setLC] = useState<Partial<ILC>>({
    underload: '-2',
    total_sum: false,
    ...data,
  });
  const [groups, setGroups] = useState<string>('')
  const [visibleGroups, setVisibleGroups] = useState<boolean>(true);
  const { isMobile, updateErrStr, curProject } = useAppData()
  const refIDInput = useRef<HTMLInputElement>(null)
  const SetvisibleCapacityRef = useRef<boolean>(false)
  const unitKey = useRef(curProject && curProject.units ? curProject.units.replace('.', '').toLowerCase() : 'kg');
  const fxRef = useRef((curProject && curProject.units ? curProject.units.replace('.', '').toLowerCase() : 'kg') === 'mton' ? 3 : 0)
  const lcRef = useRef(lc)

  useEffect(() => {
    unitKey.current = curProject && curProject.units ? curProject.units.replace('.', '').toLowerCase() : 'kg';
  }, [curProject.units]);

  useEffect(() => {
    fxRef.current = ((curProject && curProject.units ? curProject.units.replace('.', '').toLowerCase() : 'kg') === 'mton' ? 3 : 0)
  }, [curProject.units])

  useEffect(() => {
    lcRef.current = lc
  }, [lc])

  useEffect(() => {
    setLC((v: any) => ({
      underload: '-2',
      calibration_offset: '1',
      ...data,
      total_sum: data?.total_sum ?? false
    }))
    if (data?.groups) {
      setGroups(data.groups)
    } else {
      setGroups('');
    }
  }, [data])

  useEffect(() => {
    setLC(v => ({ ...v, groups }))
  }, [groups])

  const handleChangeProject = (field: string, value: string | boolean) => {
    let id_cap: any
    if (lc.lc_id && field === 'unitList') {
      setLC(v => ({ ...v, lc_id: value.toString() }))
    } else {
      setLC(v => ({ ...v, [field]: value }))

      if (field === 'unitList') {
        const idList = getNewLCIds([], value.toString() || '')
        id_cap = f_verify_lc_id(value.toString());
        if (id_cap) {
          SetvisibleCapacityRef.current = true
        }
        else
          SetvisibleCapacityRef.current = false
        if (idList && idList.length > 0) {
          if (idList.some(item => parseInt(item) <= 10)) {
            setVisibleGroups(false)
            return
          }
        }
        setVisibleGroups(true)
      }
      if (SetvisibleCapacityRef.current && id_cap && id_cap.capacity) {
        const capacity = id_cap.capacity
        setLC({ ...lcRef.current, [field]: value, capacity })
      }
    }
  }

  const handleDupllicate = () => {
    const { groups, overload, underload, project_id, psw, title, total_sum } = lc
    setLC({ groups, overload, underload, project_id, psw, title, total_sum })
    refIDInput.current?.focus()
  }

  const handleDelete = () => {
    console.log('handleDelete')
  }

  const handleChangeGroup = (value: string) => {
    const groupList = groups.split(',')
    if (groupList.length > 0) {
      if (groupList.includes(value))
        setGroups(groupList.filter(item => item !== value).sort().join(','))
      else
        setGroups([...groupList, value].filter(item => item).sort().join(','))
    } else
      setGroups(value)
  }

  return (
    <Modal
      header={lc?.lc_id ? t("Setting.EditLC") : t("Setting.AddLC")}
      visible={visible}
      classes={` overflow-auto ${isMobile ? 'w-[450px] h-80' : 'w-[650px]'} `}
      contentClasses={`grid grid-cols-2 ${isMobile ? 'py-4 gap-3' : 'px-6 gap-5'} `}
      footerClasses='!py-0'
      onClose={() => onClose()}
    >
      <TextInput
        label={t("Setting.Name")}
        value={lc.title || ''}
        onChange={e => handleChangeProject('title', e.target.value)}
      />
      <TextInput
        label={`${t("Setting.PSW")}`}
        type='number'
        value={lc.psw || ''}
        inputClasses='w-full'
        onChange={e => handleChangeProject('psw', e.target.value)}
      />
      <TextInput
        label={`${t("Setting.Underload")}`}
        type='number'
        value={lc.underload || ''}
        onChange={e => handleChangeProject('underload', e.target.value)}
      />
      <TextInput
        label={`${t("Setting.Overload")}`}
        type='number'
        value={lc.overload || ''}
        inputClasses='w-full'
        onChange={e => handleChangeProject('overload', e.target.value)}
      />
      <div className='col-span-2 flex flex-row items-center gap-2'>
        <IonToggle
          enableOnOffLabels={true}
          checked={lc.total_sum || false}
          onIonChange={e => handleChangeProject('total_sum', e.target.checked)}
        ></IonToggle>
        <Text label={t('Setting.TotalSum')} />
      </div>

      {SetvisibleCapacityRef.current === true &&
        <>
          <TextInput
            label={`${t("Setting.Capacity")}`}
            type='text'
            value={lc.capacity && unitKey.current in lc.capacity ? parseFloat(lc.capacity[unitKey.current]).toFixed(fxRef.current) : '0.00'}

            readOnly
          /></>}

      <TextInput
        inputRef={refIDInput}
        classes='col-span-2'
        label={`${t("Setting.Units")}`}
        value={lc.id ? lc.id : (lc.unitList || '')}
        readOnly={lc.lc_id ? true : false}
        onChange={e => handleChangeProject('unitList', e.target.value)}
      />
      <div className='col-span-2 grid grid-cols-3 gap-y-4'>
        {visibleGroups && Array(16).fill(0).map((item, index) => (
          <div
            key={index}
            className='flex flex-row items-center gap-2'
            onClick={() => handleChangeGroup((index + 1).toString())}
          >
            <IonToggle
              enableOnOffLabels={true}
              checked={groups.split(',').includes((index + 1).toString())}
            ></IonToggle>
            <Text label={`${t('Setting.Group')} ${index + 1}`} />
          </div>
        ))}
      </div>
      <div className={`col-span-2 flex flex-row items-center justify-end gap-4 w-full pt-3 ${lc.lc_id && 'border-t'}`}>
        <Button
          classes='px-4 py-2 bg-success flex-row-reverse text-white rounded'
          textClasses='text-white font-medium'
          title={t('Common.Save')}
          onAction={() => onAction('save', lcRef.current)}
        />
        {lc.lc_id && <>
          <Button
            classes='px-4 py-2 bg-gray-500 flex-row-reverse text-white rounded'
            textClasses='text-white font-medium'
            title={t('Common.Duplicate')}
            onAction={() => handleDupllicate()}
          />
          <Button
            classes='px-4 py-2 bg-danger rounded'
            textClasses='text-white font-medium'
            title={t('Common.Delete')}
            onAction={() => onAction('delete')}
          />
        </>}
      </div>
      {
        lc.lc_id && !Number.isNaN(parseInt(lc.lc_id)) && parseInt(lc.lc_id) > 10 && <>
          <div className='col-span-2 flex flex-row items-center justify-end gap-4 w-full border-t pt-3'>
            <Button
              classes='px-4 py-2 border border-primary rounded'
              textClasses='font-medium'
              title={t('Setting.Calibration')}
              onAction={() => onAction('calibration')}
            />
            <Button
              classes='px-4 py-2 border border-dark flex-row-reverse text-white rounded'
              textClasses='font-medium'
              title={t('Setting.DeleteCalibration')}
              onAction={() => onAction('calibration-delete')}
            />
          </div>
        </>
      }
    </Modal >
  )
}

export default NewLCModal;
