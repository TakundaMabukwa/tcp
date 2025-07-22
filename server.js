const net = require("net");
const fs = require("fs");
require('dotenv').config();

const PORT = process.env.PORT;
const LOG_FILE = "ituran_data.log";
const ALLOWED_IPS = [process.env.ALLOWED_IP1, process.env.ALLOWED_IP2]

const server = net.createServer((socket) => {
  const clientIp = socket.remoteAddress.replace(/^.*:/, "");
  console.log(`New connection from ${clientIp}`);

  if (!ALLOWED_IPS.includes(clientIp)) {
    console.log(`Unauthorized IP: ${clientIp}`);
    return socket.destroy();
  }

  let buffer = "";

  socket.on("data", (data) => {
    try {
      buffer += data.toString("utf8");

      const messages = buffer.split("^");

      buffer = buffer.endsWith("^") ? "" : messages.pop();

      messages
        .filter((msg) => msg.trim())
        .forEach((rawMessage) => {
          const timestamp = new Date().toISOString();
          const message = rawMessage.trim();

          console.log(`[${timestamp}] Received: ${message}`);

          fs.appendFile(LOG_FILE, `[${timestamp}] ${message}\n`, (err) => {
            if (err) console.error("Error writing to log:", err);
          });
        });
    } catch (err) {
      console.error("Error processing data:", err);
    }
  });

  socket.on("error", (err) => {
    console.error("Socket error:", err);
  });

  socket.on("end", () => {
    console.log(`Connection closed by ${clientIp}`);
  });
});

// Start
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// Handle errors
server.on("error", (err) => {
  console.error("Server error:", err);
});