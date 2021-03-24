import express from "express";
import fetch from "node-fetch";

const app = express();
const port = 1337;

let cache: string;

async function fetchAndCacheWithFallback() {
  try {
    console.time("Target Fetch");
    const text = (await fetch("http://localhost:1336/metrics").then((res) =>
      res.text()
    )) as string;
    console.timeEnd("Target Fetch");

    cache = text;

    return text;
  } catch (e) {
    console.timeEnd("Target Fetch");
    console.log(e);
    console.log("\n\n Fetch to target failed, using cache! \n\n");

    return cache;
  }
}

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");

  res.end(await fetchAndCacheWithFallback());
});

app.listen(port, () => {
  console.log(`Proxy server started at http://localhost:${port}/metrics`);
});
