import { Gauge, register } from "prom-client";
import express from "express";

// TODO: Use exported commonjs build from fuse-sdk once added
import Fuse from "./fuse.node.commonjs2.js";

// TODO: Change to use .env
export const alchemyURL = `https://eth-mainnet.alchemyapi.io/v2/2Mt-6brbJvTA4w9cpiDtnbTo6qOoySnN`;
const fuse = new Fuse(alchemyURL);

const app = express();
const port = 1337;

let tvl = new Gauge({
  name: "fuse_tvl",
  help: "Total $ Value Locked In Fuse",
});

let tvb = new Gauge({
  name: "fuse_tvb",
  help: "Total $ Value Borrowed On Fuse",
});

let underwaterUsers = new Gauge({
  name: "fuse_underwaterUsers",
  help: "Users who need to be liquidated.",
});

let atRiskUsers = new Gauge({
  name: "fuse_atRiskUsers",
  help: "Users who are 20% away from liquidation.",
});

let poolGauges: { poolTVL: any; poolTVB: any }[] = [];

// Event loop
setInterval(async () => {
  const {
    0: ids,
    1: fusePools,
    2: totalSuppliedETH,
    3: totalBorrowedETH,
    4: underlyingTokens,
    5: underlyingSymbols,
  } = await fuse.contracts.FusePoolLens.methods
    .getPublicPoolsWithData()
    .call({ gas: 1e18 });

  const ethPrice: number = (await fuse.web3.utils.fromWei(
    await fuse.getEthUsdPriceBN()
  )) as any;

  let _tvl = 0;
  let _tvb = 0;
  for (let i = 0; i < ids.length; i++) {
    try {
      const id = ids[i];

      // Register all gauges if haven't already
      if (!poolGauges[id]) {
        let poolTVL = new Gauge({
          name: "fuse_pool_tvl_" + id,
          help: "Total $ Value Supplied On Pool #" + id,
        });

        let poolTVB = new Gauge({
          name: "fuse_pool_tvb_" + ids[i],
          help: "Total $ Value Borrowed On Pool #" + id,
        });

        poolGauges[id] = { poolTVL, poolTVB };
      }

      const usdTVL = (totalSuppliedETH[i] / 1e18) * ethPrice;
      const usdTVB = (totalBorrowedETH[i] / 1e18) * ethPrice;
      poolGauges[id].poolTVL.set(usdTVL);
      poolGauges[id].poolTVB.set(usdTVB);
      _tvl += usdTVL;
      _tvb += usdTVB;
    } catch (err) {
      console.log(err);
    }
  }

  tvl.set(_tvl);
  tvb.set(_tvb);

  const atRiskUsersArray = await fuse.contracts.FusePoolLens.methods
    .getPublicPoolUsersWithData(fuse.web3.utils.toBN(1.2e18))
    .call()
    .then((result: string[][][]) => result[1].flat());

  atRiskUsers.set(atRiskUsersArray.length);

  const underwaterUsersArray = await fuse.contracts.FusePoolLens.methods
    .getPublicPoolUsersWithData(fuse.web3.utils.toBN(1e18))
    .call()
    .then((result: string[][][]) => result[1].flat());

  underwaterUsers.set(underwaterUsersArray.length);
}, 1000);

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.listen(port, () => {
  console.log(`server started at http://localhost:${port}/metrics`);
});
