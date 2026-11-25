/**
 * Structured logger with a pino-compatible call shape:
 *   log.info("message")            log.info({ key: 1 }, "message")
 *   log.error({ err }, "message")  log.child({ module: "cloud" })
 *
 * Writes JSON objects through `console` so Workers Logs captures them as
 * structured fields, and Node prints them as objects.
 */

type Fields = Record<string, unknown>;
type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function configuredLevel(): number {
  const raw = process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug");
  return LEVELS[raw as Level] ?? LEVELS.info;
}

function serializeError(err: unknown): Fields {
  if (err instanceof Error) {
    return { message: err.message, name: err.name, stack: err.stack };
  }
  return { message: String(err) };
}

export class Logger {
  constructor(private readonly bindings: Fields = {}) {}

  child(bindings: Fields): Logger {
    return new Logger({ ...this.bindings, ...bindings });
  }

  debug(objOrMsg: Fields | Error | string, msg?: string): void {
    this.write("debug", objOrMsg, msg);
  }

  info(objOrMsg: Fields | Error | string, msg?: string): void {
    this.write("info", objOrMsg, msg);
  }

  warn(objOrMsg: Fields | Error | string, msg?: string): void {
    this.write("warn", objOrMsg, msg);
  }

  error(objOrMsg: Fields | Error | string, msg?: string): void {
    this.write("error", objOrMsg, msg);
  }

  private write(level: Level, objOrMsg: Fields | Error | string, msg?: string): void {
    if (LEVELS[level] < configuredLevel()) return;

    let fields: Fields = {};
    let message = msg;
    if (typeof objOrMsg === "string") {
      message = objOrMsg;
    } else if (objOrMsg instanceof Error) {
      fields = { err: serializeError(objOrMsg) };
    } else {
      fields = { ...objOrMsg };
      if (fields.err !== undefined) fields.err = serializeError(fields.err);
    }

    const entry = { level, time: new Date().toISOString(), ...this.bindings, ...fields, msg: message };
    const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    sink(entry);
  }
}

const logger = new Logger();

export default logger;

export const cloudLog = logger.child({ module: "cloud" });
export const teamLog = logger.child({ module: "team" });
export const s3Log = logger.child({ module: "s3" });
export const s3ApiLog = logger.child({ module: "s3api" });
export const polarLog = logger.child({ module: "polar" });
export const userLog = logger.child({ module: "user" });
export const emailLog = logger.child({ module: "email" });
export const webhookLog = logger.child({ module: "webhook" });
export const contactLog = logger.child({ module: "contact" });
export const feedbackLog = logger.child({ module: "feedback" });
export const agentLog = logger.child({ module: "agent" });
