const net = require("net");
const fs = require("fs");
const ip = require("ip");
require("dotenv").config();
const express = require("express");
const chalk = require("chalk");

// Configuration
const PORT = process.env.PORT || 9000;
const LOG_FILE = "logs.txt";
const ALLOWED_IPS = [
  process.env.ALLOWED_IP1 || "81.218.55.66",
  process.env.ALLOWED_IP2 || "212.150.50.68",
  process.env.ALLOWED_IP3 || "10.2.1.148",
  "127.0.0.1",
  "143.198.204.127",
  "192.168.1.165",
  "64.227.138.235",
  "41.157.41.148",
  "10.2.1.0/24",
  "198.54.173.198",
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

// Enhanced console logger
function logToConsole(type, message, data = null) {
  const timestamp = new Date().toISOString();
  const colors = {
    connection: chalk.blue,
    data: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.cyan,
    disconnect: chalk.magenta,
    debug: chalk.gray,
  };

  const logType = colors[type] || chalk.white;
  console.log(
    chalk.gray(`[${timestamp}]`),
    logType.bold(`${type.toUpperCase()}:`),
    chalk.white(message)
  );

  if (data) {
    console.log(chalk.gray("   ↳ Data:"), JSON.stringify(data, null, 2));
  }
}

// Message parser
function parseVehicleMessage(rawMessage) {
  const parts = rawMessage.split("|").map((part) => part.trim());

  return {
    // Core vehicle data
    plate: parts[0] || null,
    speed: parts[1] ? parseFloat(parts[1]) : null,
    latitude: parts[2] ? parseFloat(parts[2]) : null,
    longitude: parts[3] ? parseFloat(parts[3]) : null,
    loc_time: parts[4] || null,
    mileage: parts[5] ? parseFloat(parts[5]) : null,

    // Driver information
    driver_name: parts[6] || null,
    driver_authentication: parts[7] || null,
    driver_code: parts[8] || null,

    // Vehicle status
    statuses: parts[9] || null,
    engine_state: parts[10] || null,
    temperature: parts[11] || null,

    // Location data
    address: parts[12] || null,
    geozone: parts[13] || null,
    geo_area_circle: parts[14] || null,
    geo_area_polygon: parts[15] || null,
    geo_area_rout: parts[16] || null,

    // System information
    platform_name: parts[17] || null,
    platform_id: parts[18] || null,
    user_id: parts[19] || null,
    user_name: parts[20] || null,
    customer_id: parts[21] || null,
    uaid: parts[22] || null,

    // Additional fields
    rules: parts[23] || null,
    lim_msg: parts[24] || null,
    ecm_code: parts[25] || null,
    ecm_category: parts[26] || null,
    ecm_name: parts[27] || null,
    quality: parts[28] || null,
    name_event: parts[29] || null,
    pocsagstr: parts[30] || null,
    head: parts[31] || null,
    utc_now_time: parts[32] || null,

    // Timestamps
    received_at: new Date().toISOString(),
  };
}

// Track last message per client
const clientStates = new Map();

// Connection handler
server.on("connection", (socket) => {
  const clientIp = socket.remoteAddress.replace(/^.*:/, "");
  logToConsole("connection", `New connection from ${clientIp}`);

  // Initialize client state
  clientStates.set(clientIp, {
    lastMessage: null,
    connectionTime: new Date(),
  });

  const handleError = (err) => {
    if (err.code !== "ECONNRESET") {
      logToConsole("error", `Error from ${clientIp}: ${err.message}`);
    }
    socket.destroy();
  };

  socket.once("error", handleError);

  // Health checks
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

      while (buffer.includes("^")) {
        const startIdx = buffer.indexOf("^");
        const endIdx = buffer.indexOf("^", startIdx + 1);

        if (endIdx === -1) break;

        const message = buffer.substring(startIdx + 1, endIdx);
        buffer = buffer.substring(endIdx + 1);

        if (message.trim()) {
          try {
            const vehicleData = parseVehicleMessage(message);
            const clientState = clientStates.get(clientIp);

            // Log raw message
            logToConsole("debug", `Raw message from ${clientIp}`, message);

            // Log full parsed data on first message
            if (!clientState.lastMessage) {
              logToConsole(
                "data",
                `Initial data from ${clientIp}`,
                vehicleData
              );
            } else {
              // Find changes from last message
              const changes = {};
              Object.keys(vehicleData).forEach((key) => {
                if (
                  JSON.stringify(vehicleData[key]) !==
                  JSON.stringify(clientState.lastMessage[key])
                ) {
                  changes[key] = {
                    old: clientState.lastMessage[key],
                    new: vehicleData[key],
                  };
                }
              });

              if (Object.keys(changes).length > 0) {
                logToConsole("data", `Data changes from ${clientIp}`, changes);
              } else {
                logToConsole("debug", `No data changes from ${clientIp}`);
              }
            }

            // Update last message
            clientState.lastMessage = vehicleData;
            clientStates.set(clientIp, clientState);

            // Log to file
            fs.appendFileSync(
              LOG_FILE,
              `[${new Date().toISOString()}] ${clientIp} - ${message}\n`
            );
          } catch (err) {
            logToConsole(
              "error",
              `Parse error from ${clientIp}: ${err.message}`
            );
          }
        }
      }
    } catch (err) {
      logToConsole(
        "error",
        `Data handling error from ${clientIp}: ${err.message}`
      );
    }
  });

  socket.on("end", () => {
    const connectionDuration =
      (new Date() - clientStates.get(clientIp).connectionTime) / 1000;
    logToConsole(
      "disconnect",
      `Client ${clientIp} disconnected after ${connectionDuration.toFixed(
        1
      )} seconds`
    );
    clientStates.delete(clientIp);
  });
});

// HTTP API
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
