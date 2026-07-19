// Structured JSON logger — writes to stdout/stderr.
// Container runtimes capture stdout/stderr as container logs automatically.
// JSON format is machine-parseable by Datadog, Logtail, Railway, Fly.io log drains etc.

type LogData = Record<string, unknown>

function write(level: 'info' | 'warn' | 'error', msg: string, data?: LogData) {
  // const entry = JSON.stringify({
  //   level,
  //   msg,
  //   ts: new Date().toISOString(),
  //   ...data,
  // })

  const ts = new Date().toISOString()
  const log = `${level.toUpperCase()} : ${ts} | ${msg} | ${JSON.stringify(data)}`
  if (level === 'error') {
    console.error(log)
  } else {
    console.log(log)
  }
}

export const logger = {
  info:  (msg: string, data?: LogData) => write('info',  msg, data),
  warn:  (msg: string, data?: LogData) => write('warn',  msg, data),
  error: (msg: string, data?: LogData) => write('error', msg, data),
}
