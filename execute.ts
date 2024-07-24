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
    log: Function,
}

export async function execute({ 
    fullRoute, output, verbose=false,   
    log=console.log,
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

    const dataSourceQueryRE = new RegExp("https?://[^/]+/api/ds/query");

    while (!success && tryCounter <= 3) {
        try {
            log("new page...");
            const page = await browser.newPage();

            dataSourceQueries  = {};

            page
              .on('console', message => log(`${message.type().toUpperCase()}: ${message.text()}`))
              .on('pageerror', ({ message }) => log(message))

              // Intercept all /api/ds/query calls and save responses
              .on('response', async(response) => {
                    const request = response.request();
                    
                    if(!dataSourceQueryRE.test(request.url())) return;

                    if(!response) return request.continue();
                
                    const responseHeaders = response.headers();
                    const responseBody = await response.text();

                    const u = new URL(request.url());

                    dataSourceQueries[request.url()] = {
                        url: request.url(),
                        query: Object.fromEntries(u.searchParams),
                        headers: responseHeaders,
                        body:  responseBody ? responseBody.toString():"",
                    };
               })

            // TODO - How to handle collapsed panels
            
            log("goto",fullRoute);
            await page.goto(fullRoute,{
                waitUntil: 'networkidle0',
            });

            log("wait for selector...");
            await page.waitForSelector('#reactRoot .grafana-app .main-view', {
                visible: true,
            });

            // log("test changing everything....");
            // await page.evaluate(()=>{
            //     document.getElementsByClassName("main-view")[0].innerHTML = "hello world";
            // });

            log("convert canvases to images...");
            await page.evaluate(() => {
                const canvas_list = Array.from(document.getElementsByTagName("canvas"));
                console.log("canvas_list.length=",canvas_list.length);

                return canvas_list.map((canvas,i) => {
                    const img = canvas.toDataURL();
                    canvas.outerHTML = `<img src="${img}" style="width: 100%; height:100%;" />`;
                });
            });

            log("fix overflows....");
            await page.$$eval('[data-testid="data-testid panel content"] .scrollbar-view',elements => {
                return elements.map(e => {
                    (e as HTMLElement).style.overflow = "hidden";
                    return e;
                });
            });

            log("hide grafana navs...");
            await page.$$eval('nav',elements => {
                return elements.map(e => {
                    (e as HTMLElement).style.display = "none";
                    return e;
                });
            });

            log("hide grafana header...");
            await page.$eval('header',e => {
                (e as HTMLElement).style.display = "none";
            });
            await page.$eval('header+div',e => {
                (e as HTMLElement).style.paddingTop = "0px";
            });

            log("hide grafana warnings...");
            await page.$$eval('[data-testid="data-testid Alert warning"]',elements => {
                return elements.map(e => {
                    (e as HTMLElement).style.display = "none";
                    return e;
                });
            });

            await page.setJavaScriptEnabled(false);
            // log("canvasReplacements.length=",canvasReplacements.length);

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
            
            // html = await page.evaluate(() => document.documentElement.outerHTML);

            // await page.evaluate(()=> {
            //     Array.from(document.getElementsByTagName("link"))
            //         .forEach(link => link.setAttribute("crossorigin","anonymous"))
            // });

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

    // const $ = cheerio.load(html);
    // $('canvas').each((i,canvas) => {
    //     $(canvas).replaceWith(canvasReplacements[i]);
    // });
    // // $('html > head').append(`<styles>${styles}</styles>`);
    // html = $.html();
    
    // log("extract media from mhtml....");
    // const media = mhtml2html.parse(mhtml, { parseDOM: (html:string) => new JSDOM(html) });
    // const media_doc = JSON.stringify(media,null,3);
     
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
