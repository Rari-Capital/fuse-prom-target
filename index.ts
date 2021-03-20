import client from "prom-client";
const gateway = new client.Pushgateway(
  "https://prometheus-blocks-prod-us-central1.grafana.net/api/prom/push"
);
