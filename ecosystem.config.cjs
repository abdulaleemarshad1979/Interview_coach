module.exports = {
  apps: [
    {
      name: "interview-coach-server",
      script: "./dist/server.cjs",
      instances: "max",
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "500M",
      exp_backoff_restart_delay: 100,
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
};
