// import React, { useCallback, useEffect, useState } from 'react';
// import {
//   IonButton,
//   IonContent,
//   IonPage,
//   IonSelect,
//   IonSelectOption,
//   IonItem,
//   IonLabel,
//   IonList,
//   IonNote,
// } from '@ionic/react';
// import { runStressTest, isStressTestRunning, type StressStats, type StressMode } from '../utils/stressTest';

// const MODES: { value: StressMode; label: string }[] = [
//   { value: 'db', label: 'DB only (Dexie)' },
//   { value: 'dom', label: 'DOM only' },
//   { value: 'both', label: 'DB + DOM' },
// ];

// const DURATIONS = [
//   { value: 30_000, label: '30 sec' },
//   { value: 60_000, label: '1 min' },
//   { value: 120_000, label: '2 min' },
//   { value: 300_000, label: '5 min' },
// ];

// const StressTestPage: React.FC = () => {
//   const [mode, setMode] = useState<StressMode>('both');
//   const [durationMs, setDurationMs] = useState(60_000);
//   const [stats, setStats] = useState<StressStats | null>(null);
//   const [running, setRunning] = useState(false);
//   const [stopFn, setStopFn] = useState<(() => void) | null>(null);

//   const onProgress = useCallback((_msg: string, s: StressStats) => {
//     setStats({ ...s });
//   }, []);

//   const onDone = useCallback((s: StressStats, err?: Error) => {
//     setStats({ ...s });
//     setRunning(false);
//     setStopFn(null);
//     if (err) console.error('Stress test error:', err);
//   }, []);

//   const start = useCallback(() => {
//     setStats(null);
//     setRunning(true);
//     const stop = runStressTest({
//       mode,
//       durationMs,
//       dbWorkers: 5,
//       domIntensity: 500,
//       onProgress,
//       onDone,
//     });
//     setStopFn(() => stop);
//   }, [mode, durationMs, onProgress, onDone]);

//   const stop = useCallback(() => {
//     stopFn?.();
//   }, [stopFn]);

//   useEffect(() => {
//     (window as any).runStressTest = (opts?: { mode?: StressMode; durationMs?: number }) => {
//       runStressTest({
//         mode: opts?.mode ?? 'both',
//         durationMs: opts?.durationMs ?? 60_000,
//         onProgress: (_, s) => {
//           setStats({ ...s });
//           console.log('Stress stats', s);
//         },
//         onDone: (s, e) => {
//           setStats({ ...s });
//           setRunning(false);
//           if (e) console.error(e);
//           console.log('Stress test done', s);
//         },
//       });
//       setRunning(true);
//     };
//     return () => {
//       delete (window as any).runStressTest;
//     };
//   }, []);

//   return (
//     <IonPage>
//       <IonContent className="ion-padding">
//         <h1>Crash repro stress test</h1>
//         <p>
//           Simulates heavy DB (Dexie) and DOM load to help reproduce random crashes. Run one mode at a time or both
//           together. You can also run from the browser console: <code>runStressTest(&#123; mode: &apos;db&apos;, durationMs: 60000 &#125;)</code>
//         </p>

//         <IonList>
//           <IonItem>
//             <IonLabel>Mode</IonLabel>
//             <IonSelect
//               value={mode}
//               onIonChange={(e) => setMode(e.detail.value as StressMode)}
//               disabled={running}
//               interface="popover"
//             >
//               {MODES.map((m) => (
//                 <IonSelectOption key={m.value} value={m.value}>
//                   {m.label}
//                 </IonSelectOption>
//               ))}
//             </IonSelect>
//           </IonItem>
//           <IonItem>
//             <IonLabel>Duration</IonLabel>
//             <IonSelect
//               value={durationMs}
//               onIonChange={(e) => setDurationMs(e.detail.value)}
//               disabled={running}
//               interface="popover"
//             >
//               {DURATIONS.map((d) => (
//                 <IonSelectOption key={d.value} value={d.value}>
//                   {d.label}
//                 </IonSelectOption>
//               ))}
//             </IonSelect>
//           </IonItem>
//         </IonList>

//         <div className="ion-margin-top">
//           {!running ? (
//             <IonButton onClick={start} expand="block">
//               Start stress test
//             </IonButton>
//           ) : (
//             <IonButton onClick={stop} color="danger" expand="block">
//               Stop
//             </IonButton>
//           )}
//         </div>

//         {stats && (
//           <div className="ion-margin-top" style={{ fontFamily: 'monospace', fontSize: '14px' }}>
//             <p>
//               <strong>DB ops:</strong> {stats.dbOps} &nbsp; <strong>DB errors:</strong> {stats.dbErrors}
//             </p>
//             <p>
//               <strong>DOM ops:</strong> {stats.domOps} &nbsp; <strong>DOM errors:</strong> {stats.domErrors}
//             </p>
//             {stats.startTime && (
//               <p>
//                 <strong>Running:</strong> {stats.running ? 'Yes' : 'No'}
//                 {stats.endTime != null && (
//                   <> &nbsp; <strong>Duration:</strong> {((stats.endTime - stats.startTime) / 1000).toFixed(1)}s</>
//                 )}
//               </p>
//             )}
//           </div>
//         )}

//         {running && isStressTestRunning() && (
//           <IonNote color="warning" className="ion-margin-top">
//             Stress test in progress. Use the app normally; if it crashes, note whether DB or DOM was active.
//           </IonNote>
//         )}
//       </IonContent>
//     </IonPage>
//   );
// };

// export default StressTestPage;
export {};
