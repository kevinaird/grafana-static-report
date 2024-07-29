#!/usr/bin/env node
import { execute } from "./execute";

require('yargs')
  .scriptName("grafana-report")
  .usage('$0 <cmd> [args]')
  .command('export [url]', 'Generate static report for a grafana dashboard url', (yargs:any) => {
    yargs.option('output', {
      type: 'string',
      default: 'static/dash',
      describe: 'directory to output the file to',
      alias: 'o',
    })
    .option('username', {
        type: 'string',
        describe: 'Grafana username',
        alias: 'u',
    })
    .option('password', {
        type: 'string',
        describe: 'Grafana password',
        alias: 'p',
    })
    .demandOption(['url'],"url is required")
  }, function (argv:any) {
    console.time("execute");
    execute({ ...argv, fullRoute: argv.url })
        .then(()=>console.log("Execute completed!"))
        .catch((err:Error) => console.error("Error during execution:",err))
        .finally(()=>{
            console.timeEnd("execute");
            process.exit(0);
        });
  })
  .demandCommand(1, 'You need at least one command before moving on')
  .help()
  .argv
