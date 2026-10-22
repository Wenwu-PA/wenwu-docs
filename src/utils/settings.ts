export const SETTINGS_KEY = 'wenwu-settings-v1';
export const SETTINGS_VERSION = 1;

export interface UserSettings {
  version: number;
  theme: 'light' | 'dark' | 'system';
  textSize: 'small' | 'normal' | 'large';
  codeSize: 12 | 14 | 16;
  wrapCode: boolean;
  lineNumbers: boolean;
  highlightTheme: 'light' | 'dark' | 'auto';
  historyLimit: 10 | 20 | 50;
  diaryUrl: string;
  diaryTemplate: string;
  zipFileName: string;
}

export const DEFAULT_SETTINGS: UserSettings = {
  version: SETTINGS_VERSION, theme: 'system', textSize: 'normal', codeSize: 14,
  wrapCode: false, lineNumbers: true, highlightTheme: 'auto', historyLimit: 20,
  diaryUrl: '',
  diaryTemplate: 'Работа: {title}\nПредмет: {topic}\nДата: {date}\nПуть: {path}\nGitHub: {githubUrl}\nСайт: {siteUrl}',
  zipFileName: '{title}.zip',
};

export function readSettings(storage: Pick<Storage, 'getItem'> | null = safeStorage()): UserSettings {
  if (!storage) return DEFAULT_SETTINGS;
  try {
    const value = JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null') as Partial<UserSettings> | null;
    if (!value || typeof value !== 'object') return DEFAULT_SETTINGS;
    return {
      ...DEFAULT_SETTINGS,
      ...value,
      version: SETTINGS_VERSION,
      historyLimit: [10, 20, 50].includes(Number(value.historyLimit)) ? Number(value.historyLimit) as UserSettings['historyLimit'] : 20,
      codeSize: [12, 14, 16].includes(Number(value.codeSize)) ? Number(value.codeSize) as UserSettings['codeSize'] : 14,
      theme: ['light', 'dark', 'system'].includes(String(value.theme)) ? value.theme! : 'system',
      textSize: ['small', 'normal', 'large'].includes(String(value.textSize)) ? value.textSize! : 'normal',
      highlightTheme: ['light', 'dark', 'auto'].includes(String(value.highlightTheme)) ? value.highlightTheme! : 'auto',
      wrapCode: Boolean(value.wrapCode), lineNumbers: value.lineNumbers !== false,
      diaryUrl: typeof value.diaryUrl === 'string' ? value.diaryUrl : '',
      diaryTemplate: typeof value.diaryTemplate === 'string' ? value.diaryTemplate : storage.getItem('wenwu-diary-template-v1') ?? DEFAULT_SETTINGS.diaryTemplate,
      zipFileName: typeof value.zipFileName === 'string' ? value.zipFileName : DEFAULT_SETTINGS.zipFileName,
    };
  } catch { return DEFAULT_SETTINGS; }
}

export function writeSettings(settings: UserSettings, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, version: SETTINGS_VERSION })); }
  catch { /* Preferences still apply for the current session when storage is unavailable. */ }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; }
  catch { return null; }
}
