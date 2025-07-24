const net = require("net");
const fs = require("fs");
const ip = require("ip");
require("dotenv").config();
const express = require("express");
const supabase = require("./supabase");

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
  "198.54.173.198"
];
const DO_NETWORKS = ["10.244.0.0/16", "10.135.0.0/16", "10.128.0.0/16", "10.2.1.0/24"];

// Create servers
const server = net.createServer();
const app = express();

// Enhanced message parser with all fields
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
    quality: parts[28] || null,
    pocsagstr: parts[30] || null,
    head: parts[31] || null,

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
    name_event: parts[29] || null,
    utc_now_time: parts[32] || null,

    // Timestamps
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

// Connection handler
server.on("connection", (socket) => {
  const clientIp = socket.remoteAddress.replace(/^.*:/, "");
  console.log(`[Connection] from ${clientIp}`);

  const handleError = (err) => {
    if (err.code !== "ECONNRESET") {
      console.error(`[Error] ${clientIp}:`, err.message);
    }
    socket.destroy();
  };

  socket.once("error", handleError);

  // Handle DO health checks
  if (DO_NETWORKS.some((net) => ip.cidrSubnet(net).contains(clientIp))) {
    console.log(`[Health Check] from ${clientIp}`);
    socket.end("HEALTHY\n", "utf8", () => socket.destroy());
    return;
  }

  if (!ALLOWED_IPS.includes(clientIp)) {
    console.log(`[Security] Blocked connection from ${clientIp}`);
    socket.destroy();
    return;
  }

  console.log(`[Connection] Established with ${clientIp}`);

  let buffer = "";

  socket.on("data", async (data) => {
    try {
      buffer += data.toString("utf8");

      while (buffer.includes("^")) {
        const startIdx = buffer.indexOf("^");
        const endIdx = buffer.indexOf("^", startIdx + 1);

        if (endIdx === -1) break;

        const message = buffer.substring(startIdx + 1, endIdx);
        buffer = buffer.substring(endIdx + 1);

        if (message.trim()) {
          const timestamp = new Date().toISOString();
          console.log(`[Data] ${timestamp} from ${clientIp}: ${message}`);

          try {
            const vehicleData = parseVehicleMessage(message);
            console.log("Parsed data:", vehicleData);

            // Simple insert operation
            const { data: supabaseResponse, error } = await supabase
              .from("vehicle_tracking")
              .insert([vehicleData]);

            if (error) {
              console.error("Supabase insert error:", error);
              fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Insert error: ${error.message}\n`);
            } else {
              console.log("Data inserted successfully:", supabaseResponse);
              fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Data inserted for plate: ${vehicleData.plate}\n`);
            }
          } catch (err) {
            console.error("Data processing error:", err);
            fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Processing error: ${err.message}\n`);
          }
        }
      }
    } catch (err) {
      console.error("Socket data error:", err);
      fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Socket error: ${err.message}\n`);
    }
  });

  socket.on("end", () => {
    console.log(`[Disconnected] ${clientIp}`);
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Client disconnected: ${clientIp}\n`);
  });
});

// HTTP API
app.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("vehicle_tracking")
      .select('*')
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({
      status: "ok",
      count: data.length,
      data: data,
    });
  } catch (err) {
    console.error("API error:", err);
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] API error: ${err.message}\n`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start servers
server.listen(PORT, "0.0.0.0", () => {
  console.log(`TCP server running on port ${PORT}`);
  console.log("Allowed IPs:", ALLOWED_IPS);
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Server started on port ${PORT}\n`);
});

app.listen(3000, () => {
  console.log("HTTP server running on port 3000");
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] HTTP server started on port 3000\n`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down servers...");
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] Server shutting down\n`);
  server.close(() => process.exit(0));
});