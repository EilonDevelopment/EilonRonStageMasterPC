
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";


const NATIVE_MARKERS_FILE = "native_crash_markers.txt";

export interface LogEntry {
  ts: number;
  level: LogLevel;
  category?: string;
  message: string;
  extra?: any;
}

const LOG_STORE_FILE = "app_runtime_logs.json";

function safeStringify(value: any): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

async function readNativeCrashMarkers(): Promise<string> {
  try {
    const result = await Filesystem.readFile({
      path: NATIVE_MARKERS_FILE,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });

    return typeof result.data === "string" ? result.data : "";
  } catch {
    return "";
  }
}

async function readLogs(): Promise<LogEntry[]> {
  try {
    const result = await Filesystem.readFile({
      path: LOG_STORE_FILE,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });

    const text = typeof result.data === "string" ? result.data : "";
    if (!text.trim()) {
      return [];
    }

    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLogs(entries: LogEntry[]): Promise<void> {
  await Filesystem.writeFile({
    path: LOG_STORE_FILE,
    data: JSON.stringify(entries),
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

export async function logEvent(
  level: LogLevel,
  message: string,
  extra?: any,
  category = "GENERAL"
): Promise<void> {
  try {
    const now = Date.now();
    const cutoff = now - 60 * 60 * 1000;

    const entries = await readLogs();
    const filtered = entries.filter((entry) => entry.ts >= cutoff);

    filtered.push({
      ts: now,
      level,
      category,
      message,
      extra,
    });

    await writeLogs(filtered);
  } catch {
    // nunca romper la app por logging
  }
}

export async function clearLogs(): Promise<void> {
  try {
    await writeLogs([]);
  } catch {
    //
  }
}


export async function exportLast60MinutesLogsFile(
  reportHeader?: Record<string, any>
): Promise<string> {
  const now = Date.now();
  const cutoff = now - 60 * 60 * 1000;

  //await trimNativeCrashMarkers(30);

  const entries = await readLogs();
  const filtered = entries.filter((entry) => entry.ts >= cutoff);
  const nativeMarkers = await readNativeCrashMarkers();

  const headerLines: string[] = [];
  headerLines.push("==== Eilon App Diagnostic Report ====");
  headerLines.push(`Generated: ${new Date(now).toISOString()}`);
  headerLines.push("Window: last 60 minutes");
  headerLines.push("");

  if (reportHeader) {
    headerLines.push("==== Context ====");
    for (const [key, value] of Object.entries(reportHeader)) {
      headerLines.push(
        `${key}: ${typeof value === "string" ? value : safeStringify(value)}`
      );
    }
    headerLines.push("");
  }

  headerLines.push("==== JS / APP LOGS ====");

  const logLines = filtered.map((entry) => {
    const iso = new Date(entry.ts).toISOString();
    const category = entry.category ? `[${entry.category}]` : "";
    const extraText =
      entry.extra !== undefined ? ` | extra=${safeStringify(entry.extra)}` : "";
    return `${iso} [${entry.level}] ${category} ${entry.message}${extraText}`;
  });

  const nativeLines: string[] = [];
  nativeLines.push("");
  nativeLines.push("==== NATIVE WEBVIEW EVENTS ====");
  nativeLines.push(nativeMarkers.trim() ? nativeMarkers : "No native crash markers found.");

  const fileName = `logs_last_60_minutes_${now}.txt`;

  await Filesystem.writeFile({
    path: fileName,
    data: [...headerLines, ...logLines, ...nativeLines].join("\n"),
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });

  const result = await Filesystem.getUri({
    path: fileName,
    directory: Directory.Cache,
  });

  return result.uri;
}


export async function clearNativeCrashMarkers(): Promise<void> {
  try {
    await Filesystem.writeFile({
      path: NATIVE_MARKERS_FILE,
      data: "",
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true,
    });
  } catch {
    //
  }
}

export async function trimNativeCrashMarkers(maxBlocks = 30): Promise<void> {
  try {
    const result = await Filesystem.readFile({
      path: NATIVE_MARKERS_FILE,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });

    const text = typeof result.data === "string" ? result.data : "";
    if (!text.trim()) return;

    const blocks = text
      .split("------------------------------")
      .map((x) => x.trim())
      .filter(Boolean);

    const trimmed = blocks.slice(-maxBlocks);

    const rebuilt =
      trimmed.map((b) => `${b}\n------------------------------`).join("\n") + "\n";

    await Filesystem.writeFile({
      path: NATIVE_MARKERS_FILE,
      data: rebuilt,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true,
    });
  } catch {
    //
  }
}

/*export async function exportLast60MinutesLogsFile(
  reportHeader?: Record<string, any>
): Promise<string> {
  const now = Date.now();
  const cutoff = now - 60 * 60 * 1000;

  const entries = await readLogs();
  const filtered = entries.filter((entry) => entry.ts >= cutoff);

  const headerLines: string[] = [];
  headerLines.push("==== Eilon App Diagnostic Report ====");
  headerLines.push(`Generated: ${new Date(now).toISOString()}`);
  headerLines.push(`Window: last 60 minutes`);
  headerLines.push("");

  if (reportHeader) {
    headerLines.push("==== Context ====");
    for (const [key, value] of Object.entries(reportHeader)) {
      headerLines.push(`${key}: ${typeof value === "string" ? value : safeStringify(value)}`);
    }
    headerLines.push("");
  }

  headerLines.push("==== Logs ====");

  const logLines = filtered.map((entry) => {
    const iso = new Date(entry.ts).toISOString();
    const category = entry.category ? `[${entry.category}]` : "";
    const extraText =
      entry.extra !== undefined ? ` | extra=${safeStringify(entry.extra)}` : "";
    return `${iso} [${entry.level}] ${category} ${entry.message}${extraText}`;
  });

  const fileName = `logs_last_60_minutes_${now}.txt`;

  await Filesystem.writeFile({
    path: fileName,
    data: [...headerLines, ...logLines].join("\n"),
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });

  const result = await Filesystem.getUri({
    path: fileName,
    directory: Directory.Cache,
  });

  return result.uri;
}*/





/*import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

interface LogEntry {
  ts: number;
  level: LogLevel;
  message: string;
  extra?: any;
}

const LOG_STORE_FILE = "app_runtime_logs.json";

function safeStringify(value: any): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

async function readLogs(): Promise<LogEntry[]> {
  try {
    const result = await Filesystem.readFile({
      path: LOG_STORE_FILE,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });

    const text = typeof result.data === "string" ? result.data : "";
    if (!text.trim()) {
      return [];
    }

    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLogs(entries: LogEntry[]): Promise<void> {
  await Filesystem.writeFile({
    path: LOG_STORE_FILE,
    data: JSON.stringify(entries),
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

export async function logEvent(
  level: LogLevel,
  message: string,
  extra?: any
): Promise<void> {
  try {
    const now = Date.now();
    const cutoff = now - 60 * 60 * 1000;

    const entries = await readLogs();
    const filtered = entries.filter((entry) => entry.ts >= cutoff);

    filtered.push({
      ts: now,
      level,
      message,
      extra,
    });

    await writeLogs(filtered);
  } catch {
    // evitar romper la app por un fallo de logging
  }
}

export async function exportLast60MinutesLogsFile(): Promise<string> {
  const now = Date.now();
  const cutoff = now - 60 * 60 * 1000;

  const entries = await readLogs();
  const filtered = entries.filter((entry) => entry.ts >= cutoff);

  const lines = filtered.map((entry) => {
    const date = new Date(entry.ts).toISOString();
    const extraText =
      entry.extra !== undefined ? ` | extra=${safeStringify(entry.extra)}` : "";
    return `${date} [${entry.level}] ${entry.message}${extraText}`;
  });

  const fileName = `logs_last_60_minutes_${now}.txt`;

  await Filesystem.writeFile({
    path: fileName,
    data: lines.join("\n"),
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });

  const result = await Filesystem.getUri({
    path: fileName,
    directory: Directory.Cache,
  });

  return result.uri;
}

export async function clearLogs(): Promise<void> {
  try {
    await writeLogs([]);
  } catch {
    // ignore
  }
}
*/


/*import { db } from '../db';
import { Share } from '@capacitor/share';
import { Device } from '@capacitor/device';
import { Directory, Filesystem } from '@capacitor/filesystem';

export const logEvent = async (type: 'INFO' | 'ERROR' | 'BLE', message: string, data?: any) => {
  const now = Date.now();
  const limit = now - (10 * 60 * 1000); // 10 minutos

  try {
    await db.crash_logs.add({
      timestamp: now,
      time: new Date(now).toLocaleTimeString(),
      type,
      message,
      data: data ? JSON.stringify(data) : null
    });

    // Limpieza automática circular
    await db.crash_logs.where('timestamp').below(limit).delete();
  } catch (e) {  }
};

export const handleSendLogs = async () => {
    try {
      // 1. Obtenemos la ruta (URI) del archivo que estamos guardando
      // Usamos Directory.Documents que es donde configuramos el guardado previo
      const fileUri = await Filesystem.getUri({
        path: 'app_logs.txt',
        directory: Directory.Documents
      });

      // 2. Usamos el plugin de Share para abrir el menú de Android
      await Share.share({
        title: 'RSM App Logs',
        text: 'Adjunto envío los logs de ejecución de la aplicación RSM.',
        url: fileUri.uri, // Compartimos el archivo físico
        dialogTitle: 'Enviar logs al desarrollador'
      });

    } catch (err) {
      console.error('Error al compartir logs:', err);
      updateErrStr('No se encontró el archivo de logs o el dispositivo no permite compartir.');
    }
  };

export const exportAndSendLogs = async () => {
  const logs = await db.crash_logs.orderBy('timestamp').toArray();
  const info = await Device.getInfo();
  
  const body = `
    DEVICE: ${info.model} (${info.platform} v${info.osVersion})
    LOGS (Last 2 min):
    ${logs.map(l => `[${l.time}] ${l.type}: ${l.message} ${l.data || ''}`).join('\n')}
  `;

  await Share.share({
    title: 'Crash Report - RSM',
    text: body,
    dialogTitle: 'Send report to the developer'
  });
};

function updateErrStr(arg0: string) {
    throw new Error('Function not implemented.');
}
*/
