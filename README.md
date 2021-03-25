# fuse-prom-target
Serves data to Prometheus about Fuse. Currently in use at [rari.grafana.net](https://rari.grafana.net)

## Usage

1. First add `localhost:1337` as a scrape target in your `prometheus.yml`.

2. Then startup `fuse-prom-target` by running:

```bash
npm run start-pm2
```

- This will startup two pm2 tasks. One named `fuse-prom-target` and the other named `fuse-prom-proxy`. The target actually fetches data, while the proxy just sits in front of the data and caches it in case the target goes down or gets restarted (to prevent downtime!)

- If you modify `target.ts` (like to add new metrics), simply run `pm2 restart fuse-prom-target`. 
  - This will restart the target, but not the proxy which will cache the last returned metrics and serve them while your target restarts.

## Grafana

JSON configuration for 3 beautiful dashboards that can be crafted with the data provided from `fuse-prom-targets` is avaible in the [dashboards directory](/dashboards)! 

<img width="1611" alt="Screen Shot 2021-03-24 at 5 08 39 PM" src="https://user-images.githubusercontent.com/26209401/112399514-95858900-8cc3-11eb-8c78-8e5b62f1d300.png">

