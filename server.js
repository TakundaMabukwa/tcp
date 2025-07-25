const net = require("net");
const fs = require("fs");
const ip = require("ip");
require("dotenv").config();
const express = require("express");

// Configuration
const PORT = process.env.PORT || 9000;
const LOG_FILE = "raw_data.log"; // Changed log file name
const ALLOWED_IPS = [
  process.env.ALLOWED_IP1 || "81.218.55.66",
  process.env.ALLOWED_IP2 || "212.150.50.68",
  process.env.ALLOWED_IP || "10.2.1.148",
  process.env.ALLOWED_IP_RENDI,
  // "127.0.0.1",
  "143.198.204.127",
  "192.168.1.165",
  "64.227.138.235",
  "41.157.41.148",
  "10.2.1.0/24",
  "198.54.173.198",
  // "41.193.55.121",
];
const DO_NETWORKS = [
  "10.244.0.0/16",
  "10.135.0.0/16",
  "10.128.0.0/16",
  "10.2.1.0/24",
];

// Create servers
const server = net.createServer();
const app = express();

// Simplified logger (no parsing)
function logToConsole(type, message) {
  const timestamp = new Date().toISOString();
  switch (type) {
    case "41.193.55.121":
      // Handle specific logging for this IP
      console.log(
        `From Rendi - [${timestamp}] ${type.toUpperCase()}: ${message}`
      );
    case "41.157.41.148":
      console.log(
        `From Brian - [${timestamp}] ${type.toUpperCase()}: ${message}`
      );
    default:
      console.log(` Default - [${timestamp}] ${type.toUpperCase()}: ${message}`);
  }
}

// Connection handler
server.on("connection", (socket) => {
  const clientIp = socket.remoteAddress.replace(/^.*:/, "");
  logToConsole("connection", `New connection from ${clientIp}`);

  const handleError = (err) => {
    if (err.code !== "ECONNRESET") {
      logToConsole(
        "error",
        `Connection error from ${clientIp}: ${err.message}`
      );
    }
    socket.destroy();
  };

  socket.once("error", handleError);

  // Handle DO health checks
  if (DO_NETWORKS.some((net) => ip.cidrSubnet(net).contains(clientIp))) {
    logToConsole("info", `Health check from ${clientIp}`);
    socket.end("HEALTHY\n", "utf8", () => socket.destroy());
    return;
  }

  if (!ALLOWED_IPS.includes(clientIp)) {
    logToConsole("warning", `Blocked connection from ${clientIp}`);
    socket.destroy();
    return;
  }

  logToConsole("connection", `Established connection with ${clientIp}`);

  let buffer = "";

  socket.on("data", (data) => {
    try {
      buffer += data.toString("utf8");

      // Log ALL raw data as-is
      fs.appendFileSync(
        LOG_FILE,
        `[${new Date().toISOString()}] [${clientIp}] RAW DATA: ${data.toString(
          "utf8"
        )}\n`
      );

      logToConsole(
        "data",
        `Raw data from ${clientIp}: ${data.toString("utf8")}`
      );

      // Optional: Keep message boundary detection if needed
      while (buffer.includes("^")) {
        const startIdx = buffer.indexOf("^");
        const endIdx = buffer.indexOf("^", startIdx + 1);

        if (endIdx === -1) break;

        const message = buffer.substring(startIdx + 1, endIdx);
        buffer = buffer.substring(endIdx + 1);

        if (message.trim()) {
          fs.appendFileSync(
            LOG_FILE,
            `[${new Date().toISOString()}] [${clientIp}] COMPLETE MESSAGE: ${message}\n`
          );
        }
      }
    } catch (err) {
      logToConsole("error", `Data logging error: ${err.message}`);
    }
  });

  socket.on("end", () => {
    logToConsole("connection", `Client disconnected: ${clientIp}`);
  });
});

// HTTP API to view raw logs
app.get("/", (req, res) => {
  try {
    const logs = fs.readFileSync(LOG_FILE, "utf8");
    res.type("text/plain").send(logs);
  } catch (err) {
    logToConsole("error", `API error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start servers
server.listen(PORT, "0.0.0.0", () => {
  logToConsole("info", `TCP server started on port ${PORT}`);
  logToConsole("info", `Allowed IPs: ${ALLOWED_IPS.join(", ")}`);
});

app.listen(3000, () => {
  logToConsole("info", "HTTP server started on port 3000");
});

// Graceful shutdown
process.on("SIGINT", () => {
  logToConsole("info", "\nShutting down servers...");
  server.close(() => process.exit(0));
});
