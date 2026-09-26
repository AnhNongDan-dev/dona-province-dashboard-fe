export const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
} as const;

type LogLevel = keyof typeof LEVELS;

const currentLevel = import.meta.env.PROD ? LEVELS.info : LEVELS.debug;
export const logger = {
  log: (level: LogLevel, ...msg: unknown[]) => {
    if (LEVELS[level] <= currentLevel) {
      const styles: Record<LogLevel, string> = {
        error:
          "color: #F44336; font-weight: bold; background: #FFEBEE; padding: 2px 4px; border-radius: 3px",
        warn: "color: #FF9800; font-weight: bold; background: #FFF3E0; padding: 2px 4px; border-radius: 3px",
        verbose:
          "color: #9E9E9E; font-weight: bold; background: #F5F5F5; padding: 2px 4px; border-radius: 3px",
        info: "color: #4CAF50; font-weight: bold; background: #E8F5E9; padding: 2px 4px; border-radius: 3px",
        http: "color: #2196F3; font-weight: bold; background: #E3F2FD; padding: 2px 4px; border-radius: 3px",
        debug:
          "color: #607D8B; font-weight: bold; background: #ECEFF1; padding: 2px 4px; border-radius: 3px",
      };

      let logFunc = console.log;
      if (level === "error") logFunc = console.error;
      else if (level === "warn") logFunc = console.warn;
      else if (level === "debug") logFunc = console.debug;
      logFunc(`%c${level.toUpperCase()}:`, styles[level], ...msg);
    }
  },

  error: (...msg: unknown[]) => logger.log("error", ...msg),
  warn: (...msg: unknown[]) => logger.log("warn", ...msg),
  info: (...msg: unknown[]) => logger.log("info", ...msg),
  http: (...msg: unknown[]) => logger.log("http", ...msg),
  verbose: (...msg: unknown[]) => logger.log("verbose", ...msg),
  debug: (...msg: unknown[]) => logger.log("debug", ...msg),
};
