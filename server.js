const net = require("net");
const fs = require("fs");
const ip = require("ip");
require("dotenv").config();
const express = require("express");
// const { createClient } = require("@supabase/supabase-js");
const supabase = require("./supabase"); // Importing supabase client

// Configuration
const PORT = process.env.PORT || 9000;

const LOG_FILE = "logs.txt";
const ALLOWED_IPS = [
  process.env.ALLOWED_IP1 || "81.218.55.66",
  process.env.ALLOWED_IP2 || "212.150.50.68",
  "127.0.0.1", // Localhost for testing,
  "143.198.204.127",
];
const DO_NETWORKS = ["10.244.0.0/16", "10.135.0.0/16", "10.128.0.0/16"];

// Create server
const server = net.createServer();
const app = express();
// Connection handler
server.on("connection", (socket) => {
  const clientIp = socket.remoteAddress.replace(/^.*:/, "");

  // Error handler for this socket
  const handleError = (err) => {
    if (err.code !== "ECONNRESET") {
      console.error(`[Error] ${clientIp}:`, err.message);
    }
    socket.destroy();
  };

  socket.once("error", handleError);

  // Handle DO health checks
  if (DO_NETWORKS.some((net) => ip.cidrSubnet(net).contains(clientIp))) {
    // console.log(`[Health Check] from ${clientIp}`);
    socket.end("HEALTHY\n", "utf8", () => {
      socket.destroy();
    });
    return;
  }

  // Validate other connections
  if (!ALLOWED_IPS.includes(clientIp)) {
    // console.log(`[Security] Blocked connection from ${clientIp}`);
    socket.destroy();
    return;
  }

  // console.log(`[Connection] Established with ${clientIp}`);

  let buffer = "";

  // Data handler for Ituran
  socket.on("data", async (data) => {
    try {
      buffer += data.toString("utf8");

      while (buffer.includes("^")) {
        const startIdx = buffer.indexOf("^");
        const endIdx = buffer.indexOf("^", startIdx + 1);

        if (endIdx === -1) break;

        const message = buffer.substring(startIdx + 1, endIdx);
        // console.log(`[Data] ${message}`);
        buffer = buffer.substring(endIdx + 1);
        function parseVehicleMessage(message) {
          // Extract the data part after the IP address
          const dataStart = message.indexOf(" - ") + 3;
          const dataPart = message.slice(dataStart);

          // Split by pipe delimiter
          const parts = dataPart.split("|").map((part) => part.trim());

          // Map the parts to the structured format
          return {
            head: parts[0] || null,
            latitude: parseFloat(parts[1]) || null,
            longitude: parseFloat(parts[2]) || null,
            loc_time: parts[3] || null,
            mileage: parseFloat(parts[4]) || null,
            address: `${parts[9] || ""}, ${parts[8] || ""}`.trim() || null,
            speed: parseFloat(parts[7]) || null,
            statuses: parts[10] || null,
            driver_authentication: parts[5] || null,
            driver_name: parts[6] || null,
            plate: parts[0] || null, // Using the same as head if plate isn't separate
          };
        }

        if (message.trim()) {
          const timestamp = new Date().toISOString();
          // console.log(`[Data] ${timestamp} from ${clientIp}: ${message}`);

          // Function to process multiple messages and prepare for Supabase insertion
          function prepareSupabaseInserts(messages) {
            return messages.map((message) => parseVehicleMessage(message));
          }
          const supabaseData = prepareSupabaseInserts([message]);
          // console.log("Supabase Data:", supabaseData[0]);

          try {
            const { data, error } = await supabase
              .from("vehicle_tracking")
              .insert(supabaseData);
            // console.log(
            //   "Data inserted into Supabase successfully:",
            //   data,
            //   error
            // );
          } catch (error) {
            console.error("Supabase insert error:", error);
          }

          // console.log("supabaseData[0]:", supabaseData[0]);
          // fs.appendFile(
          //   LOG_FILE,
          //   `[${timestamp}] ${clientIp} - ${message}\n`,
          //   (err) => {
          //     if (err) console.error("Log error:", err);
          //   }
          // );
        }
      }
    } catch (err) {
      console.error("Data processing error:", err);
    }
  });

  socket.on("end", () => {
    console.log(`[Disconnected] ${clientIp}`);
  });
});

app.get("/", async (req, res) => {
  // fs.readFile(LOG_FILE, "utf8", (err, data) => {
  //   if (err) {
  //     console.error("Error reading log file:", err);
  //     return res.status(500).send("Internal Server Error");
  //   }
  //   res.send(`<pre>${data}</pre>`);
  // });
  const { data, error } = await supabase.from("vehicle_tracking").select();
  if (error) {
    console.error("Supabase error:", error);
    return res.status(500).send("Internal Server Error");
  }
  res.send({
    status: "ok",
    code: 200,
    message: "Ituran server is running",
    data: data,
  });
});

// server.get

// Server error handling
server.on("error", (err) => {
  console.error("Server error:", err);
});

// Start server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Allowed Ituran IPs:", ALLOWED_IPS);
  console.log("Allowed DO Networks:", DO_NETWORKS);
});

app.listen(3000, () => {
  console.log(`Express server running on port 3000`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down server...");
  server.close(() => process.exit(0));
});
