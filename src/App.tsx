import React, { useEffect, useRef } from "react";
import { IonApp, IonRouterOutlet, setupIonicReact } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { Redirect, Route } from "react-router-dom";
import Menu from "./components/Menu";
import { ToastContainer } from "react-toastify";

import "@ionic/react/css/core.css";
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";
import "@ionic/react/css/padding.css";
import "@ionic/react/css/float-elements.css";
import "@ionic/react/css/text-alignment.css";
import "@ionic/react/css/text-transformation.css";
import "@ionic/react/css/flex-utils.css";
import "@ionic/react/css/display.css";

import { ROUTES, SERIAL_DEBUG_UI_ENABLED } from "./helper/constants";
import Empty from "./pages/Empty";
import "./i18n";
import "./theme/variables.css";

import { Preferences } from "@capacitor/preferences";
import { useTranslation } from "react-i18next";
import Login from "./pages/Auth/Login";
import Verify from "./pages/Auth/Verify";
import Settings from "./pages/Settings";
import Monitor from "./pages/Monitor";
import Report from "./pages/Reports";
import SerialDebug from "./pages/SerialDebug";
import CrrSettings from "./pages/CrrSettings";
import { db, dbReady } from "./db";
import { ensureCrrUsbPipeline } from "./helper/crrUsbPipeline";
import { installCrrUsbDebugConsole } from "./helper/crrUsbRuntime";
import { isDesktopPc } from "./helper/appPlatform";
import { App as Application } from "@capacitor/app";
import Swal from "sweetalert2";
import { t } from "i18next";
import Chart from "chart.js/auto";
import { CategoryScale } from "chart.js";
import { logEvent } from "./services/LogService";
import { initAlarmAudioPriming, initSafetyAlarmNotifications, resumeAlarmAudioIfPossible } from "./services/alarmFeedback";

Chart.register(CategoryScale);

// Disable iOS edge swipe-back on IonRouterOutlet: users confused it with “open menu” and landed on
// the previous route (e.g. Settings). Menu opens only via IonMenuButton; see Menu.tsx swipeGesture.
setupIonicReact({ swipeBackEnabled: false });
void logEvent("INFO", "Application started", {
  route: window.location.pathname,
}, "APP");

const App: React.FC = () => {
  const { i18n } = useTranslation();
  const resumeDebounceUntilRef = useRef<number>(0);
  const nativeDialogRecoveryBlockUntilRef = useRef<number>(0);

  useEffect(() => {
    initAlarmAudioPriming();
    void initSafetyAlarmNotifications();
  }, []);

  useEffect(() => {
    let resumeAlertHandle: any;
    let pauseHandle: any;

    const setupAppListeners = async () => {
      resumeAlertHandle = await Application.addListener("resume", () => {
        const now = Date.now();
        if (now < resumeDebounceUntilRef.current) return;
        resumeDebounceUntilRef.current = now + 700;

        logEvent("INFO", "App resumed (Foreground)", {
        route: window.location.pathname,
      }, "APP");

        void resumeAlarmAudioIfPossible();

        // Native share/email flows set this flag so we skip resume alerts, but we must still run
        // WebView recovery logic below (reflow/resize/optional reload) to avoid black background.
        if (
          typeof sessionStorage !== "undefined" &&
          sessionStorage.getItem("skipResumeAlert") === "1"
        ) {
          sessionStorage.removeItem("skipResumeAlert");
          // Native share/email picker returned. In heavy exports this can emit
          // additional resume events while the webview is still settling.
          // Temporarily skip recovery/reload heuristics to avoid route/state races.
          nativeDialogRecoveryBlockUntilRef.current = Date.now() + 8000;
          return;
        }

        if (now < nativeDialogRecoveryBlockUntilRef.current) return;

        // Android WebView can come back with a "white screen" after the renderer was killed
        // (e.g., isolated sandboxed_process removed). Force a redraw; if the DOM looks missing,
        // do a safe reload to recover.
        try {
          requestAnimationFrame(() => {
            setTimeout(() => {
              try {
                void document.body.offsetHeight;
                window.dispatchEvent(new Event("resize"));
                window.dispatchEvent(new Event("orientationchange"));
              } catch (_e) {
                // ignore
              }

              try {
                const main = document.getElementById("main");
                const hasContent = !!(main && main.innerHTML && main.innerHTML.length > 50);
                if (!hasContent) {
                  logEvent("WARN", "Possible white screen detected; reloading WebView", {
                    route: window.location.pathname,
                  }, "APP");
                  window.location.reload();
                }
              } catch (_e) {
                // ignore
              }
            }, 300);
          });
        } catch (_e) {
          // ignore
        }

        /*
        Swal.fire({
          icon: "warning",
          title: `<i class="text-danger">${t("Common.BeforeAlert")}</i>`,
          html: `<ol type="1" class="list-decimal">
                    <li>${t("Common.Alert1")}</li>
                    <li>${t("Common.Alert2")}</li>
                    <li>${t("Common.Alert3")}</li>
                    <li>${t("Common.Alert4")}</li>
                    <li>${t("Common.Alert5")}</li>
                    <li>${t("Common.Alert6")}</li>
                    <li>${t("Common.Alert7")}</li>
                    <li>${t("Common.Alert8")}</li>
                  </ol>`,
          heightAuto: false,
          backdrop: true,
          customClass: {
            container: "alert-container w-30",
            title: "alert-title",
          },
        });
        */
      });

      pauseHandle = await Application.addListener("pause", () => {
      logEvent("INFO", "App paused (Background)", {
        route: window.location.pathname,
      }, "APP");
    });
    };

    window.onerror = (msg, url, line, col, error) => {
      logEvent("ERROR", `Crash: ${String(msg)}`, {
        url,
        line,
        col,
        stack: error?.stack,
        route: window.location.pathname,
      }, "JS");
      return false;
    };

    window.onunhandledrejection = (event) => {
      logEvent("ERROR", `Promise Reject: ${String(event.reason)}`, {
      route: window.location.pathname,
    }, "JS");
    };

    void setupAppListeners();

    return () => {
      resumeAlertHandle?.remove?.();
      pauseHandle?.remove?.();
      window.onerror = null;
      window.onunhandledrejection = null;
    };
  }, []);

  useEffect(() => {
    const initLang = async () => {
      const res = await Preferences.get({ key: "eilon.lang" });
      if (res?.value) {
        await i18n.changeLanguage(res.value);
      }
    };

    const dbConnect = async () => {
      try {
        await dbReady;
      } catch (error) {
        console.error("Error opening database:", error);
      }

      try {
        await db.logs_proofftest.clear();
      } catch (error) {
        console.error("Error clearing table:", error);
      }
    };

    void initLang();
    void dbConnect();
    if (isDesktopPc()) {
      installCrrUsbDebugConsole();
      ensureCrrUsbPipeline();
    }
  }, [i18n]);

  return (
    <IonApp>
      <IonReactRouter>

          <Menu />
          <IonRouterOutlet id="main">
            <Route path="/" exact={true}>
              <Redirect to={ROUTES.Monitor} />
            </Route>
            <Route path={ROUTES.Login} exact={true} render={() => <Login />} />
            <Route path={ROUTES.Verify} exact={true} render={() => <Verify />} />
            <Route path={ROUTES.Monitor} exact={true} render={() => <Monitor />} />
            <Route path={ROUTES.Settings} exact={true} render={() => <Settings />} />
            <Route path={ROUTES.Reports} exact={true} render={() => <Report />} />
            <Route
              path={ROUTES.SerialDebug}
              exact={true}
              render={() => (SERIAL_DEBUG_UI_ENABLED ? <SerialDebug /> : <Redirect to={ROUTES.Monitor} />)}
            />
            <Route path={ROUTES.CrrSettings} exact={true} render={() => <CrrSettings />} />
            <Route path={ROUTES.ConnectDevice} exact={true} render={() => <Empty />} />
            <Route path={ROUTES.Totalizer} exact={true} render={() => <Empty />} />
            <Route path={ROUTES.Document} exact={true} render={() => <Empty />} />
          </IonRouterOutlet>

      </IonReactRouter>

      <ToastContainer
        position="top-right"
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss={false}
        draggable
        pauseOnHover={false}
        toastStyle={{
          width: "auto",
          fontSize: "150%",
        }}
      />
    </IonApp>
  );
};

export default App;





/*

import React, { useEffect } from 'react';
import { IonApp, IonRouterOutlet, IonSplitPane, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Redirect, Route } from 'react-router-dom';
import Menu from './components/Menu';
import { ToastContainer } from 'react-toastify';


import '@ionic/react/css/core.css';


import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';


import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';
// import { addRxPlugin, createRxDatabase  } from 'rxdb';
// import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
// import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';



import { ROUTES } from './helper/constants';
import Empty from './pages/Empty';
import "./i18n";

import './theme/variables.css';
import { Preferences } from '@capacitor/preferences';
import { useTranslation } from 'react-i18next';
import Login from './pages/Auth/Login';
import Verify from './pages/Auth/Verify';
import Settings from './pages/Settings';
import Monitor from './pages/Monitor';
import Report from './pages/Reports';
// import StressTest from './pages/StressTest';
import { db } from './db';
import { App as Application } from '@capacitor/app';
import Swal from 'sweetalert2';
import { t } from 'i18next';
import Chart from 'chart.js/auto';
import { CategoryScale } from 'chart.js';
import { logEvent } from './services/LogService';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
Chart.register(CategoryScale);

setupIonicReact();


const App: React.FC = () => {

  
  const { i18n } = useTranslation();
  Application.addListener('resume', () => {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('skipResumeAlert') === '1') {
      sessionStorage.removeItem('skipResumeAlert');
      return;
    }

useEffect(() => {
  let resumeAlertHandle: any;
  let pauseHandle: any;
  let resumeLogHandle: any;

  const setup = async () => {
    resumeAlertHandle = await Application.addListener("resume", () => {
      if (
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem("skipResumeAlert") === "1"
      ) {
        sessionStorage.removeItem("skipResumeAlert");
        return;
      }

      Swal.fire({
        icon: "warning",
        title: `<i class="text-danger">${t("Common.BeforeAlert")}</i>`,
        html: `<ol type="1" class="list-decimal">
                  <li>${t("Common.Alert1")}</li>
                  <li>${t("Common.Alert2")}</li>
                  <li>${t("Common.Alert3")}</li>
                  <li>${t("Common.Alert4")}</li>
                  <li>${t("Common.Alert5")}</li>
                  <li>${t("Common.Alert6")}</li>
                  <li>${t("Common.Alert7")}</li>
                  <li>${t("Common.Alert8")}</li>
                </ol>`,
        heightAuto: false,
        backdrop: true,
        customClass: {
          container: "alert-container w-30",
          title: "alert-title",
        },
      });
    });

    pauseHandle = await Application.addListener("pause", () => {
      logEvent("INFO", "App paused (Background)");
    });

    resumeLogHandle = await Application.addListener("resume", () => {
      logEvent("INFO", "App resumed (Foreground)");
    });
  };

  window.onerror = (msg, url, line, col, error) => {
    logEvent("ERROR", `Crash: ${String(msg)}`, {
      url,
      line,
      col,
      stack: error?.stack,
    });
  };

  window.onunhandledrejection = (event) => {
    logEvent("ERROR", `Promise Reject: ${String(event.reason)}`);
  };

  void setup();

  return () => {
    resumeAlertHandle?.remove?.();
    pauseHandle?.remove?.();
    resumeLogHandle?.remove?.();
    window.onerror = null;
    window.onunhandledrejection = null;
  };
}, []);


  })
  useEffect(() => {
    const initLang = async () => {
      console.log('Ejecutando initLang');
      const res = await Preferences.get({ key: 'eilon.lang' });
      if (res && res.value)
        i18n.changeLanguage(res.value);
    }

    const dbConnect = () => {
      console.log('Ejecutando dbConnect');
      db.open().catch(function (error) {
        console.error('Error opening database: ' + error);
      });

      db.logs_proofftest.clear().then(function () {
        console.log('Table logs_proofftest emptied successfully');
      }).catch(function (error: any) {
        console.error('Error clearing table: ' + error);
      });
    }
    console.log('Moshe is here');

    initLang();
    dbConnect();
  }, [])


  // Dentro del componente App en src/App.tsx
useEffect(() => {
  // 1. Errores de JavaScript (Crash de código)
  window.onerror = (msg, url, line, col, error) => {
    logEvent('ERROR', `Crash: ${msg}`, { line, col, stack: error?.stack });
  };

  // 2. Errores en Promesas (Async/Await fallidos)
  window.onunhandledrejection = (event) => {
    logEvent('ERROR', `Promise Reject: ${event.reason}`);
  };

  // 3. Registro de ciclo de vida (Saber si el crash fue al minimizar)
  Application.addListener('pause', () => logEvent('INFO', 'App paused (Background)'));
  Application.addListener('resume', () => logEvent('INFO', 'App resumed (Foreground)'));

}, [])

  return (
    <IonApp>
      <IonReactRouter>
        <IonSplitPane contentId="main">
          <Menu />
          <IonRouterOutlet id="main">
            <Route path="/" exact={true}>
              <Redirect to={ROUTES.Monitor} />
            </Route>
            <Route path={ROUTES.Login} exact={true} render={() => <Login />} />
            <Route path={ROUTES.Verify} exact={true} render={() => <Verify />} />

            <Route key={ROUTES.Monitor} path={ROUTES.Monitor} exact={true} render={() => <Monitor />} />
            <Route key={ROUTES.Settings} path={ROUTES.Settings} exact={true} render={() => <Settings />} />
            <Route key={ROUTES.Reports} path={ROUTES.Reports} exact={true} render={() => <Report />} />
            <Route path={ROUTES.ConnectDevice} exact={true} render={() => <Empty />} />
            <Route path={ROUTES.Totalizer} exact={true} render={() => <Empty />} />
            <Route path={ROUTES.Document} exact={true} render={() => <Empty />} />
        
          </IonRouterOutlet>
        </IonSplitPane>
      </IonReactRouter>
      <ToastContainer
        position="top-right"
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        toastStyle={{
          width: 'auto',
          fontSize: '150%'
        }}

      />
    </IonApp>
  );
};

export default App;

*/
