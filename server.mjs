import net from "net";
import fs from "fs";
import ip from "ip";
import express from "express";
import { fileURLToPath } from "url";
import { dirname } from "path";
import chalk from "chalk";

// ES Modules equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const PORT = process.env.PORT || 9000;
const HTTP_PORT = 3000;
const LOG_FILE = "data.log";
const ALLOWED_IPS = [
  process.env.ALLOWED_IP1 || "81.218.55.66",
  process.env.ALLOWED_IP2 || "212.150.50.68",
  "127.0.0.1",
  "64.227.138.235",
  "10.2.1.148"
];

// Logging functions with chalk colors
const logData = (message, data) => {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message} ${JSON.stringify(data)}\n`;
  fs.appendFileSync(LOG_FILE, logEntry);
  console.log(chalk.green(logEntry.trim()));
};

const logError = (error) => {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ERROR: ${error}\n`;
  fs.appendFileSync(LOG_FILE, logEntry);
  console.error(chalk.red(logEntry.trim()));
};

// Message parser
const parseMessage = (raw) => {
  const parts = raw.split("|").map((p) => p.trim());
  return {
    plate: parts[0],
    speed: parseFloat(parts[1]) || 0,
    latitude: parseFloat(parts[2]),
    longitude: parseFloat(parts[3]),
    timestamp: new Date().toISOString(),
  };
};

// TCP Server
const createTCPServer = () => {
  const server = net.createServer((socket) => {
    const clientIp = socket.remoteAddress.replace(/^.*:/, "");

    if (!ALLOWED_IPS.includes(clientIp)) {
      socket.destroy();
      return;
    }

    let buffer = "";
    socket.on("data", (data) => {
      buffer += data.toString();

      while (buffer.includes("^")) {
        const start = buffer.indexOf("^");
        const end = buffer.indexOf("^", start + 1);

        if (end === -1) break;

        const message = buffer.substring(start + 1, end);
        buffer = buffer.substring(end + 1);

        try {
          const parsed = parseMessage(message);
          logData(`[${clientIp}] Received:`, parsed);
        } catch (err) {
          logError(`Failed to parse: ${message} - ${err}`);
        }
      }
    });

    socket.on("error", (err) => {
      logError(`Client error: ${err}`);
    });

    socket.on("end", () => {
      logData(`Client disconnected:`, { ip: clientIp });
    });
  });

  server.on("error", (err) => {
    logError(`Server error: ${err}`);
  });

  return server;
};

// HTTP Server
const createHTTPServer = () => {
  const app = express();

  app.get("/logs", (req, res) => {
    try {
      const logs = fs.readFileSync(LOG_FILE, "utf8");
      res.type("text/plain").send(logs);
    } catch (err) {
      res.status(500).send("Error reading logs");
    }
  });

  return app;
};

// Start servers
const startServers = () => {
  const tcpServer = createTCPServer();
  const httpServer = createHTTPServer();

  tcpServer.listen(PORT, () => {
    console.log(chalk.blue(`TCP server listening on port ${PORT}`));
  });

  httpServer.listen(HTTP_PORT, () => {
    console.log(chalk.blue(`HTTP server listening on port ${HTTP_PORT}`));
  });

  process.on("SIGINT", () => {
    tcpServer.close(() => {
      console.log(chalk.yellow("TCP server stopped"));
      process.exit(0);
    });
  });
};

// Initialize
startServers();
