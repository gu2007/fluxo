// Configuração do PM2: `pm2 start ecosystem.config.js`
module.exports = {
  apps: [{
    name: 'fluxo',
    script: 'server.js',
    env: { NODE_ENV: 'production', PORT: 3100 },
    max_memory_restart: '200M',
  }],
};
