import { app } from "electron";

const appVersion = app.getVersion();

export const IS_APP_GT_16 = appVersion > "16.0.0";