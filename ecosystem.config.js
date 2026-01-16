module.exports = {
  apps: [
    {
      name: 'dashboard',
      cwd: './services/dashboard-next',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/dashboard-error.log',
      out_file: './logs/dashboard-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      wait_ready: true,
      listen_timeout: 10000
    },
    {
      name: 'discord-bot',
      cwd: './services/discord-bot',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: './logs/discord-bot-error.log',
      out_file: './logs/discord-bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      cron_restart: '0 4 * * *'
    },
    {
      name: 'stream-bot',
      cwd: './services/stream-bot',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: './logs/stream-bot-error.log',
      out_file: './logs/stream-bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    },
    {
      name: 'terminal-server',
      cwd: './services/dashboard-next',
      script: 'npm',
      args: 'run terminal-server',
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      error_file: './logs/terminal-server-error.log',
      out_file: './logs/terminal-server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    }
  ],

  deploy: {
    production: {
      user: 'root',
      host: ['linode.evindrake.net'],
      ref: 'origin/main',
      repo: 'git@github.com:user/nebula-command.git',
      path: '/opt/nebula-command',
      'pre-deploy': 'git fetch --all',
      'post-deploy': 'npm ci && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'mkdir -p /opt/nebula-command/logs'
    },
    staging: {
      user: 'evin',
      host: ['host.evindrake.net'],
      ref: 'origin/develop',
      repo: 'git@github.com:user/nebula-command.git',
      path: '/opt/nebula-command',
      'post-deploy': 'npm ci && pm2 reload ecosystem.config.js --env production'
    }
  }
};
