import { IonButton, IonCard, IonCardHeader, IonCardSubtitle } from '@ionic/react';
import React, { useState } from 'react';
import { getUnixTime } from 'date-fns';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { CSVLink, CSVDownload } from "react-csv";

import { Colors } from '../helper/constants';
import useAppData from '../hooks/useAppData';
import { db } from '../db'
import { IGroup } from '../helper/types';
import useFunctions from '../hooks/useFunctions';

interface GroupCardProps {
  cardType: string;
  colorId?: number;
  title: string;
  liveRead: number;
  id?: string;
}

const GroupCard: React.FC<GroupCardProps> = (props) => {
  const {
    colorId = 0,
    title,
    liveRead,
    cardType,
    id,
  } = props;

  const { groups, curProject, isMobile, platformType, updateConfirmed, updateWeighData } = useAppData();
  const { f_update_project_last_change } = useFunctions()

  const [sumRead, setSumRead] = useState<number>(0);
  const [picks, setPicks] = useState<any>([])

  const [start, setStart] = useState(false);
  const [tare, setTare] = useState(false);

  const [tareVal, setTareVal] = useState(0);
  const [netVal, setNetVal] = useState(0);
  const [grossVal, setGrossVal] = useState(0);

  const handlePick = () => {
    setSumRead((sumRead) => sumRead + liveRead);
    log_totalizer()
    // totalizer_report()
  }

  const log_totalizer = () => {
    const totalizerTable = db.totalizer;

    totalizerTable
      .add({
        group_id: id,
        project_id: curProject.id,
        sum: sumRead,
        log_date: getUnixTime(new Date())
      })
      .then(function () {
        // Successfully inserted into the totalizer table
        console.log('Totalizer record inserted successfully');
      })
      .catch(function (error) {
        console.error('Error inserting totalizer record: ' + error);
      })
      .finally(function () {
        // Update project last change
        f_update_project_last_change();
      });
  }

  const handleReset = () => {
    setSumRead(0);
    setPicks([]);
  }

  const totalizer_report = () => {
    const myObjectStore = db.totalizer;

    myObjectStore
      .where('project_id')
      .equals(curProject.id)
      .and(function (item) {
        return item.group_id === id;
      })
      .toArray()
      .then(async function (data) {
        console.log('log data: ', data)
        if (data.length > 0) {
          const picks = [];
          let total = 0;

          data.forEach(function (row) {
            if (!isNaN(row.sum) && parseFloat(row.sum) > 0 && groups) {
              picks.push([
                groups.find((x: IGroup) => x.id == row.group_id)?.title,
                row.sum,
                curProject.title
              ]);
              total += parseFloat(row.sum);
            }
          });

          picks.push(["sum total", total, ""]);

          if (isMobile) {
            const csvContent = picks.map(e => e.join(",")).join("\n");

            let path = `${title}_totalizer.csv`;
            if (platformType === 'android')
              path = `../Download/${path}`

            const writeResult = await Filesystem.writeFile({
              path,
              data: csvContent,
              // data: "123,324,5223\n32,53,11",
              directory: Directory.Documents,
              encoding: Encoding.UTF8,
            })
            console.log("xml write result: ", writeResult);
          } else {
            // setPicks(picks)
            const csvContent = "data:text/csv;charset=utf-8," + picks.map(e => e.join(",")).join("\n");
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute(
              "download",
              "totalizer_group_" + id + "_project_" + curProject.id + ".csv"
            );

            document.body.appendChild(link);
            link.click();
          }
        }
      })
      .catch(function (error) {
        console.error('Error querying data from the table: ' + error);
      });
  }

  const handleResetDoc = () => {
    setStart(false);
    setTare(false);
  }

  // When clicking "Start", user sees tare, net and gross as 0.
  const handleStart = () => {
    setStart(true);
    setTareVal(0);
    setNetVal(0);
    setGrossVal(0);
  }

  // When clicking "Tare", we take the current live read value as tare - this is "the empty truck"
  const handleTare = () => {
    setTare(true);
    setTareVal(liveRead);
  }

  // When clicking "Confirmed", we do have the net and gross and we get a form to fill up truck info
  const handleConfirmed = () => {
    updateConfirmed(true)
    updateWeighData({
      tare: tareVal,
      net: netVal,
      gross: grossVal,
    })
  }

  const set_group_divs = () => {
    console.log('===set_group_divs===')
  }

  if (cardType === 'totalizer')
    return (
      <>
        <IonCard color={Colors[colorId % 7]} className={`flex flex-col items-center ${isMobile ? "" : ""}`} style={{ height: '220px' }}>
          <IonCardHeader className='flex flex-col items-center'>
            <IonCardSubtitle>{title}</IonCardSubtitle>
            <IonCardSubtitle>Live Read: {liveRead}</IonCardSubtitle>
            <IonCardSubtitle>Sum Read: {sumRead}</IonCardSubtitle>
          </IonCardHeader>

          <IonButton color="warning" className={`rounded-full pb-2 ${isMobile ? "" : ""}`} onClick={handlePick}>Pick</IonButton>
          <hr />
          <div className={`flex flex-row ${isMobile ? "py-2 gap-6" : "py-2 gap-6"}`}>
            <IonButton color="warning" size="small" shape="round" onClick={handleReset}>Reset</IonButton>
            <IonButton color="warning" size="small" shape="round" onClick={() => totalizer_report()}>Download</IonButton>
          </div>
        </IonCard>
      </>
    )

  if (cardType === 'document')
    return (
      <div className={`flex flex-col items-center w-full p-2 border-b-2 border-[#707C00] gap-2 ${isMobile ? " px-4" : "px-8"}`}>
        <h3 className='text-white'>{title}</h3>
        {
          !start ?
            <IonButton color="warning" size="small" onClick={handleStart}>Start</IonButton> :
            <>
              <h3 className='text-white'>Live Read: {liveRead}</h3>
              <div className='text-white w-full flex flex-row justify-between'>
                <h3>Tare: {tareVal}</h3>
                <h3>Net: {netVal}</h3>
                <h3>Gross: {grossVal}</h3>
              </div>
            </>
        }
        {
          start && !tare &&
          <>
            <IonButton color="secondary" size="small" onClick={handleTare}>Tare</IonButton>
          </>
        }
        {
          start && tare &&
          <div className={`flex flex-row gap-4 my-1 ${isMobile ? "" : ""}`}>
            <IonButton color="danger" size="small" onClick={handleResetDoc}>Reset</IonButton>
            <IonButton color="success" size="small" onClick={handleConfirmed}>Confirmed</IonButton>
          </div>
        }
      </div>
    )
  return <></>
}

export default GroupCard;