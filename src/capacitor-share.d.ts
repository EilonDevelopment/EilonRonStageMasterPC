declare module '@capacitor/share' {
  export interface ShareOptions {
    title?: string;
    text?: string;
    url?: string;
    files?: string[];
    dialogTitle?: string;
  }
  export interface ShareResult {
    activityType?: string;
  }
  export const Share: {
    share(options: ShareOptions): Promise<ShareResult>;
    canShare?(): Promise<{ value: boolean }>;
  };
}
