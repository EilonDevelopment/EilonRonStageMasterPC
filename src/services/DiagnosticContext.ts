import { Device } from "@capacitor/device";
import { App } from "@capacitor/app";
import { Preferences } from "@capacitor/preferences";

export async function buildDiagnosticContext() {
  let appInfo: any = {};
  let deviceInfo: any = {};
  let deviceId: any = {};
  let lang = "";
  let companyCode = "";
  let username = "";

  try {
    appInfo = await App.getInfo();
  } catch {}

  try {
    deviceInfo = await Device.getInfo();
  } catch {}

  try {
    deviceId = await Device.getId();
  } catch {}

  try {
    const langResult = await Preferences.get({ key: "eilon.lang" });
    lang = langResult.value ?? "";
  } catch {}

  try {
    const companyCodeResult = await Preferences.get({ key: "companyCode" });
    companyCode = companyCodeResult.value ?? "";
  } catch {}

  try {
    const usernameResult = await Preferences.get({ key: "username" });
    username = usernameResult.value ?? "";
  } catch {}

  return {
    appName: appInfo.name ?? "",
    appId: appInfo.id ?? "",
    appVersion: appInfo.version ?? "",
    appBuild: appInfo.build ?? "",
    platform: deviceInfo.platform ?? "",
    osName: deviceInfo.operatingSystem ?? "",
    osVersion: deviceInfo.osVersion ?? "",
    manufacturer: deviceInfo.manufacturer ?? "",
    model: deviceInfo.model ?? "",
    isVirtual: String(deviceInfo.isVirtual ?? ""),
    deviceId: deviceId.identifier ?? "",
    language: lang,
    companyCode,
    username,
    currentRoute: window.location.pathname,
    userAgent: navigator.userAgent,
  };
}