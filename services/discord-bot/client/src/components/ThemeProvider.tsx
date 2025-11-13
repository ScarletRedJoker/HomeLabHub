/**
 * Theme Provider Component
 * 
 * Manages application-wide theme state (light, dark, or system preference).
 * Persists theme selection to localStorage and applies theme classes to the DOM.
 * 
 * Features:
 * - Three theme modes: light, dark, and system (follows OS preference)
 * - Automatic persistence to localStorage
 * - System theme detection using prefers-color-scheme media query
 * - Real-time theme switching without page reload
 * - Customizable storage key for multi-app scenarios
 * 
 * @module ThemeProvider
 */

import { createContext, useContext, useEffect, useState } from "react";

/**
 * Available theme options
 * @typedef {"light" | "dark" | "system"} Theme
 */
type Theme = "light" | "dark" | "system";

/**
 * Props for ThemeProvider component
 * 
 * @interface ThemeProviderProps
 * @property {React.ReactNode} children - Child components that will have access to theme context
 * @property {Theme} [defaultTheme] - Initial theme if none is stored (defaults to "system")
 * @property {string} [storageKey] - localStorage key for persisting theme (defaults to "discord-ticket-theme")
 */
type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

/**
 * Shape of the theme context
 * 
 * @interface ThemeProviderState
 * @property {Theme} theme - Current active theme
 * @property {Function} setTheme - Function to update the theme
 */
type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

// Default context state (will be overridden by provider)
const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

/**
 * ThemeProvider Component
 * 
 * Provides theme state and controls to all child components.
 * Initializes theme from localStorage or uses default, and syncs changes to localStorage.
 * 
 * @param {ThemeProviderProps} props - Component props
 * @returns {JSX.Element} Provider component wrapping children
 */
export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "discord-ticket-theme",
  ...props
}: ThemeProviderProps) {
  /**
   * Initialize theme state from localStorage or use default
   * This runs only once on mount, ensuring theme persistence across sessions
   */
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );

  /**
   * Apply theme to DOM whenever it changes
   * 
   * Why this approach:
   * 1. Remove all theme classes first to prevent conflicts
   * 2. For "system" theme, detect OS preference using matchMedia API
   * 3. Add appropriate class to documentElement for CSS cascade
   */
  useEffect(() => {
    const root = window.document.documentElement;
    
    // Clear existing theme classes to prevent conflicts
    root.classList.remove("light", "dark");
    
    if (theme === "system") {
      // Use OS-level color scheme preference
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
      
      root.classList.add(systemTheme);
      return;
    }
    
    // Apply user-selected theme directly
    root.classList.add(theme);
  }, [theme]);

  /**
   * Theme context value
   * Wraps setTheme to persist changes to localStorage before updating state
   */
  const value = {
    theme,
    setTheme: (theme: Theme) => {
      // Persist theme preference to localStorage for next session
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

/**
 * Hook to access theme context
 * 
 * Provides access to current theme and setTheme function.
 * Must be used within a ThemeProvider component tree.
 * 
 * @returns {ThemeProviderState} Theme context with current theme and setter
 * @throws {Error} If used outside of ThemeProvider
 * 
 * @example
 * function ThemeToggle() {
 *   const { theme, setTheme } = useTheme();
 *   
 *   return (
 *     <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
 *       Toggle Theme
 *     </button>
 *   );
 * }
 */
export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  
  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");
  
  return context;
};