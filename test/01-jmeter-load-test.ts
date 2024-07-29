import { execute } from "../execute";
import * as path from 'path';
import * as fs from 'fs';

const assert = require("assert");

describe("jmeter-load-test", () => {
    it("can generate a report", async function() {
        this.timeout(120*1000);

        const output = process.env.UNIT_TESTOUTPUT ?? path.join(__dirname,"output/jmeter-load-test");

        await execute({
            fullRoute: "http://localhost:3000/d/QMfGnEuSz/jmeter-load-test?orgId=1&from=now-1h&to=now",
            output,
            verbose: true,
            username: "admin",
            password: "admin",
            log: console.log,
            warn: console.warn,
        });

        const mhtml_stats = await fs.promises.stat(`${output}.mhtml`);
        const json_stats = await fs.promises.stat(`${output}.datasources.json`);

        console.log("mhtml=",mhtml_stats);
        console.log("json=",json_stats);

        assert(mhtml_stats.size > 0);
        assert(json_stats.size > 0);
    })
})