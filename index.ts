import { Gauge, register } from "prom-client";
import express from "express";

import Fuse from "./fuse.node.commonjs2.js";

// TODO: Change to use .env
export const alchemyURL = `https://eth-mainnet.alchemyapi.io/v2/2Mt-6brbJvTA4w9cpiDtnbTo6qOoySnN`;
const fuse = new Fuse(alchemyURL);

const app = express();
const port = 1337;

let userLeverage = new Gauge({
  name: "fuse_userLeverage",
  help: "Stores how many users are at different levels of leverage",
  // Levels: leveraged, at_risk, liquidatable
  labelNames: ["id", "level"] as const,
});

let poolSuppliedAssetsAmount = new Gauge({
  name: "fuse_pool_assets_supply_amount",
  help: "Stores how much of each asset is supplied in each pool.",
  labelNames: ["id", "symbol"] as const,
});

let poolBorrowedAssetsAmount = new Gauge({
  name: "fuse_pool_assets_borrow_amount",
  help: "Stores how much of each asset is borrowed in each pool.",
  labelNames: ["id", "symbol"] as const,
});

let poolSuppliedAssetsUSD = new Gauge({
  name: "fuse_pool_assets_supply_usd",
  help: "Stores how much of each asset is supplied in each pool.",
  labelNames: ["id", "symbol"] as const,
});

let poolBorrowedAssetsUSD = new Gauge({
  name: "fuse_pool_assets_borrow_usd",
  help: "Stores how much of each asset is borrowed in each pool.",
  labelNames: ["id", "symbol"] as const,
});

function fetchUsersWithHealth(
  fuse: any,
  comptroller: string,
  maxHealth: number
) {
  return fuse.contracts.FusePoolLens.methods
    .getPoolUsersWithData(comptroller, fuse.web3.utils.toBN(maxHealth))
    .call()
    .then((result: { account: string }[][]) =>
      result[0].map((data) => data.account)
    ) as Promise<string[]>;
}

function removeDoubleCounts(array1: any[], array2: any[]) {
  return array1.filter(function (val) {
    return array2.indexOf(val) == -1;
  });
}

export interface FuseAsset {
  cToken: string;

  borrowBalance: number;
  supplyBalance: number;
  liquidity: number;

  membership: boolean;

  underlyingName: string;
  underlyingSymbol: string;
  underlyingToken: string;
  underlyingDecimals: number;
  underlyingPrice: number;

  collateralFactor: number;
  reserveFactor: number;

  adminFee: number;
  fuseFee: number;

  borrowRatePerBlock: number;
  supplyRatePerBlock: number;

  totalBorrow: number;
  totalSupply: number;
}

const eventLoop = async () => {
  const thisInterval = Date.now();

  console.time("poolData " + thisInterval);
  const [{ 0: ids, 1: fusePools }, ethPrice] = await Promise.all([
    fuse.contracts.FusePoolLens.methods
      .getPublicPoolsWithData()
      .call({ gas: 1e18 }),
    fuse.web3.utils.fromWei(await fuse.getEthUsdPriceBN()) as number,
  ]);
  console.timeEnd("poolData " + thisInterval);

  console.time("assetData " + thisInterval);
  console.time("userLeverage " + thisInterval);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];

    fuse.contracts.FusePoolLens.methods
      .getPoolAssetsWithData(fusePools[i].comptroller)
      .call({
        from: "0x0000000000000000000000000000000000000000",
        gas: 1e18,
      })
      .then((assets: FuseAsset[]) => {
        assets.forEach((asset) => {
          // Amount

          poolSuppliedAssetsAmount.set(
            { id, symbol: asset.underlyingSymbol },
            asset.totalSupply / 10 ** asset.underlyingDecimals
          );

          poolBorrowedAssetsAmount.set(
            { id, symbol: asset.underlyingSymbol },
            asset.totalBorrow / 10 ** asset.underlyingDecimals
          );

          // USD

          poolSuppliedAssetsUSD.set(
            { id, symbol: asset.underlyingSymbol },
            ((asset.totalSupply * asset.underlyingPrice) / 1e36) * ethPrice
          );

          poolBorrowedAssetsUSD.set(
            { id, symbol: asset.underlyingSymbol },
            ((asset.totalBorrow * asset.underlyingPrice) / 1e36) * ethPrice
          );
        });

        // If we've fetched all the asset data:
        if (i === ids.length - 1) {
          console.timeEnd("assetData " + thisInterval);
        }
      });

    Promise.all([
      fetchUsersWithHealth(fuse, fusePools[i].comptroller, 1e18),
      fetchUsersWithHealth(fuse, fusePools[i].comptroller, 1.2e18),
      fetchUsersWithHealth(fuse, fusePools[i].comptroller, 1.4e18),
    ]).then(([underwaterUsersArray, atRiskUsersArray, leveragedUsersArray]) => {
      userLeverage.set(
        { id, level: "liquidatable" },
        underwaterUsersArray.length
      );
      userLeverage.set(
        { id, level: "at_risk" },
        removeDoubleCounts(atRiskUsersArray, underwaterUsersArray).length
      );
      userLeverage.set(
        { id, level: "leveraged" },
        removeDoubleCounts(leveragedUsersArray, atRiskUsersArray).length
      );

      if (i === ids.length - 1) {
        console.timeEnd("userLeverage " + thisInterval);
      }
    });
  }
};

// Event loop
setInterval(eventLoop, 10000);

// Run instantly the first time.
eventLoop();

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.listen(port, () => {
  console.log(`server started at http://localhost:${port}/metrics`);
});
