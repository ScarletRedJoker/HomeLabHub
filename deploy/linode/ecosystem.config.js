module.exports = {
  apps: [
    {
      name: 'dashboard-next',
      cwd: '/opt/nebula/services/dashboard-next',
      script: 'npm',
      args: 'run start',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: '/var/log/nebula/dashboard-error.log',
      out_file: '/var/log/nebula/dashboard-out.log'
    },
    {
      name: 'discord-bot',
      cwd: '/opt/nebula/services/discord-bot',
      script: 'npm',
      args: 'run start',
      env_production: {
        NODE_ENV: 'production'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: '/var/log/nebula/discord-bot-error.log',
      out_file: '/var/log/nebula/discord-bot-out.log'
    },
    {
      name: 'stream-bot',
      cwd: '/opt/nebula/services/stream-bot',
      script: 'npm',
      args: 'run start',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: '/var/log/nebula/stream-bot-error.log',
      out_file: '/var/log/nebula/stream-bot-out.log'
    }
  ]
};
