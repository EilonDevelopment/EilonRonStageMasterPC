import React, { FC, useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import { IGroup, ILC, IProofTest } from '../../helper/types';
import './index.css';
import Select from '../Selects/Select';
import { Line } from 'react-chartjs-2';
import useAppData from '../../hooks/useAppData';
import { jsPDF } from "jspdf";
import ProofProjectInformationModal, { InformationTypes } from './ProofProjectInformationModal';
import ButtonDropdown from '../Buttons/ButtonDropdown';
import { db } from '../../db';
import useFunctions from '../../hooks/useFunctions';
import { ChartJSOrUndefined } from 'react-chartjs-2/dist/types';
import { BubbleDataPoint, Point } from 'chart.js';

// const initGraphData = [
//   {
//     "id": "13281",
//     "label": "d1",
//     "data": [
//       "-32",
//       "-35",
//       "-34",
//       "-36",
//       "-33",
//       "-32"
//     ]
//   }
// ]
// const initLabels = ['5:40:21', '5:40:24', '5:40:27', '5:40:30', '5:40:33', '5:40:36']

interface ProofTestModalProps {
  visible: boolean;
  groupList: IGroup[];
  lcList: ILC[];
  unit: string;
  data: IProofTest | null;
  errMsg?: string;
  onClose: () => void;
}

const units = [
  { label: 'Seconds', value: 'seconds' },
  { label: 'Minutes', value: 'minutes' }
]

const ProofTestModal: FC<ProofTestModalProps> = props => {
  const {
    visible,
    groupList,
    lcList,
    unit,
    data,
    errMsg = '',
    onClose,
  } = props;
  const { t } = useTranslation();

  const { liveLC, curProject } = useAppData();
  const { f_load_lcs } = useFunctions()
  const [info, setInfo] = useState<IProofTest>({} as IProofTest)
  const [groupLCList, setGroupLCList] = useState<any[]>([])

  const [selectGroup, setSelectGroup] = useState<string>('')
  const [lbs, setLBS] = useState<number>(0)
  const [threshold, setThreshold] = useState<number>(0)
  const [liveLBS, setLiveLBS] = useState<number>(0)

  const [start, setStart] = useState<boolean>(false)
  const [reset, setReset] = useState<boolean>(false)

  const [selectUnit, setSelectUnit] = useState<string>(units[0].value)
  const [countDown, setCountDown] = useState<number>(0)
  const [countDownNum, setCountDownNum] = useState(0)
  const [intervals, setIntervals] = useState<number>(1)
  const [countUp, setCountUp] = useState<number>(0)
  const [visibleEdit, setVisibleEdit] = useState<boolean>(false)
  const [validLcs, setValiLcs] = useState<ILC[]>([])
  const [selectedLC, setSelectedLC] = useState<Partial<ILC>>()
  // chart graph data
  const [labels, setLabels] = useState<string[]>([])
  const [graphData, setGraphData] = useState<any[]>([])
  const refGraph = useRef<ChartJSOrUndefined<"line", (number | [number, number] | Point | BubbleDataPoint | null)[], unknown>>(null)
  const [inputDisable, setInputDisable] = useState<boolean>(false);

  const [next_certificate, setNext_certificate] = useState<number>(0);

  const listLcs = validLcs.map(lc => {
    return {
      label: lc.title,
      value: lc.lc_id,
    }
  })


  useEffect(() => {
    if (lcList.length > 0 && info.group_id) {
      const filteredLC = lcList.filter((item) => {
        if (item.groups) {
          const groupIds = item.groups.split(',');
          if (groupIds.includes(info.group_id))
            return true
        }
        return false
      })
      setValiLcs(filteredLC)
      console.log("filteredLc", filteredLC)
      setGraphData(filteredLC.map((item) => ({
        id: item.id,
        label: item.title,
        data: []
      })))
    }
  }, [info.group_id])

  useEffect(() => {
    if (start && countDownNum > 0) {
      setTimeout(() => {
        setCountDownNum(v => v - 1);
        setCountUp(v => v + 1)
      }, 1000)
    } else if (countDownNum === 0) {
      setStart(false)
      setCountDownNum(selectUnit === 'seconds' ? countDown : countDown * 60)
      setCountUp(0)
      setInputDisable(false)
    }
    if (!start) {
      setCountDownNum(selectUnit === 'seconds' ? countDown : countDown * 60)
      setInputDisable(false)
      setCountUp(0)
    }
  }, [start, countDownNum])


  useEffect(() => {
    if (!start)
      return;
    if (intervals > 0 && countUp === intervals) {
      const liveLC = { id: '2', value: Math.random() * 100, time: new Date().getTime().toString() }
      setCountUp(0)
      if (liveLC) {
        setLabels(v => [...v, liveLC.time])
        setGraphData(v => v.map((item) => {
          if (item.id === liveLC.id) {
            return {
              ...item,
              data: [...item.data, liveLC.value]
            }
          }
          return item
        }))

        if (info.overload !== undefined) {
          if (liveLC.value >= parseFloat(info.overload)) {
            setStart(false)
            setCountDownNum(selectUnit === 'seconds' ? countDown : countDown * 60)
            setCountUp(0)
            setInputDisable(false)
          }
        }
      }
    }
  }, [countUp])

  useEffect(() => {
    const val = localStorage.getItem("certnum");
    if (val === null) {
      setNext_certificate(10000)
    } else {
      setNext_certificate(parseInt(val))
    }
  }, [])


  const handleChange = (field: string, value: string | number) => {
    setInfo(v => ({ ...v, [field]: value }))
    setCountDownNum(selectUnit === 'seconds' ? countDown : countDown * 60)
  }

  const handleStart_stop = () => {
    setStart(v => !v)
    setReset(true)
    setInputDisable(v => !v)
  }

  const handleReset = () => {
    setStart(false)
    setReset(false)
    setLabels([])
    setCountDown(0)
    setInfo({
      id: '',
      group_id: '',
      lc_id: '',
      project_id: '',
      log_date: '',
      value: '',
      overload: '',
      underload: '',
      unit: '',
      realval: '',
    })
    setGraphData(v => v.map(item => ({
      ...item,
      data: []
    })))
  }

  const changeCountDown = (count: number) => {
    setCountDown(count)
    setCountDownNum(selectUnit === 'seconds' ? count : count * 60)
  }

  const handleUnitChange = (unit: any) => {
    setSelectUnit(unit.toString())
    setCountDownNum(unit === 'seconds' ? countDownNum : countDownNum * 60)
  }

  const changeInterval = (interval: string) => {
    setIntervals(parseInt(interval))
  }

  const handleEditPdf = (lc_id: string) => {
    const selLc = validLcs.find(lc => lc.lc_id.toString() === lc_id)
    selLc && setSelectedLC(selLc)
    setVisibleEdit(true)
  }

  const handleChangePdfInfo = async (data: any) => {

    if (!selectedLC) return
    const updatedData = {
      productdescription: data.productDesc ?? '',
      machinecode: data.machineCode ?? '',
      certcompany: data.company ?? '',
      serialortag: data.serialORTag ?? '',
      productname: data.productName ?? '',
      companytel: data.tel ?? '',
      wll: data.wll ?? '',
      modelname: data.modelName ?? '',
      companycontact: data.contact ?? '',
      testmethod: data.testMethod ?? '',
      testlocation: data.testLocation ?? '',
      certcompanyaddress: data.address ?? '',
      notes: data.notes ?? '',
    }
    if (!selectedLC.lc_id) return
    await db.lcs.where('lc_id').equals(selectedLC.lc_id).modify(updatedData)
    await f_load_lcs()

    setVisibleEdit(false)
  }

  const lcListDropdown = [
    { label: '---', value: '' },
    ...groupList.map(item => ({ label: item.title, value: item.id || '' }))
  ]


  const handleDownloadPDF = () => {
    // if (!liveLC) return;
    // console.log('pdf log')
    // const selectedLC = lcList.find(item => item.id === liveLC.id)
    // if (!selectedLC) return;
    const selectedLC = lcList[0]

    setNext_certificate(v => v + 1)
    const doc = new jsPDF('p', 'mm', 'a4', true);
    // if ($("#detailsheader_image").attr('src')) {
    //   doc.addImage($("#detailsheader_image").attr('src'), "JPEG", -30, 0, 260, 40);
    // }
    // doc.addFont("./fonts/arial-unicode-ms.ttf", "ArialUTF", "normal");

    const left_col_caption_x = 8;
    const left_col_x = 63;

    const right_col_caption_x = 97;
    const right_col_x = 149;

    doc.setFont('ArialUTF');
    doc.setFontSize(8);
    doc.setDrawColor(0);
    doc.setFillColor(18, 30, 54);
    doc.rect(7, 45, 193, 10, "F");
    doc.setTextColor(240, 180, 8);
    doc.text(t('ProofTest.Modal.PDFTitle'), 10, 51);

    doc.setLineWidth(0.3);
    doc.setDrawColor(220, 200, 200);
    doc.setTextColor(0, 0, 0);

    doc.text(t('ProofTest.Modal.DateOfTest'), left_col_caption_x, 62);
    doc.text(new Date().toLocaleDateString(), left_col_x, 62);
    doc.text(t('ProofTest.Modal.ProductDesc'), right_col_caption_x, 62);
    doc.text(selectedLC.productdescription ?? 'undefined', right_col_x, 62);

    doc.text(t('ProofTest.Modal.CertNum'), left_col_caption_x, 68);
    doc.text(`${next_certificate}`, left_col_x, 68);
    doc.text(t("ProofTest.Modal.SerialORTag"), right_col_caption_x, 68);
    doc.text(selectedLC.serialortag ?? 'undefined', right_col_x, 68);

    doc.text(t("ProofTest.Modal.Company"), left_col_caption_x, 74);
    doc.text(selectedLC.certcompany ?? 'undefined', left_col_x, 74);

    doc.text(t("ProofTest.Modal.WLL"), right_col_caption_x, 74);
    doc.text(selectedLC.wll ?? 'undefined', right_col_x, 74);

    doc.text(t("ProofTest.Modal.Address"), left_col_caption_x, 80);
    doc.text(selectedLC.certcompanyaddress ?? 'undefined', left_col_x, 80);
    doc.text(t("ProofTest.Modal.TestMethod"), right_col_caption_x, 80);
    doc.text(selectedLC.testmethod ?? 'undefined', right_col_x, 80);

    doc.text(t("ProofTest.Modal.Tel"), left_col_caption_x, 86);
    doc.text(selectedLC.companytel ?? 'undefined', left_col_x, 86);
    doc.text(t("ProofTest.Modal.DurationOfTest"), right_col_caption_x, 86);
    doc.text(`${countDownNum} seconds`, right_col_x, 86);

    doc.text(t("ProofTest.Modal.Contact"), left_col_caption_x, 92);
    doc.text(selectedLC.companycontact ?? 'undefined', left_col_x, 92);
    doc.text(t("ProofTest.Modal.Notes"), right_col_caption_x, 92);
    doc.text(selectedLC.notes ?? 'undefined', right_col_x, 92);

    doc.text(t("ProofTest.Modal.MachineCode"), left_col_caption_x, 98);
    doc.text(selectedLC.machinecode ?? 'undefined', left_col_x, 98);
    doc.text(t("ProofTest.Modal.ProductName"), right_col_caption_x, 98);
    doc.text(selectedLC.productname ?? 'undefined', right_col_x, 98);

    doc.text(t("ProofTest.Modal.ModelName"), left_col_caption_x, 104);
    doc.text(selectedLC.modelname ?? 'undefined', left_col_x, 104);
    doc.text(t("ProofTest.Modal.TestLocation"), right_col_caption_x, 104);
    doc.text(selectedLC.testlocation ?? 'undefined', right_col_x, 104);

    // Convert Canvas graph to PDF


    doc.setFont('ArialUTF');
    doc.setFontSize(8);
    doc.setDrawColor(0);
    doc.setFillColor(18, 30, 54);
    doc.rect(7, 115, 193, 10, "F");
    doc.setTextColor(240, 180, 8);

    const lgVals = graphData[0].data.map((d: string) => d && parseInt(d))
    const maxLGval = Math.max(...lgVals)
    doc.text(`Peak ${maxLGval.toString()}${curProject.units ?? 'KG'}`, 10, 121);

    const imgData = refGraph.current?.canvas.toDataURL('image/png')
    if (!imgData) return
    doc.addImage(imgData, 'PNG', 15, 130, 180, 130)


    const file = curProject.title;
    if (typeof doc !== "undefined") {
      doc.save(`${file}_10001_1.pdf`);
    } else {
      alert("Error 0xE001BADF");
    }
  }

  const handleConvertCanvaToPDF = () => {
    // Convert Canvas graph to PDF
    const imgData = refGraph.current?.canvas.toDataURL('image/png')
    const doc = new jsPDF('p', 'mm')
    if (!imgData) return
    doc.addImage(imgData, 'PNG', 10, 10, 200, 200)
    doc.save('sample-file.pdf')
  }


  return (
    <Modal
      header={t('ProofTest.Title')}
      visible={visible}
      classes='w-[800px]'
      onClose={() => onClose()}
    >
      <div className="modal-body">
        <div id="proof_button">
          <ButtonDropdown
            classes='btn btn-secondary dropdown-toggle'
            classesContainer='mb-2'
            value={listLcs[0]?.value ?? ''}
            list={listLcs}
            disabled={inputDisable}
            onChange={(lc_id) => {
              lc_id && handleEditPdf(lc_id.toString())
            }}
          />
          <button onClick={() => handleDownloadPDF()} disabled={inputDisable} className="btn btn-primary" data-translate="Download_PDF" id="proof_pdf">
            {t("ProofTest.DownloadPDF")}
          </button>
        </div>
        <div className="row-item">
          <div className="col-3">
            <div className="form-group">
              <label data-translate="Select_Group">{t("ProofTest.SelectGroup")}</label>
              <Select
                value={info.group_id}
                list={lcListDropdown}
                disabled={inputDisable}
                onChange={(value) => handleChange('group_id', value)}
              />
            </div>
          </div>
          <div className="col-4">
            <div className="form-group">
              <label data-translate="Count_Down">{t("ProofTest.CountDown")}</label>
              <div className="input-group">
                <input
                  type="number"
                  id="countdown_val"
                  placeholder="999999999"
                  className="form-control rounded-l border-r-0 outline-none"
                  value={countDown}
                  disabled={inputDisable}
                  onChange={(e: any) => changeCountDown(e.target.value)}
                />
                <Select
                  classes='rounded-l-none !w-20'
                  value={selectUnit}
                  list={units}
                  disabled={inputDisable}
                  onChange={(unit) => handleUnitChange(unit)}
                />
                {start &&
                  <span className="bg-green-800 text-white text-base font-medium me-2 px-1.5 py-0.5 ml-1 rounded-full dark:bg-green-100 flex justify-center items-center dark:text-green-800 w-6 h-6">{countDownNum}</span>
                }
              </div>
              <span className="badge badge-info d-none" id="countdown_remain"></span>
            </div>

          </div>
        </div>
        <div className="row-items">
          <div className="left-side-test">
            <div className="col-6d">
              <div className="row-item">
                <div className="col-3">
                  <div className="form-group">
                    <label>{t("ProofTest.LoadTest", { unit: unit.toUpperCase() })}:</label>
                    <input
                      type="number"
                      className="form-control rounded outline-none"
                      value={info.overload}
                      disabled={inputDisable}
                      onChange={(e: any) => handleChange('overload', e.target.value)}
                    />
                  </div>
                </div>
                <div className="col-3">
                  <div className="form-group">
                    <label data-translate="Thershold">{t("ProofTest.Threshold")} %:</label>
                    <input
                      type="number"
                      className="form-control rounded outline-none"
                      id="thershold"
                      disabled={inputDisable}
                      value={info.underload}
                      onChange={(e: any) => handleChange('underload', e.target.value)}
                    />
                  </div>
                </div>
                <div className="col-3">
                  <div className="form-group">
                    <label>{t("ProofTest.Interval")} <sup data-translate="seconds">(Seconds)</sup>:</label>
                    <input
                      type="number"
                      className="form-control outline-none"
                      id="proof_interval"
                      disabled={inputDisable}
                      value={intervals}
                      onChange={(e: any) => changeInterval(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="right-side-test">
            <div className="col-2">
              <button type="button" id="proof_toggle" className="btn btn-success" onClick={() => handleStart_stop()}>
                <i className="fa fa-play-circle  fa-2x"></i>{start ? t("ProofTest.Stop") : t("ProofTest.Start")}
              </button>
            </div>
            <div className="row-itemss">
              <div className="col-4">
                <button id="proof_zero" className="btn btn-outline-secondary" onClick={() => handleReset()}>{t("ProofTest.Reset")}</button>
              </div>

              <div className="col-6d">
                <div className="form-group">
                  <label>{t("ProofTest.LiveRead", { unit: unit.toUpperCase() })}</label>
                  {/* <input type="number" readOnly className="form-control outline-none live" id="proof_current_read" value={liveLC?.title ?? ''} /> */}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="row-item">
          {reset &&
            <Line
              ref={refGraph}
              datasetIdKey='id'
              data={{
                labels: labels,
                datasets: graphData
              }}
              options={{
                elements: {
                  line: {
                    cubicInterpolationMode: 'monotone'
                  }
                }
              }}
            />
          }
        </div>
      </div>
      <ProofProjectInformationModal
        visible={visibleEdit}
        selectedLC={selectedLC}
        onAction={(data: InformationTypes) => handleChangePdfInfo(data)}
        onClose={() => setVisibleEdit(false)}
      />
    </Modal>
  )
}

export default ProofTestModal;
