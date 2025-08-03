import winston from 'winston';
import chalk from 'chalk';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const levelColor =
        level === 'info'
          ? chalk.bold.blue
          : level === 'error'
          ? chalk.bold.red
          : level === 'warn'
          ? chalk.bold.yellow
          : chalk.bold.white;

      const metaStr =
        Object.keys(meta).length > 0
          ? '\n' + chalk.gray(JSON.stringify(meta, null, 2))
          : '';

      return `${chalk.dim(`[${timestamp}]`)} ${levelColor(level)}: ${chalk.whiteBright(
        message
      )}${metaStr}`;
    })
  ),
  transports: [new winston.transports.Console()],
});
