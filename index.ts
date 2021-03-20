import { Counter, register } from "prom-client";
import express from "express";

const app = express();
const port = 1337;

const c = new Counter({
  name: "test_counter",
  help: "Example of a counter",
  labelNames: ["code"],
});

setInterval(() => {
  c.inc({ code: 200 });
}, 5000);

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.listen(port, () => {
  console.log(`server started at http://localhost:${port}`);
});
