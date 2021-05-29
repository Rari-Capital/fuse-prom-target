import client, { Gauge, register } from "prom-client";
client.collectDefaultMetrics();

import express from "express";
import fetch from "node-fetch";
import chalk from "chalk";

import Web3 from "web3";

import Fuse from "./fuse.node.commonjs2.js";

const fuse = new Fuse("https://turbogeth.crows.sh");
const alcxStakingAccount = "0x5ea4a9a7592683bf0bc187d6da706c6c4770976f";
const alcxStakingContract = new fuse.web3.eth.Contract(
  require("../abis/StakingPools.json"),
  "0xab8e74017a8cc7c15ffccd726603790d26d7deca"
);

let userLeverage = new Gauge({
  name: "fuse_userLeverage",
  help: "Stores how many users are at different levels of leverage.",
  // Levels: at_risk, liquidatable
  labelNames: ["id", "level"] as const
});

let poolAssetsInterestRate = new Gauge({
  name: "fuse_pool_assets_interest_rate",
  help: "Stores the interest rates of each asset in each pool.",
  // Side: borrow, supply
  labelNames: ["id", "symbol", "side"] as const
});

let poolRSS = new Gauge({
  name: "fuse_pool_rss",
  help: "Stores the RSS score of each pool.",
  labelNames: ["id"] as const
});

let poolSuppliedAssetsAmount = new Gauge({
  name: "fuse_pool_assets_supply_amount",
  help: "Stores how much of each asset is supplied in each pool.",
  labelNames: ["id", "symbol"] as const
});

let poolBorrowedAssetsAmount = new Gauge({
  name: "fuse_pool_assets_borrow_amount",
  help: "Stores how much of each asset is borrowed in each pool.",
  labelNames: ["id", "symbol"] as const
});

let poolSuppliedAssetsUSD = new Gauge({
  name: "fuse_pool_assets_supply_usd",
  help: "Stores how much of each asset is supplied in each pool.",
  labelNames: ["id", "symbol"] as const
});

let poolBorrowedAssetsUSD = new Gauge({
  name: "fuse_pool_assets_borrow_usd",
  help: "Stores how much of each asset is borrowed in each pool.",
  labelNames: ["id", "symbol"] as const
});

let poolAssetsEvents = new Gauge({
  name: "fuse_pool_assets_events",
  help: "Stores each type of event that occurs on each asset in each pool.",
  labelNames: ["id", "symbol", "event"] as const
});

let poolAssetsReservesAmount = new Gauge({
  name: "fuse_pool_assets_reserves_amount",
  help: "Stores how much of each asset is in reserves in each pool.",
  labelNames: ["id", "symbol"] as const
});

let poolAssetsReservesUSD = new Gauge({
  name: "fuse_pool_assets_reserves_usd",
  help: "Stores how much of each asset is in reserves in each pool.",
  labelNames: ["id", "symbol"] as const
});

let poolAssetsFeesAmount = new Gauge({
  name: "fuse_pool_assets_fees_amount",
  help: "Stores how much of each asset has been taken as fees in each pool.",
  labelNames: ["id", "symbol"] as const
});

let poolAssetsFeesUSD = new Gauge({
  name: "fuse_pool_assets_fees_usd",
  help: "Stores how much of each asset has been taken as fees in each pool.",
  labelNames: ["id", "symbol"] as const
});

let stakedALCXUSD = new Gauge({
  name: "fuse_staked_alcx_usd",
  help: "Stores how much protocol controlled ALCX is currently being staked."
});

let stakedALCXUnclaimedUSD = new Gauge({
  name: "fuse_staked_alcx_unclaimed_usd",
  help: "Stores how much protocol controlled ALCX is claimable from staking."
});

let stakedALCXAmount = new Gauge({
  name: "fuse_staked_alcx_amount",
  help: "Stores how much protocol controlled ALCX is currently being staked."
});

let stakedALCXUnclaimedAmount = new Gauge({
  name: "fuse_staked_alcx_unclaimed_amount",
  help: "Stores how much protocol controlled ALCX is claimable from staking."
});

function fetchUsersWithHealth(
  fuse: any,
  comptroller: string,
  maxHealth: number
) {
  return fuse.contracts.FusePoolLens.methods
    .getPoolUsersWithData(comptroller, fuse.web3.utils.toBN(maxHealth))
    .call()
    .then((result: { account: string; totalBorrow: number }[][]) =>
      result[0]
        .filter(user => {
          // Filter out users that are borrowing less than 0.1 ETH
          return user.totalBorrow / 1e18 > 0.1;
        })
        .map(data => data.account)
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

type Task =
  | "rss"
  | "events"
  | "user_leverage"
  | "reserves/fees"
  | "staked_alcx";

let lastRun: { [key in Task]: number } = {
  rss: 0,
  events: 0,
  user_leverage: 0,
  "reserves/fees": 0,
  staked_alcx: 0
};

function runEvery(key: Task, seconds: number) {
  const ms = seconds * 1000;

  const now = Date.now();

  const msPassed = Date.now() - lastRun[key];

  if (msPassed >= ms) {
    setTimeout(() => {
      lastRun[key] = now;
    }, 1000);

    console.log(
      chalk.green(
        `Running ${key} now! It will be ${seconds} seconds until the next run.`
      )
    );

    return true;
  } else {
    console.log(
      chalk.yellow(
        `Skipping ${key}. There are ${((ms - msPassed) / 1000).toFixed(
          2
        )} seconds left until the next run.`
      )
    );
  }
}

async function eventLoop() {
  const [{ 0: ids, 1: fusePools }, ethPrice] = await Promise.all([
    fuse.contracts.FusePoolLens.methods
      .getPublicPoolsWithData()
      .call({ gas: 1e18 }),
    fuse.web3.utils.fromWei(await fuse.getEthUsdPriceBN()) as number
  ]);

  console.log("Fetched base data...");

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];

    console.log("Fetching pool #", id);

    if (runEvery("rss", 600 /* 10 mins */)) {
      fetch(`https://app.rari.capital/api/rss?poolID=${id}`)
        .then(res => res.json())
        .then(data => {
          console.log(
            "Fetching RSS for pool #",
            id,
            "which was last updated",
            data.lastUpdated
          );

          poolRSS.set({ id }, data.totalScore);
        });
    }

    fuse.contracts.FusePoolLens.methods
      .getPoolAssetsWithData(fusePools[i].comptroller)
      .call({
        from: "0x0000000000000000000000000000000000000000",
        gas: 1e18
      })
      .then((assets: FuseAsset[]) => {
        assets.forEach(asset => {
          console.log("Updating general data", asset.underlyingSymbol);

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

          // Interst Rates

          const supplyAPY =
            (Math.pow(
              (asset.supplyRatePerBlock / 1e18) * (4 * 60 * 24) + 1,
              365
            ) -
              1) *
            100;

          const borrowAPY =
            (Math.pow(
              (asset.borrowRatePerBlock / 1e18) * (4 * 60 * 24) + 1,
              365
            ) -
              1) *
            100;

          poolAssetsInterestRate.set(
            { id, symbol: asset.underlyingSymbol, side: "supply" },
            supplyAPY
          );

          poolAssetsInterestRate.set(
            { id, symbol: asset.underlyingSymbol, side: "borrow" },
            borrowAPY
          );

          if (runEvery("reserves/fees", 600 /* 10 minutes */)) {
            const cToken = new fuse.web3.eth.Contract(
              JSON.parse(
                fuse.compoundContracts[
                  "contracts/CEtherDelegate.sol:CEtherDelegate"
                ].abi
              ),
              asset.cToken
            );

            cToken.methods
              .totalReserves()
              .call()
              .then(reserves => {
                poolAssetsReservesAmount.set(
                  { symbol: asset.underlyingSymbol, id },
                  reserves / 10 ** asset.underlyingDecimals
                );

                poolAssetsReservesUSD.set(
                  { symbol: asset.underlyingSymbol, id },
                  ((reserves * asset.underlyingPrice) / 1e36) * ethPrice
                );
              });

            cToken.methods
              .totalFuseFees()
              .call()
              .then(fuseFees => {
                poolAssetsFeesAmount.set(
                  { symbol: asset.underlyingSymbol, id },
                  fuseFees / 10 ** asset.underlyingDecimals
                );

                poolAssetsFeesUSD.set(
                  { symbol: asset.underlyingSymbol, id },
                  ((fuseFees * asset.underlyingPrice) / 1e36) * ethPrice
                );
              });
          }

          if (runEvery("events", 60 /* 1 minute */)) {
            const cToken = new fuse.web3.eth.Contract(
              JSON.parse(
                fuse.compoundContracts[
                  "contracts/CEtherDelegate.sol:CEtherDelegate"
                ].abi
              ),
              asset.cToken
            );

            cToken
              .getPastEvents("allEvents", {
                fromBlock: 12060000,
                toBlock: "latest"
              })
              .then(events => {
                let eventCounts: { [key: string]: number } = {};

                events.forEach(event => {
                  if (event.event === undefined) {
                    return;
                  }

                  if (eventCounts[event.event] === undefined) {
                    eventCounts[event.event] = 1;
                  } else {
                    eventCounts[event.event] += 1;
                  }
                });

                Object.keys(eventCounts).forEach(eventName => {
                  poolAssetsEvents.set(
                    { id, symbol: asset.underlyingSymbol, event: eventName },
                    eventCounts[eventName]
                  );
                });
              });
          }

          // Staked ALCX tracking
          if (
            asset.underlyingToken.toLowerCase() ===
              "0xdbdb4d16eda451d0503b854cf79d55697f90c8df".toLowerCase() &&
            runEvery("staked_alcx", 60 /* 1 minute */)
          ) {
            alcxStakingContract.methods
              .getStakeTotalDeposited(alcxStakingAccount, "1")
              .call()
              .then(staked => {
                stakedALCXUSD.set(
                  ((staked * asset.underlyingPrice) / 1e36) * ethPrice
                );
                stakedALCXAmount.set(staked / 1e18);
              });

            alcxStakingContract.methods
              .getStakeTotalUnclaimed(alcxStakingAccount, "1")
              .call()
              .then(unclaimed => {
                stakedALCXUnclaimedUSD.set(
                  ((unclaimed * asset.underlyingPrice) / 1e36) * ethPrice
                );
                stakedALCXUnclaimedAmount.set(unclaimed / 1e18);
              });
          }
        });
      });

    if (runEvery("user_leverage", 30 /* 30 secs */)) {
      Promise.all([
        fetchUsersWithHealth(fuse, fusePools[i].comptroller, 1e18),
        fetchUsersWithHealth(fuse, fusePools[i].comptroller, 1.1e18)
      ]).then(([underwaterUsersArray, atRiskUsersArray]) => {
        console.log("Fetching leverage data", id);

        userLeverage.set(
          { id, level: "liquidatable" },
          underwaterUsersArray.length
        );
        userLeverage.set(
          { id, level: "at_risk" },
          removeDoubleCounts(atRiskUsersArray, underwaterUsersArray).length
        );
      });
    }
  }

  setTimeout(() => console.log("\n\n\n\n\n\n\n\n\n"), 2_500);
}

// Event loop (every 15 secs)
setInterval(eventLoop, 15_000);

// Run instantly the first time.
eventLoop();

const arb1 = new Web3("https://arb1.arbitrum.io/rpc");
const arbStats = new arb1.eth.Contract(
  require("../abis/ArbStatistics.json"),
  "0x000000000000000000000000000000000000006F"
);
const arbGasInfo = new arb1.eth.Contract(
  require("../abis/ArbGasInfo.json"),
  "0x000000000000000000000000000000000000006C"
);

let arbitrumBlocks = new Gauge({
  name: "arbitrum_blocks",
  help: "Stores how many Arbitrum blocks have been generated."
});

let arbitrumAccounts = new Gauge({
  name: "arbitrum_accounts",
  help: "Stores how many Arbitrum accounts have been generated."
});

let arbitrumStorage = new Gauge({
  name: "arbitrum_storage",
  help: "Stores how many Arbitrum storage slots have been generated."
});

let arbitrumGas = new Gauge({
  name: "arbitrum_gas",
  help: "Stores how many Arbitrum gas units have been consumed."
});

let arbitrumTransactions = new Gauge({
  name: "arbitrum_transactions",
  help: "Stores how many Arbitrum transactions have been generated."
});

let arbitrumContracts = new Gauge({
  name: "arbitrum_contracts",
  help: "Stores how many Arbitrum contracts have been created."
});

let arbitrumGasPrices = new Gauge({
  name: "arbitrum_gasPrices_usd",
  help: "Stores the gas in USD of many Arbitrum actions.",
  labelNames: ["action"] as const
});

let arbitrumGasPricesArbGas = new Gauge({
  name: "arbitrum_gasPrices_arbGas",
  help: "Stores the arbGas price of many Arbitrum events.",
  labelNames: ["action"] as const
});

let arbitrumGasSpeedLimit = new Gauge({
  name: "arbitrum_gasSpeedLimit",
  help: "Stores the ArbGas speed limit (per second)."
});

let arbitrumMaxTransactionGasLimit = new Gauge({
  name: "arbitrum_maxTxGasLimit",
  help: "Stores the ArbGas speed limit for a single tx."
});

async function arbitrumEventLoop() {
  const [blocks, accounts, slots, gas, txs, contracts] = await arbStats.methods
    .getStats()
    .call();

  const ethPrice = fuse.web3.utils.fromWei(
    await fuse.getEthUsdPriceBN()
  ) as number;

  arbitrumBlocks.set(parseInt(blocks));
  arbitrumAccounts.set(parseInt(accounts));
  arbitrumStorage.set(parseInt(slots));
  arbitrumGas.set(parseInt(gas));
  arbitrumTransactions.set(parseInt(txs));
  arbitrumContracts.set(parseInt(contracts));

  const [l2Tx, l1Calldata, storageAllocation, base, congestion, total] =
    await arbGasInfo.methods.getPricesInWei().call();

  arbitrumGasPrices.set(
    { action: "l1Calldata" },
    (l1Calldata / 1e18) * ethPrice
  );
  arbitrumGasPrices.set(
    { action: "storageAllocation" },
    (storageAllocation / 1e18) * ethPrice
  );
  arbitrumGasPrices.set(
    { action: "congestion" },
    (congestion / 1e18) * ethPrice
  );
  arbitrumGasPrices.set({ action: "l2Tx" }, (l2Tx / 1e18) * ethPrice);
  arbitrumGasPrices.set({ action: "base" }, (base / 1e18) * ethPrice);
  arbitrumGasPrices.set({ action: "total" }, (total / 1e18) * ethPrice);

  const [speedLimitPerSecond, gasPoolMax, maxTxGasLimit] =
    await arbGasInfo.methods.getGasAccountingParams().call();

  arbitrumGasSpeedLimit.set(parseInt(speedLimitPerSecond));
  arbitrumMaxTransactionGasLimit.set(parseInt(maxTxGasLimit));

  {
    const [l2Tx, l1Calldata, storageAllocation] = await arbGasInfo.methods
      .getPricesInArbGas()
      .call();

    arbitrumGasPricesArbGas.set({ action: "l2Tx" }, parseInt(l2Tx));
    arbitrumGasPricesArbGas.set({ action: "l1Calldata" }, parseInt(l1Calldata));
    arbitrumGasPricesArbGas.set(
      { action: "storageAllocation" },
      parseInt(storageAllocation)
    );
  }
}

// Event loop (every 35 secs)
setInterval(arbitrumEventLoop, 35_000);

// Run instantly the first time.
arbitrumEventLoop();

const app = express();
const port = 1336;

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.listen(port, () => {
  console.log(`Target server started at http://localhost:${port}/metrics`);
});
