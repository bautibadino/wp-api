module.exports = {
    apps: [{
      name: 'whatsapp-api',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      // Reiniciar si el proceso se cae
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s'
    }]
  };