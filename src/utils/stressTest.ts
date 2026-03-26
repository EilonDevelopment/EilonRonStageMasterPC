// /**
//  * Stress test utility to help reproduce random app crashes.
//  * Simulates heavy DB (Dexie) and DOM load similar to real app usage.
//  *
//  * Run from browser console (after app is loaded):
//  *   window.runStressTest?.({ mode: 'db', durationMs: 60000 })
//  *   window.runStressTest?.({ mode: 'dom', durationMs: 60000 })
//  *   window.runStressTest?.({ mode: 'both', durationMs: 120000 })
//  *
//  * Or open the app route /stress-test and use the UI.
//  */

// import { db } from '../db';

// export type StressMode = 'db' | 'dom' | 'both';

// export type StressOptions = {
//   /** 'db' | 'dom' | 'both' */
//   mode: StressMode;
//   /** How long to run in ms. Default 60000 (1 min). */
//   durationMs?: number;
//   /** DB: concurrent workers. Default 5. */
//   dbWorkers?: number;
//   /** DOM: nodes per batch / re-renders per second. Default 500. */
//   domIntensity?: number;
//   /** Callback for progress (message, stats). */
//   onProgress?: (message: string, stats: StressStats) => void;
//   /** Callback when finished or stopped. */
//   onDone?: (stats: StressStats, error?: Error) => void;
// };

// export type StressStats = {
//   startTime: number;
//   endTime?: number;
//   dbOps: number;
//   dbErrors: number;
//   domOps: number;
//   domErrors: number;
//   running: boolean;
// };

// const defaultOptions: Required<Omit<StressOptions, 'onProgress' | 'onDone'>> = {
//   mode: 'both',
//   durationMs: 60_000,
//   dbWorkers: 5,
//   domIntensity: 500,
// };

// let activeController: AbortController | null = null;

// function makeFakeLog(projectId: string, lcId: string) {
//   return {
//     lc_id: lcId,
//     project_id: projectId,
//     log_date: new Date().toISOString(),
//     value: Math.random() * 1000,
//     overload: 1000,
//     underload: 0,
//     unit: 'kg',
//     realval: String(Math.random() * 1000),
//     battery: '100',
//   };
// }

// function makeFakeLc(projectId: string) {
//   const id = `stress-lc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
//   return {
//     lc_id: id,
//     id,
//     project_id: projectId,
//     title: `Stress LC ${id}`,
//     psw: 0,
//     underload: '0',
//     overload: '1000',
//     total_sum: false,
//     groups: '',
//     view_x: 0,
//     view_y: 0,
//     calibration_offset: 0,
//     zero: 0,
//     tare: 0,
//   };
// }

// /** Run DB stress: concurrent reads/writes, transactions, bulk ops like the real app. */
// async function runDbStress(
//   signal: AbortSignal,
//   stats: StressStats,
//   workers: number,
//   onProgress?: StressOptions['onProgress']
// ) {
//   const projectId = `stress-project-${Date.now()}`;

//   const worker = async () => {
//     while (!signal.aborted) {
//       try {
//         // Mix of operations that mirror real app usage
//         const op = Math.floor(Math.random() * 6);
//         switch (op) {
//           case 0: {
//             await db.logs.add(makeFakeLog(projectId, `lc-${Math.random()}`));
//             break;
//           }
//           case 1: {
//             await db.logs.filter((l: any) => l.project_id === projectId).toArray();
//             break;
//           }
//           case 2: {
//             await db.projects.toArray();
//             break;
//           }
//           case 3: {
//             await db.lcs.filter((lc: any) => lc.project_id === projectId).toArray();
//             break;
//           }
//           case 4: {
//             await db.transaction('rw', db.logs, db.lcs, async () => {
//               await db.logs.add(makeFakeLog(projectId, `lc-${Math.random()}`));
//               const list = await db.lcs.filter((lc: any) => lc.project_id === projectId).toArray();
//               if (list.length > 0) await db.lcs.put(list[0]);
//             });
//             break;
//           }
//           default: {
//             const bulk = Array.from({ length: 10 }, () => makeFakeLog(projectId, `lc-${Math.random()}`));
//             await db.logs.bulkAdd(bulk).catch(() => undefined);
//             break;
//           }
//         }
//         stats.dbOps++;
//       } catch (e) {
//         stats.dbErrors++;
//       }
//       if (stats.dbOps % 100 === 0 && onProgress) {
//         onProgress('DB stress running...', { ...stats });
//       }
//     }
//   };

//   await Promise.all(Array.from({ length: workers }, () => worker()));
// }

// /** Run DOM stress: create/remove nodes and force layout, similar to heavy UI. */
// function runDomStress(
//   signal: AbortSignal,
//   stats: StressStats,
//   intensity: number,
//   onProgress?: StressOptions['onProgress']
// ) {
//   const container = document.createElement('div');
//   container.id = 'stress-test-dom-root';
//   container.style.setProperty('position', 'fixed');
//   container.style.setProperty('top', '-9999px');
//   container.style.setProperty('left', '-9999px');
//   container.style.setProperty('width', '1px');
//   container.style.setProperty('height', '1px');
//   container.style.setProperty('overflow', 'hidden');
//   container.style.setProperty('pointer-events', 'none');
//   document.body.appendChild(container);

//   const batchSize = Math.min(intensity, 200);
//   let rafId: number;

//   const tick = () => {
//     if (signal.aborted) {
//       container.remove();
//       return;
//     }
//     try {
//       for (let i = 0; i < batchSize; i++) {
//         const div = document.createElement('div');
//         div.textContent = `stress-${Date.now()}-${i}`;
//         div.style.cssText = 'width:10px;height:10px;position:absolute;';
//         container.appendChild(div);
//       }
//       while (container.children.length > 1000) {
//         container.removeChild(container.firstChild!);
//       }
//       stats.domOps += batchSize;
//       if (stats.domOps % 500 === 0 && onProgress) {
//         onProgress('DOM stress running...', { ...stats });
//       }
//     } catch (e) {
//       stats.domErrors++;
//     }
//     rafId = requestAnimationFrame(tick);
//   };

//   rafId = requestAnimationFrame(tick);

//   return () => {
//     cancelAnimationFrame(rafId);
//     container.remove();
//   };
// }

// export function runStressTest(options: StressOptions): () => void {
//   if (activeController) {
//     activeController.abort();
//     activeController = null;
//   }

//   const opts = { ...defaultOptions, ...options };
//   const durationMs = opts.durationMs ?? 60_000;
//   const stats: StressStats = {
//     startTime: Date.now(),
//     dbOps: 0,
//     dbErrors: 0,
//     domOps: 0,
//     domErrors: 0,
//     running: true,
//   };

//   const controller = new AbortController();
//   activeController = controller;
//   const signal = controller.signal;

//   const timeoutId = window.setTimeout(() => {
//     controller.abort();
//   }, durationMs);

//   let stopDom: (() => void) | undefined;

//   if (opts.mode === 'dom' || opts.mode === 'both') {
//     stopDom = runDomStress(signal, stats, opts.domIntensity ?? 500, opts.onProgress);
//   }

//   const dbPromise =
//     opts.mode === 'db' || opts.mode === 'both'
//       ? runDbStress(signal, stats, opts.dbWorkers ?? 5, opts.onProgress)
//       : Promise.resolve();

//   dbPromise.finally(async () => {
//     window.clearTimeout(timeoutId);
//     stats.endTime = Date.now();
//     stats.running = false;
//     stopDom?.();
//     activeController = null;
//     // Clean up stress-test log entries (project_id starting with 'stress-project-')
//     try {
//       const keys = await db.logs.filter((l: any) => String(l.project_id || '').startsWith('stress-project-')).primaryKeys();
//       if (keys.length) await db.logs.bulkDelete(keys);
//     } catch {
//       // ignore cleanup errors
//     }
//     opts.onDone?.(stats);
//   });

//   return () => {
//     controller.abort();
//     window.clearTimeout(timeoutId);
//     stopDom?.();
//     activeController = null;
//   };
// }

// export function isStressTestRunning(): boolean {
//   return activeController != null;
// }
export {};
