export const theme = {
  dark: {
    background: "#121212",
    surface: "#1E1E1E",
    primary: "#BB86FC",
    text: "#FFFFFF",
    error: "#CF6679",
    overlay: "rgba(0,0,0,0.9)",
    success: "#4CAF50",
    pending: "#FFA726",
  },
  light: {
    background: "#FFFFFF",
    surface: "#F5F5F5",
    primary: "#6200EE",
    text: "#000000",
    error: "#B00020",
    overlay: "rgba(255,255,255,0.9)",
    success: "#2E7D32",
    pending: "#F57C00",
  },
};

export type ThemeMode = "light" | "dark";
export type ThemeColors = typeof theme.light | typeof theme.dark;
