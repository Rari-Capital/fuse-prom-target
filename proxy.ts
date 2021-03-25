import express from "express";
import fetch from "node-fetch";

const app = express();
const port = 1337;

let cache: string;
let lastServedFromCache: number = 0;

async function fetchAndCacheWithFallback() {
  console.time("Target Fetch");
  try {
    const metrics = (await fetch("http://localhost:1336/metrics").then((res) =>
      res.text()
    )) as string;

    // Wait at least 30 seconds since we last served from cache to give the full response in case all metrics haven't loaded yet.
    if (Date.now() - lastServedFromCache <= 30_000) {
      console.log(
        "Serving cache for 30 more seconds to ensure that our target has fully started up."
      );
    } else {
      cache = metrics;
    }
  } catch (e) {
    console.log(e);
    console.log("\n\n dFetch to target failed, using cache! \n\n");

    lastServedFromCache = Date.now();
  }
  console.timeEnd("Target Fetch");

  return cache;
}

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");

  res.end(await fetchAndCacheWithFallback());
});

app.listen(port, () => {
  console.log(`Proxy server started at http://localhost:${port}/metrics`);
});
