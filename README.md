# fuse-prom-target
Serves data to Prometheus about Fuse. Currently in use at [rari.grafana.net](https://rari.grafana.net)

## Usage

```bash
npm install

npm run start-pm2
```

Now if you wish to modify the target (like to add new metrics), to avoid showing downtime in your Grafana charts, simply run `pm2 restart fuse-prom-target`. 

This will restart the target but not the proxy which will cache the last returned metrics and serve them while your target restarts.
