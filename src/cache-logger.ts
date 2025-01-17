/**
 * Logger interface, allows custom logging
 */
export interface Logger {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log: (...args: any[]) => void;
}

/**
 * Default console logger
 */
export class ConsoleLogger implements Logger {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log(...args: any[]): void {
    const timestamp = new Date().toISOString();
    // eslint-disable-next-line no-console
    console.log(`[${timestamp}]`, ...args);
  }
}
