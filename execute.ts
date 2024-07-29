import * as fs from 'fs';
import { mkdirp } from 'mkdirp';
import * as path from 'path';
import * as puppeteer from 'puppeteer';
// import * as cheerio from 'cheerio';
import { URL } from 'url';

// const mhtml2html = require('mhtml2html');
// const { JSDOM } = require('jsdom');

export interface executeParams {
    fullRoute: string,
    output: string,
    verbose: boolean,
    username: string,
    password: string,
    log: Function,
    warn: Function,
}

export async function execute({ 
    fullRoute, output, verbose=false,   
    log=console.log,
    warn=console.warn,
    username, password,
}: executeParams) {

    output = output ?? path.join(__dirname,"static","dash")
    await mkdirp(path.dirname(output));

    log("Launching puppeteer...");
    const browser = await puppeteer.launch({
        headless: true,
        devtools: true,
        args: [
            '--disable-web-security',
            '--disable-features=IsolateOrigins',
            '--disable-site-isolation-trials',
            '--no-sandbox',
        ],
        defaultViewport: {
            width: 1680,
            height: 1050,
        },
    });

    // const fullRoute = "https://play.grafana.org/d/a42e82b0-1971-4dc9-8a74-7577142f19a3/8b9cb853-54c5-51bb-b17e-8bab90267e5f";
    log(`Statisfying ${fullRoute}...`);

    let mhtml : string = "";
    let raw_html : string = "";
    let styles : string = "";
    let success = false;
    let tryCounter = 0;
    let dataSourceQueries : {[key: string]: object} = {};

    const vlog = verbose ? log : () => {};
    const dataSourceQueryRE = new RegExp("https?://.*/api/(datasources|ds)/(query|proxy)");

    while (!success && tryCounter <= 3) {
        try {
            log("new page...");
            const page = await browser.newPage();

            await page.setDefaultNavigationTimeout(120000);

            if(username) {
                const auth_string = `${username}:${password}`;
                const auth_header = 'Basic ' + new (Buffer.from as any)(auth_string).toString('base64');
                await page.setExtraHTTPHeaders({'Authorization': auth_header});
                log("Using auth header...",auth_header);
            }

            dataSourceQueries  = {};

            page
              .on('console', message => {
                vlog(`${message.type().toUpperCase()}: ${message.text()}`)
               })
              .on('pageerror', ({ message }) => {
                vlog(message)
              })
              // Intercept all /api/ds/query calls and save responses
              .on('response', async(response) => {
                    const request = response.request();
                    const req_url = request.url();

                    if(!dataSourceQueryRE.test(req_url)) return;

                    if(!response) return request.continue();
                
                    const responseHeaders = response.headers();
                    const responseBody = await response.text();

                    const u = new URL(req_url);
                    vlog(`Intercepted response: ${req_url}`)

                    dataSourceQueries[req_url] = {
                        url: req_url,
                        query: Object.fromEntries(u.searchParams),
                        headers: responseHeaders,
                        body:  responseBody ? responseBody.toString():"",
                    };
               })

            log("goto",fullRoute);
            await page.goto(fullRoute,{
                waitUntil: 'networkidle0',
            });

            log("wait for selector...");
            await page.waitForSelector('#reactRoot .grafana-app .main-view', {
                visible: true,
            });

            try {
                log("expand all collapsed content....")
                await page.$$eval('.dashboard-row--collapsed > button',elements => {
                    return elements.map(b => (b as HTMLElement).click());
                });
            } catch(err) {
                warn("Unable to expand all collapsed content",err);
            }

            try {
                log("get all lazy loaded content....") // doesnt work with virtual tables
                await page.evaluate(async ()=>{
                    return await Promise.all(Array.from(document.querySelectorAll('.scrollbar-view')).map(async elem => {
                        const s = (elem as HTMLElement);
                        for(let i = 0; i < s.offsetHeight; i+= 10) {
                            s.scrollTo(0,i);
                            await new Promise(cb=>setTimeout(cb,10));
                        }
                        s.scrollTo(0,0);
                    }));
                });
            } catch(err) {
                warn("Unable to get all lazy loaded content",err);
            }

            try {
                log("convert canvases to images...");
                await page.evaluate(() => {
                    const canvas_list = Array.from(document.getElementsByTagName("canvas"));
                    console.log("canvas_list.length=",canvas_list.length);

                    return canvas_list.map((canvas,i) => {
                        const img = canvas.toDataURL();
                        canvas.outerHTML = `<img src="${img}" style="width: 100%; height:100%;" />`;
                    });
                });
            } catch(err) {
                warn("Unable to convert all canvases to images",err);
            }

            try {
                log("fix overflows....");
                await page.$$eval('[data-testid="data-testid panel content"] .scrollbar-view',elements => {
                    return elements.map(e => {
                        (e as HTMLElement).style.overflow = "hidden";
                        return e;
                    });
                });
            } catch(err) {
                warn("Unable to fix overflows")
            }

            try {
                log("hide grafana navs...");
                await page.$$eval('nav',elements => {
                    return elements.map(e => {
                        (e as HTMLElement).style.display = "none";
                        return e;
                    });
                });
            } catch(err) {
                warn("Unable to hide grafana navs")
            }

            try {
                log("hide grafana header...");
                await page.$eval('header',e => {
                    (e as HTMLElement).style.display = "none";
                });
                await page.$eval('header+div',e => {
                    (e as HTMLElement).style.paddingTop = "16px";
                });
            } catch(err) {
                warn("Unable to hide grafana header",err);
            }

            try {
                log("hide grafana warnings...");
                await page.$$eval('[data-testid="data-testid Alert warning"]',elements => {
                    return elements.map(e => {
                        (e as HTMLElement).style.display = "none";
                        return e;
                    });
                });
            } catch(err) {
                warn("Unable to hide all grafana warnings",err);
            }

            await page.setJavaScriptEnabled(false);

            await new Promise(cb => setTimeout(cb, 3*1000));

            log("take screenshot...");
            await page.screenshot({
                path: output+".jpg"
            });

            log("Dump raw html...");
            raw_html = await page.content();

            log("Dump mhtml...");
            const client = await page.target().createCDPSession();
            const response = await client.send('Page.captureSnapshot');
            mhtml = response.data;
            
            log("Dump styles...");
            styles = await page.evaluate(() => {
                const { styleSheets } = document;
                
                const CSSOMSheets = Array.from(styleSheets).filter((sheet) => {
                  const hasHref = Boolean(sheet.href);
                  //@ts-expect-error - too hard to Typescriptify
                  const hasStylesInDOM = (sheet.ownerNode?.innerText?.length || 0) > 0;
                  return sheet.cssRules && !hasHref! && !hasStylesInDOM;
                });
              
                const CSSOMStylesText = CSSOMSheets.map((sheet) =>
                  Array.from(sheet.cssRules)
                    .map((rule) => rule.cssText)
                    .join("")
                ).join("");

                return CSSOMStylesText;
            });

            log("close page...");
            await page.close();
            success = true;
        } catch (e) {
            console.warn(`Could not evaluate ${fullRoute} in try ${tryCounter++}.`);
            console.warn(`Error: ${e}`);
        }
    }

    if (!success) {
        console.error(`Could not evaluate ${fullRoute} in ${tryCounter} tries.`);
        return;
    }

    log("writing static content..",output);

    await fs.promises.writeFile(output+".mhtml", mhtml);
    // await fs.promises.writeFile(output+".json", media_doc);
    // await fs.promises.writeFile(output+".html", html);
    await fs.promises.writeFile(output+".raw.html", raw_html);
    await fs.promises.writeFile(output+".css", styles);

    const rawDS = JSON.stringify({ datasources: Object.values(dataSourceQueries) },null,3);
    await fs.promises.writeFile(output+".datasources.json", rawDS);

    log("static content written!",output);

    await browser.close();
}
