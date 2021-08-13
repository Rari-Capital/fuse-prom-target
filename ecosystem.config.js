module.exports = {
  apps: [
    {
      name: "fuse-prom-target",
      script: "npm",
      args: "run start-target"
    },
    {
      name: "fuse-prom-proxy",
      script: "npm",
      args: "run start-proxy"
    }
  ]
};
