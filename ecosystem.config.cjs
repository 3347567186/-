module.exports = {
  apps: [{
    name: 'zhenyun-server',
    cwd: '/root/zhenyun',
    script: 'server/serve.mjs',
    env: {
      NODE_ENV: 'production',
      PORT: '5184'
    },
    max_memory_restart: '500M',
    error_file: '/root/zhenyun/logs/err.log',
    out_file: '/root/zhenyun/logs/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    restart_delay: 3000,
    max_restarts: 10
  }]
}
