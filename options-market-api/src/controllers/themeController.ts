import type { Request, Response } from "express";
import type { ThemeResponse } from "../types/theme";

const terminalTheme = {
  name: "options-terminal-light",
  source: "manual",
  cached: false,
  palette: {
    white: "#FFFFFF",
    background: "#F8FAFC",
    surface: "#FFFFFF",
    surfaceMuted: "#EFF6FF",
    border: "#D7E3F4",
    text: "#0F172A",
    textMuted: "#475569",
    blue: {
      50: "#EFF6FF",
      100: "#DBEAFE",
      200: "#BFDBFE",
      300: "#93C5FD",
      400: "#60A5FA",
      500: "#2563EB",
      600: "#1D4ED8",
      700: "#1E40AF",
      800: "#1E3A8A",
      900: "#172554",
    },
    green: {
      50: "#ECFDF5",
      100: "#D1FAE5",
      200: "#A7F3D0",
      300: "#6EE7B7",
      400: "#34D399",
      500: "#10B981",
      600: "#059669",
      700: "#047857",
      800: "#065F46",
      900: "#064E3B",
    },
    red: {
      50: "#FEF2F2",
      100: "#FEE2E2",
      200: "#FECACA",
      300: "#FCA5A5",
      400: "#F87171",
      500: "#EF4444",
      600: "#DC2626",
      700: "#B91C1C",
      800: "#991B1B",
      900: "#7F1D1D",
    },
  },
  semantic: {
    primary: "#2563EB",
    primaryHover: "#1D4ED8",
    success: "#059669",
    successSoft: "#D1FAE5",
    danger: "#DC2626",
    dangerSoft: "#FEE2E2",
    neutral: "#475569",
    chartCall: "#059669",
    chartPut: "#DC2626",
    chartUnderlying: "#2563EB",
  },
} as const;

export function getThemeController(_req: Request, res: Response) {
  const response: ThemeResponse = {
    ...terminalTheme,
    updatedAt: new Date().toISOString(),
  };

  return res.json(response);
}
