const net = require('net');
const fs = require('fs');
const ip = require('ip');
require('dotenv').config();

// Configuration
const PORT = process.env.PORT || 8000;
const LOG_FILE = 'ituran_data.log';
const ALLOWED_IPS = [
  process.env.ALLOWED_IP1,
  process.env.ALLOWED_IP2 
];
const DO_NETWORKS = [
  '10.244.0.0/16',  // DO App Platform internal
  '10.135.0.0/16',  // DO Load Balancers
  '10.128.0.0/16'   // DO general internal
];

// Create server
const server = net.createServer();

// IP validation
function isAllowed(clientIp) {
  // Check DigitalOcean internal networks first
  if (DO_NETWORKS.some(net => ip.cidrSubnet(net).contains(clientIp))) {
    return true;
  }
  
  // Check explicitly allowed IPs
  return ALLOWED_IPS.includes(clientIp);
}

// Handle connections
server.on('connection', (socket) => {
  const clientIp = socket.remoteAddress.replace(/^.*:/, '');
  
  // Handle DigitalOcean health checks
  if (DO_NETWORKS.some(net => ip.cidrSubnet(net).contains(clientIp))) {
    console.log(`[Health Check] from ${clientIp}`);
    socket.write('HEALTHY');
    return socket.end();
  }

  // Validate other connections
  if (!isAllowed(clientIp)) {
    console.log(`[Security] Blocked connection from ${clientIp}`);
    return socket.destroy();
  }

  console.log(`[Connection] Established with ${clientIp}`);
  
  let buffer = '';
  
  // Data handling for Ituran messages
  socket.on('data', (data) => {
    try {
      buffer += data.toString('utf8');
      
      // Process complete messages (between ^ delimiters)
      while (buffer.includes('^')) {
        const startIdx = buffer.indexOf('^');
        const endIdx = buffer.indexOf('^', startIdx + 1);
        
        if (endIdx === -1) break;
        
        const message = buffer.substring(startIdx + 1, endIdx);
        buffer = buffer.substring(endIdx + 1);
        
        if (message.trim()) {
          const timestamp = new Date().toISOString();
          console.log(`[Data] ${timestamp} from ${clientIp}: ${message}`);
          
          fs.appendFile(LOG_FILE, `[${timestamp}] ${clientIp} - ${message}\n`, (err) => {
            if (err) console.error('Log error:', err);
          });
        }
      }
    } catch (err) {
      console.error('Data processing error:', err);
    }
  });

  socket.on('error', (err) => {
    console.error(`[Error] ${clientIp}:`, err.message);
  });

  socket.on('end', () => {
    console.log(`[Disconnected] ${clientIp}`);
  });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Allowed Ituran IPs:', ALLOWED_IPS);
  console.log('Allowed DO Networks:', DO_NETWORKS);
});

// Handle server errors
server.on('error', (err) => {
  console.error('Server error:', err);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => process.exit(0));
});