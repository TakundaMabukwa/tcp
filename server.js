const net = require('net');
const fs = require('fs');
const ip = require('ip');
require('dotenv').config();

// Configuration
const PORT = process.env.PORT || 8000;
const LOG_FILE = 'ituran_data.log';
const ALLOWED_IPS = [
  process.env.ITURAN_IP1 || '81.218.55.66',
  process.env.ITURAN_IP2 || '212.150.50.68'
];
const DO_NETWORKS = [
  '10.244.0.0/16',
  '10.135.0.0/16',
  '10.128.0.0/16'
];

// Create server
const server = net.createServer();

// Connection handler
server.on('connection', (socket) => {
  const clientIp = socket.remoteAddress.replace(/^.*:/, '');
  
  // Error handler for this socket
  const handleError = (err) => {
    if (err.code !== 'ECONNRESET') {
      console.error(`[Error] ${clientIp}:`, err.message);
    }
    socket.destroy();
  };

  socket.once('error', handleError);

  // Handle DO health checks
  if (DO_NETWORKS.some(net => ip.cidrSubnet(net).contains(clientIp))) {
    console.log(`[Health Check] from ${clientIp}`);
    socket.end('HEALTHY\n', 'utf8', () => {
      socket.destroy();
    });
    return;
  }

  // Validate other connections
  if (!ALLOWED_IPS.includes(clientIp)) {
    console.log(`[Security] Blocked connection from ${clientIp}`);
    socket.destroy();
    return;
  }

  console.log(`[Connection] Established with ${clientIp}`);
  
  let buffer = '';
  
  // Data handler for Ituran
  socket.on('data', (data) => {
    try {
      buffer += data.toString('utf8');
      
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

  socket.on('end', () => {
    console.log(`[Disconnected] ${clientIp}`);
  });
});

// Server error handling
server.on('error', (err) => {
  console.error('Server error:', err);
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Allowed Ituran IPs:', ALLOWED_IPS);
  console.log('Allowed DO Networks:', DO_NETWORKS);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => process.exit(0));
});