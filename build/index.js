"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.alchemyURL = void 0;
const prom_client_1 = require("prom-client");
const express_1 = __importDefault(require("express"));
const fuse_node_commonjs2_js_1 = __importDefault(require("./fuse.node.commonjs2.js"));
// TODO: Change to use .env
exports.alchemyURL = `https://eth-mainnet.alchemyapi.io/v2/2Mt-6brbJvTA4w9cpiDtnbTo6qOoySnN`;
const fuse = new fuse_node_commonjs2_js_1.default(exports.alchemyURL);
const app = express_1.default();
const port = 1337;
const tvl = new prom_client_1.Gauge({
    name: "fuse_tvl",
    help: "Total $ Value Locked In Fuse",
});
const tvb = new prom_client_1.Gauge({
    name: "fuse_tvb",
    help: "Total $ Value Borrowed On Fuse",
});
// Event loop
setInterval(() => __awaiter(void 0, void 0, void 0, function* () {
    const { 2: totalSuppliedETH, 3: totalBorrowedETH, } = yield fuse.contracts.FusePoolLens.methods
        .getPublicPoolsWithData()
        .call({ gas: 1e18 });
    const ethPrice = (yield fuse.web3.utils.fromWei(yield fuse.getEthUsdPriceBN()));
    const tvlETH = totalSuppliedETH.reduce((a, b) => a + parseInt(b), 0) / 1e18;
    const tvbETH = totalBorrowedETH.reduce((a, b) => a + parseInt(b), 0) / 1e18;
    tvl.set(tvlETH * ethPrice);
    tvb.set(tvbETH * ethPrice);
}), 1000);
app.get("/metrics", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.set("Content-Type", prom_client_1.register.contentType);
    res.end(yield prom_client_1.register.metrics());
}));
app.listen(port, () => {
    console.log(`server started at http://localhost:${port}`);
});
