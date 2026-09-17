import { webDarkTheme, webLightTheme, type Theme } from '@fluentui/react-components';

export function themeForPreference(dark: boolean): Theme {
  return dark ? webDarkTheme : webLightTheme;
}

export const farmLightTheme = webLightTheme;
export const farmDarkTheme = webDarkTheme;
