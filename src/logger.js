const config = require('./config.js');
const https = require('https');

class Logger {
  httpLogger = (req, res, next) => {
    let send = res.send;
    res.send = (resBody) => {
      const logData = {
        authorized: !!req.headers.authorization,
        path: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode,
        reqBody: JSON.stringify(req.body),
        resBody: JSON.stringify(resBody),
      };
      const level = this.statusToLogLevel(res.statusCode);
      this.log(level, 'http', logData);
      res.send = send;
      return res.send(resBody);
    };
    next();
  };

  log(level, type, logData) {
    const labels = { component: config.source, level: level, type: type };
    const values = [this.nowString(), this.sanitize(logData)];
    const logEvent = { streams: [{ stream: labels, values: [values] }] };

    this.sendLogToGrafana(logEvent);
  }

  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }

  nowString() {
    // nanosecond timestamp as required by Loki/Grafana
    return (Math.floor(Date.now()) * 1000000).toString();
  }

  sanitize(logData) {
    let data = JSON.stringify(logData);

    // Mask passwords
    data = data.replace(/\\"password\\":\s*\\"[^"]*\\"/g, '\\"password\\": \\"*****\\"');

    // Mask authorization tokens
    data = data.replace(/\\"authorization\\":\s*\\"Bearer [^"]*\\"/gi, '\\"authorization\\": \\"Bearer *****\\"');

    return data;
  }

  sendLogToGrafana(event) {
    const body = JSON.stringify(event);
    fetch(config.logging.url, {
      method: 'post',
      body: body,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.logging.userId}:${config.logging.apiKey}`,
      },
    }).then((res) => {
      if (!res.ok) console.log('Failed to send log to Grafana');
    });
  }

  // If you want to explicitly log DB queries, factory requests, or exceptions as before:
  logDbQuery(query) {
    const logData = { sql: query };
    this.log('info', 'db', logData);
  }

  logFactoryRequest(url, method, reqBody, statusCode, resBody) {
    const logData = {
      url,
      method,
      statusCode,
      reqBody: JSON.stringify(reqBody),
      resBody: JSON.stringify(resBody)
    };
    const level = this.statusToLogLevel(statusCode);
    this.log(level, 'factory', logData);
  }

  logException(err, req) {
    const logData = {
      message: err.message,
      stack: err.stack,
      path: req ? req.originalUrl : 'N/A',
      method: req ? req.method : 'N/A',
    };
    this.log('error', 'exception', logData);
  }
}

module.exports = new Logger();
