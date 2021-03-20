import { Gauge, register } from "prom-client";
import express from "express";

import Fuse from "./fuse.node.commonjs2.js";

// TODO: Change to use .env
export const alchemyURL = `https://eth-mainnet.alchemyapi.io/v2/2Mt-6brbJvTA4w9cpiDtnbTo6qOoySnN`;
const fuse = new Fuse(alchemyURL);

const app = express();
const port = 1337;

const tvl = new Gauge({
  name: "fuse_tvl",
  help: "Total $ Value Locked In Fuse",
});
setInterval(async () => {
  const {
    2: totalSuppliedETH,
  } = await fuse.contracts.FusePoolLens.methods
    .getPublicPoolsWithData()
    .call({ gas: 1e18 });

  const ethPrice: number = (await fuse.web3.utils.fromWei(
    await fuse.getEthUsdPriceBN()
  )) as any;

  const totalETH = totalSuppliedETH.reduce((a, b) => a + parseInt(b), 0) / 1e18;

  tvl.set(totalETH * ethPrice);
}, 1000);

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.listen(port, () => {
  console.log(`server started at http://localhost:${port}`);
});
