export type ThemeColorScale = {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
};

export type ThemePalette = {
  white: string;
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  blue: ThemeColorScale;
  green: ThemeColorScale;
  red: ThemeColorScale;
};

export type ThemeSemanticColors = {
  primary: string;
  primaryHover: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  neutral: string;
  chartCall: string;
  chartPut: string;
  chartUnderlying: string;
};

export type ThemeResponse = {
  name: string;
  source: "manual";
  cached: false;
  updatedAt: string;
  palette: ThemePalette;
  semantic: ThemeSemanticColors;
};
