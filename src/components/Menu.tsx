import React, { useEffect, useRef, useState } from 'react';
import {
  IonContent,
  IonIcon,
  IonImg,
  IonItem,
  IonLabel,
  IonList,
  IonMenu,
  IonMenuToggle,
  IonSelect,
  IonSelectOption,
} from '@ionic/react';

// import { useLocation } from 'react-router-dom';
import {
  barChartOutline,
  barbellOutline,
  bluetoothOutline,
  briefcaseOutline,
  calculatorOutline,
  carOutline,
  cogOutline,
  moonOutline,
  sunnyOutline,
  timerOutline,
  tvOutline,
  mailOutline,
  codeSlashOutline,
  hardwareChipOutline,
} from 'ionicons/icons';
import { MENUS, ModalMenus, ModalNames, ROUTES } from '../helper/constants';

import { useTranslation } from 'react-i18next';
import { Preferences } from '@capacitor/preferences';

import lightLogo from '../assets/images/logo-lightmode.webp';
import darkLogo from '../assets/images/logo-darkmode.webp';
import './Menu.css';
import { useHistory, useLocation } from 'react-router';
import useAppData from '../hooks/useAppData';
import { connectMenuIcon, monitorMenuIcon, projectsMenuIcon, prooftesMenuIcon, reportsMenuIcon, settingsMenuIcon, totalizerMenuIcon, weighingMenuIcon } from '../assets/icons';
import Swal from 'sweetalert2';
// import darkLogo from '../assets/images/logo-darkmode.webp';
import { db } from '../db';
//import { logEvent } from '../services/LogService';
import { Share } from "@capacitor/share";
//import Swal from "sweetalert2";
import { exportLast60MinutesLogsFile, logEvent } from "../services/LogService";

import { buildDiagnosticContext } from "../services/DiagnosticContext";
import { isDesktopPc } from '../helper/appPlatform';


interface AppPage {
  url: string;
  iosIcon: string;
  mdIcon: string;
  title: string;
  imgIcon: string;
  hidden?: boolean;
  desktopOnly?: boolean;
}

const appPages: AppPage[] = [
  {
    title: MENUS.Monitor,
    url: ROUTES.Monitor,
    iosIcon: timerOutline,
    mdIcon: timerOutline,
    imgIcon: monitorMenuIcon,
  },
  {
    title: MENUS.Projects,
    url: ROUTES.Projects,
    iosIcon: briefcaseOutline,
    mdIcon: briefcaseOutline,
    imgIcon: projectsMenuIcon,
  },
  {
    title: MENUS.Settings,
    url: ROUTES.Settings,
    iosIcon: cogOutline,
    mdIcon: cogOutline,
    imgIcon: settingsMenuIcon,
  },
  {
    title: MENUS.Reports,
    url: ROUTES.Reports,
    iosIcon: barChartOutline,
    mdIcon: barChartOutline,
    imgIcon: reportsMenuIcon,
  },
  {
    title: MENUS.ConnectDevice,
    url: ROUTES.ConnectDevice,
    iosIcon: bluetoothOutline,
    mdIcon: bluetoothOutline,
    imgIcon: connectMenuIcon,
  },
  {
    title: MENUS.CrrSettings,
    url: ROUTES.CrrSettings,
    iosIcon: hardwareChipOutline,
    mdIcon: hardwareChipOutline,
    imgIcon: settingsMenuIcon,
    desktopOnly: true,
  },
  {
    title: MENUS.SerialDebug,
    url: ROUTES.SerialDebug,
    iosIcon: codeSlashOutline,
    mdIcon: codeSlashOutline,
    imgIcon: connectMenuIcon,
    desktopOnly: true,
  },
  {
    title: MENUS.ProofTest,
    url: ROUTES.ProofTest,
    iosIcon: barbellOutline,
    mdIcon: barbellOutline,
    imgIcon: prooftesMenuIcon,
    hidden: true,
  },
  {
    title: MENUS.Totalizer,
    url: ROUTES.Totalizer,
    iosIcon: calculatorOutline,
    mdIcon: calculatorOutline,
    imgIcon: totalizerMenuIcon,
    hidden: true,
  },
  {
    title: MENUS.Document,
    url: ROUTES.Document,
    iosIcon: carOutline,
    mdIcon: carOutline,
    imgIcon: weighingMenuIcon,
    hidden: true,
  }
];

const Menu: React.FC = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const history = useHistory();
  const { curProject, lcs, groups, mode, updateVisibleModal, updateErrStr, updateMode } = useAppData()

  const [lang, setLang] = useState<string>('')
  const [themeToggle, setThemeToggle] = useState(false);
  const touchActionAtRef = useRef<Record<string, number>>({});
  const TOUCH_CLICK_SUPPRESS_MS = 700;

  const runFromTouchPointerUp = (key: string, ev: React.PointerEvent, action: () => void) => {
    if (ev.pointerType !== 'touch') return;
    touchActionAtRef.current[key] = Date.now();
    action();
  };
  const runFromClick = (key: string, action: () => void) => {
    const lastTouchAt = touchActionAtRef.current[key] || 0;
    if (Date.now() - lastTouchAt < TOUCH_CLICK_SUPPRESS_MS) return;
    action();
  };
  const closeMainMenu = async () => {
    const menuEl = document.querySelector('ion-menu') as HTMLIonMenuElement | null;
    if (!menuEl) return;
    try {
      await menuEl.close();
    } catch {
      // ignore close errors; navigation already happened
    }
  };

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

    const initThemeAndLang = async () => {
      const themeRes = await Preferences.get({ key: 'eilon.theme' });
      const isDark = themeRes?.value === 'dark' || themeRes?.value === 'light'
        ? themeRes.value === 'dark'
        : prefersDark.matches;
      updateMode(isDark ? 'dark' : 'light');
      setThemeToggle(isDark);
      toggleDarkTheme(isDark);

      const res = await Preferences.get({ key: 'eilon.lang' });
      let defaultLang = "en";
      if (res && res.value)
        defaultLang = res.value;
      setLang(defaultLang);
    }

    initThemeAndLang();
  }, [])

  // Add or remove the "dark" class on the document body; set color-scheme on html so Android respects app theme
  const toggleDarkTheme = (shouldAdd: boolean) => {
    document.body.classList.toggle('dark', shouldAdd);
    document.documentElement.style.colorScheme = shouldAdd ? 'dark' : 'light';
  };

  const handleChangeLang = async (langVal: string) => {
    i18n.changeLanguage(langVal);
    setLang(langVal);
    await Preferences.remove({ key: 'eilon.lang' });
    await Preferences.set({ key: 'eilon.lang', value: langVal })
  }

  const handleChangeMode = async () => {
    const newMode = mode === 'dark' ? 'light' : 'dark';
    updateMode(newMode);
    setThemeToggle(newMode === 'dark');
    toggleDarkTheme(newMode === 'dark');
    await Preferences.set({ key: 'eilon.theme', value: newMode });
  }

  const handleOpenMonitor = (): boolean => {
    if (curProject) {
      const current_grroups = groups.filter((group) => {
        return String(group.project_id) === String(curProject.id);
      })
      const filtredGroup = current_grroups.filter(({ overload }) => overload);
      const groupZero = filtredGroup.find(({ overload }) => parseFloat(overload) === 0)
      if (groupZero !== undefined) {
        Swal.fire({
          icon: 'error',
          title: `<h2 class="text-danger">${t('Common.Error')}</h2>`,
          html: `<p>${groupZero.title} Can't be 0</p>`,
          heightAuto: false,
          allowOutsideClick: false,
          allowEscapeKey: false
        });
        return false;
      }
      const setGroups = groups?.filter((group) => String(group.project_id) === String(curProject.id) && group.overload != '');
      const filtered = lcs.filter(item => item.total_sum)
      if (filtered.length > 0) {
        if (setGroups.length > 0) {
          history.push(ROUTES.Monitor)
          return true;
        } else {
          updateErrStr(t('You Must First set at Least One Group'))
          return false;
        }
      } else {
        updateErrStr(t('Msg.ErrInvalidMonitor'))
        return false;
      }
    } else {
      updateVisibleModal(ModalNames.NewProject)
      return true;
    }
    return false;
  }

/*
  const handleSendLogsToDeveloper = async () => {
    try {
      logEvent("INFO", "User tapped Send logs to the developer", {
      route: window.location.pathname,
    });

      const fileUri = await exportLast60MinutesLogsFile();

      await Share.share({
        title: "App logs - last 60 minutes",
        text: "Attached are the application logs from the last 60 minutes.",
        files: [fileUri],
        dialogTitle: "Send logs to the developer",
      });
    } catch (error) {
      await logEvent("ERROR", "Failed to share logs file", {
        error: String(error),
      });

      await Swal.fire({
        icon: "error",
        title: "Error",
        text: "Could not prepare the logs file.",
        heightAuto: false,
      });
    }
  };*/

  const handleSendLogsToDeveloper = async () => {
    try {
      await logEvent(
        "INFO",
        "User tapped Send logs to the developer",
        { route: window.location.pathname },
        "USER_ACTION"
      );

      const context = await buildDiagnosticContext();
      const fileUri = await exportLast60MinutesLogsFile(context);

      await Share.share({
        title: "App logs - last 60 minutes",
        text: "Attached are the application logs from the last 60 minutes.",
        files: [fileUri],
        dialogTitle: "Send logs to the developer",
      });
    } catch (error) {
      await logEvent(
        "ERROR",
        "Failed to share logs file",
        { error: String(error) },
        "SHARE"
      );

      await Swal.fire({
        icon: "error",
        title: "Error",
        text: "Could not prepare the logs file.",
        heightAuto: false,
      });
    }
  };

  // reference: handleOpenMonitor()
  const draw_realtime_report = (date: any, data: any) => {
    console.log('===draw_realtime_report===')
    data.map((row: any) => (
      <>
        <tr data-stats={(row.value >= row.overload) ? "overload" : (row.value <= row.underload) ? "unedrload" : "ok"}>
          <td>{row.lc_id}</td>
          <td>{(row.value >= row.overload) ? "overload" : (row.value <= row.underload) ? "unedrload" : ""}</td>
          <td className={(row.value > row.overload || row.value < row.underload) ? "bg-danger" : ""}>{row.value}</td>
          {/* <td>{moment.unix(row.log_date / 1000).format("YYYY-MM-DDTHH:mm")}</td> */}
        </tr >
      </>
    ))
    // $("#warning_log_table").append(log_e);
  }

  const get_peak = () => {
    console.log('===get_peak===')
    if (curProject === null) {
      return;
    }

    const myLogsStore = db.logs;
    const key = 'project_id';
    const value = curProject.id; // Replace this with the value you are looking fo
    try {
      myLogsStore.where(key).equals(value).reverse().first().then(function (data: any) {
        const peak = data || 0;
      })
    } catch (error) {
      logEvent('ERROR', 'Failure on DB', error);
      console.error('Error querying data from the table: ' + error);
    }
  }

  const ionIcon = true;

  

  return (
    <>
      {/* swipeGesture={false}: open side menu only from toolbar hamburger, not edge drag (iOS/Android). */}
      <IonMenu contentId="main" type="overlay" swipeGesture={false} className="main-side-menu">
        <IonContent className='main-content' >
          <IonList id="inbox-list" className='bg-transparent dark:bg-dark'>
            <IonImg src={themeToggle ? darkLogo : lightLogo} alt='logo' className='menu-logo'></IonImg>
            <div className='menu-top-row flex flex-row items-center justify-between mb-4 gap-3'>
              <div className="menu-language-wrap min-w-0 ion-select-language-wrapper">
                <IonSelect
                  value={lang}
                  className="ion-select-language"
                  interface="popover"
                  onIonChange={(e) => handleChangeLang(e.detail.value)}
                >
                  <IonSelectOption value="en">English</IonSelectOption>
                  <IonSelectOption value="jp">日本語</IonSelectOption>
                </IonSelect>
              </div>
              {/* { mode !== 'dark' ? */}
              {themeToggle ?
                <IonIcon src={moonOutline} color='dark' className='menu-theme-toggle text-xl cursor-pointer' onClick={() => handleChangeMode()} />
                :
                <IonIcon src={sunnyOutline} className='menu-theme-toggle text-xl cursor-pointer' onClick={() => handleChangeMode()} />
              }
            </div>
            {appPages.map((appPage, index) => {
              if (appPage.hidden) return null;
              if (appPage.desktopOnly && !isDesktopPc()) return null;
              if (appPage.title === '') return null;
              if (ModalMenus.includes(appPage.title)) {
                const isSelected = location.pathname === appPage.url;
                const itemColor = isSelected ? 'primary' : (themeToggle ? 'light' : 'dark');
                const textClass = themeToggle ? (isSelected ? '' : '!text-white') : (isSelected ? '' : '!text-black dark:!text-white');
                if (appPage.title === MENUS.Monitor) {
                  return (
                    <IonItem
                      key={index}
                      className={`menu-first-item-divider bg-white dark:bg-dark cursor-pointer ${textClass}`}
                      routerDirection="none"
                      lines="none"
                      detail={false}
                      onPointerUp={(e) => runFromTouchPointerUp(`menu:${appPage.title}`, e, () => {
                        e.preventDefault();
                        e.stopPropagation();
                        const shouldCloseMenu = handleOpenMonitor();
                        if (shouldCloseMenu) void closeMainMenu();
                      })}
                      onClick={() => runFromClick(`menu:${appPage.title}`, () => {
                        // Prevent the same tap gesture from immediately dismissing Swal on Android.
                        const evt = window.event;
                        evt?.preventDefault?.();
                        evt?.stopPropagation?.();
                        const shouldCloseMenu = handleOpenMonitor();
                        if (shouldCloseMenu) void closeMainMenu();
                      })}
                    >
                      {ionIcon ? <IonIcon color={itemColor} className={textClass} aria-hidden="true" slot="start" ios={appPage.iosIcon} md={appPage.mdIcon} />
                        : <IonImg src={appPage.imgIcon} alt='' className='w-10 mr-2' />}
                      <IonLabel color={itemColor} className={textClass}>{t(`Menu.${appPage.title}`)}</IonLabel>
                    </IonItem>
                  );
                } else
                  return (
                    <IonMenuToggle key={index} className='bg-white dark:bg-dark' autoHide={false}>
                      <IonItem
                        className={`${index === 0 ? 'menu-first-item-divider ' : ''}bg-white dark:bg-dark cursor-pointer ${textClass}`}
                        lines="none"
                        detail={false}
                        onPointerUp={(e) => runFromTouchPointerUp(`menu:${appPage.title}`, e, () => { updateVisibleModal(appPage.title); void closeMainMenu(); })}
                        onClick={() => runFromClick(`menu:${appPage.title}`, () => { updateVisibleModal(appPage.title); void closeMainMenu(); })}
                      >
                        {ionIcon ? <IonIcon color={itemColor} className={textClass} aria-hidden="true" slot="start" ios={appPage.iosIcon} md={appPage.mdIcon} />
                          : <IonImg src={appPage.imgIcon} alt='' className='w-10 mr-2' />}
                        <IonLabel color={itemColor} className={textClass}>{t(`Menu.${appPage.title}`)}</IonLabel>
                      </IonItem>
                    </IonMenuToggle>
                  )
              } else {
                const isSelected = location.pathname === appPage.url;
                const itemColor = isSelected ? 'primary' : (themeToggle ? 'light' : 'dark');
                const textClass = themeToggle ? (isSelected ? '' : '!text-white') : (isSelected ? '' : '!text-black dark:!text-white');
                return (
                  <IonMenuToggle key={index} autoHide={false}>
                    <IonItem
                      className={`${index === 0 ? 'menu-first-item-divider ' : ''}bg-white dark:bg-dark ${textClass}`}
                      routerDirection="none"
                      lines="none"
                      detail={false}
                      onPointerUp={(e) => runFromTouchPointerUp(`menu:${appPage.title}`, e, () => { history.push(appPage.url); void closeMainMenu(); })}
                      onClick={() => runFromClick(`menu:${appPage.title}`, () => { history.push(appPage.url); void closeMainMenu(); })}
                    >
                      {ionIcon ? <IonIcon color={itemColor} className={textClass} aria-hidden="true" slot="start" ios={appPage.iosIcon} md={appPage.mdIcon} />
                        : <IonImg src={appPage.imgIcon} alt='' className='w-10 mr-2' />}
                      <IonLabel color={itemColor} className={textClass}>{t(`Menu.${appPage.title}`)}</IonLabel>
                    </IonItem>
                  </IonMenuToggle>
                );
              }
            })
            /*
            <IonItem button onClick={() => exportAndSendLogs()} detail={false}>
            <IonIcon slot="start" icon={mailOutline} />
            <IonLabel>Send logs to the developer</IonLabel>
          </IonItem>


          <IonItem className='flex items-center gap-2 p-2 cursor-pointer' button onClick={handleSendLogs} detail={false}>
            <IonIcon slot="start" icon={mailOutline} />
            <IonLabel>Send logs to the developer</IonLabel>
          </IonItem>

          */
            
            
            }
          </IonList>

          <div className="menu-version">version-1.5.0</div>
        </IonContent>
      </IonMenu>
    </>
  );
};

export default Menu;
