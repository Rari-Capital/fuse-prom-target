import express from "express";
import fetch from "node-fetch";

const app = express();
const port = 1337;

let cache: string;
let lastFetchFailure: number = 0;

function hasBeen5Minutes(startTime: number) {
  return Date.now() - startTime >= 300_000;
}

async function fetchAndCacheWithFallback() {
  try {
    const { lastRestart } = await fetch("http://localhost:1336/ops", {
      timeout: 1000 // 1 second timeout.
    }).then(res => res.json());

    if (hasBeen5Minutes(lastRestart) && hasBeen5Minutes(lastFetchFailure)) {
      cache = await fetch("http://localhost:1336/metrics", {
        timeout: 5000 // 5 second timeout.
      }).then(res => res.text());
    } else {
      console.warn(
        "Serving cache for 5 minutes to ensure that the target has fully started up."
      );
    }
  } catch (e) {
    console.log(e);
    console.warn("Fetch to target failed, using cache!");

    lastFetchFailure = Date.now();
  }

  return cache;
}

app.get("/metrics", async (_, res) => {
  res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");

  res.end(await fetchAndCacheWithFallback());
});

app.listen(port, () => {
  console.log(`Proxy server started at http://localhost:${port}/metrics`);
});
