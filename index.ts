import { Gauge, register } from "prom-client";
import express from "express";

// TODO: Use exported commonjs build from fuse-sdk once added
import Fuse from "./fuse.node.commonjs2.js";

// TODO: Change to use .env
export const alchemyURL = `https://eth-mainnet.alchemyapi.io/v2/2Mt-6brbJvTA4w9cpiDtnbTo6qOoySnN`;
const fuse = new Fuse(alchemyURL);

const app = express();
const port = 1337;

let underwaterUsers = new Gauge({
  name: "fuse_underwaterUsers",
  help: "Users who need to be liquidated.",
});

let atRiskUsers = new Gauge({
  name: "fuse_atRiskUsers",
  help:
    "Users who are <20% away from liquidation. Does not count underwater users.",
});

let leveragedUsers = new Gauge({
  name: "fuse_leveragedUsers",
  help:
    "Users who are <40% away from liquidation. Does not count at risk users.",
});

let poolTVL = new Gauge({
  name: "fuse_pool_tvl",
  help: "Total $ Value Supplied On Each Pool",
  labelNames: ["id"] as const,
});

let poolTVB = new Gauge({
  name: "fuse_pool_tvb",
  help: "Total $ Value Borrowed On Each Pool",
  labelNames: ["id"] as const,
});

let poolSuppliedAssets = new Gauge({
  name: "fuse_pool_assets_supply",
  help: "Stores how much of each asset is supplied in each pool.",
  labelNames: ["id", "symbol"] as const,
});

let poolBorrowedAssets = new Gauge({
  name: "fuse_pool_assets_borrow",
  help: "Stores how much of each asset is borrowed in each pool.",
  labelNames: ["id", "symbol"] as const,
});

function fetchusersWithHealth(fuse: any, maxHealth: number) {
  return fuse.contracts.FusePoolLens.methods
    .getPublicPoolUsersWithData(fuse.web3.utils.toBN(maxHealth))
    .call()
    .then((result: { account: string }[][][]) =>
      result[1].flat().map((data) => data.account)
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

// Event loop
setInterval(async () => {
  const {
    0: ids,
    1: fusePools,
    2: totalSuppliedETH,
    3: totalBorrowedETH,
  } = await fuse.contracts.FusePoolLens.methods
    .getPublicPoolsWithData()
    .call({ gas: 1e18 });

  const ethPrice: number = (await fuse.web3.utils.fromWei(
    await fuse.getEthUsdPriceBN()
  )) as any;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];

    const usdTVL = (totalSuppliedETH[i] / 1e18) * ethPrice;
    const usdTVB = (totalBorrowedETH[i] / 1e18) * ethPrice;

    poolTVL.set({ id }, usdTVL);
    poolTVB.set({ id }, usdTVB);

    const assets: FuseAsset[] = await fuse.contracts.FusePoolLens.methods
      .getPoolAssetsWithData(fusePools[i].comptroller)
      .call({ from: "0x0000000000000000000000000000000000000000", gas: 1e18 });

    assets.forEach((asset) => {
      poolSuppliedAssets.set(
        { id, symbol: asset.underlyingSymbol },
        asset.totalSupply / 10 ** asset.underlyingDecimals
      );

      poolBorrowedAssets.set(
        { id, symbol: asset.underlyingSymbol },
        asset.totalBorrow / 10 ** asset.underlyingDecimals
      );
    });
  }

  const underwaterUsersArray = await fetchusersWithHealth(fuse, 1e18);
  underwaterUsers.set(underwaterUsersArray.length);

  const atRiskUsersArray = await fetchusersWithHealth(fuse, 1.2e18);
  atRiskUsers.set(
    removeDoubleCounts(atRiskUsersArray, underwaterUsersArray).length
  );

  const leveragedUsersArray = await fetchusersWithHealth(fuse, 1.4e18);
  leveragedUsers.set(
    removeDoubleCounts(leveragedUsersArray, atRiskUsersArray).length
  );
}, 1000);

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.listen(port, () => {
  console.log(`server started at http://localhost:${port}/metrics`);
});
