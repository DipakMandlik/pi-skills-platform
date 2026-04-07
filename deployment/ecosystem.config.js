module.exports = {
  apps: [
    {
      name: 'ai-governance-backend',
      script: '-m',
      args: 'backend.main',
      cwd: '.',
      instances: 'max',
      exec_mode: 'cluster',
      interpreter: 'python3.12',
      env: {
        APP_ENV: 'production',
        APP_LOG_LEVEL: 'WARNING',
      },
      env_production: {
        APP_ENV: 'production',
        DEBUG: 'false',
      },
      error_file: '/var/log/ai-governance/backend-error.log',
      out_file: '/var/log/ai-governance/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '1G',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      listen_timeout: 8000,
      kill_timeout: 5000,
      wait_ready: true,
    },
  ],
  deploy: {
    production: {
      user: 'app',
      host: 'your-server-ip',
      ref: 'origin/main',
      repo: 'git@github.com:your-org/ai-governance.git',
      path: '/var/www/ai-governance',
      'post-deploy': 'pip install -r requirements.txt && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production',
      },
    },
  },
};
