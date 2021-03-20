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
const prom_client_1 = require("prom-client");
const express_1 = __importDefault(require("express"));
const app = express_1.default();
const port = 1337;
const c = new prom_client_1.Counter({
    name: "test_counter",
    help: "Example of a counter",
    labelNames: ["code"],
});
setInterval(() => {
    c.inc({ code: 200 });
}, 1000);
app.get("/metrics", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.set("Content-Type", prom_client_1.register.contentType);
    res.end(yield prom_client_1.register.metrics());
}));
app.listen(port, () => {
    console.log(`server started at http://localhost:${port}`);
});
