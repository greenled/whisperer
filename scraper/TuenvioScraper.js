const { inherits } = require("util");
const { EventEmitter } = require("events");
const puppeteer = require("puppeteer");
const events = require("./events");
const states = require("./states");

function TuenvioScraper(options) {
  const _options = options;
  let _browser = undefined;
  let _state = states.notInitialized;

  const _initialize = async () => {
    _state = states.initializing;

    _browser && _browser.removeAllListeners();

    const browserDefaults = {
      headless: true,
      args: [
        "--lang=en-GB",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
      defaultViewport: null,
      pipe: true,
      slowMo: 10,
    };

    const options = Object.assign({}, browserDefaults, _options);

    _browser = await puppeteer.launch(options);

    _browser.on(events.puppeteer.browser.disconnected, () => {
      this.emit(events.puppeteer.browser.disconnected);
    });

    _browser.on(events.puppeteer.browser.targetcreated, () => {
      this.emit(events.puppeteer.browser.targetcreated);
    });

    _browser.on(events.puppeteer.browser.targetchanged, () => {
      this.emit(events.puppeteer.browser.targetchanged);
    });

    _browser.on(events.puppeteer.browser.targetdestroyed, () => {
      this.emit(events.puppeteer.browser.targetdestroyed);
    });

    _state = states.initialized;
  };

  const _run = async (baseUrl, depPids) => {
    if (!_browser) {
      await _initialize();
    }

    const page = await _browser.newPage();
    page.setDefaultTimeout(options.timeout);
    await page.setRequestInterception(true);

    const resourcesToBlock = [
      "image",
      "stylesheet",
      "media",
      "font",
      "texttrack",
      "object",
      "beacon",
      "csp_report",
      "imageset",
    ];

    page.on("request", (request) => {
      if (
        resourcesToBlock.some((r) => request.resourceType() === r) ||
        request.url().includes(".jpg") ||
        request.url().includes(".jpeg") ||
        request.url().includes(".png") ||
        request.url().includes(".gif") ||
        request.url().includes(".css")
      ) {
        request.abort();
      } else {
        request.continue();
      }
    });

    for (depPid of depPids) {
      const url = `${baseUrl}Products?depPid=${depPid}`;
      console.info(`Scraping ${url}`);

      await page.goto(url, {
        waitLoad: true,
        waitNetworkIdle: true,
      });

      const productNodesTot = await page.evaluate(
        (_) => document.querySelectorAll("ul.hProductItems li").length
      );
      let products = [];
      for (
        let productNodeIndex = 0;
        productNodeIndex < productNodesTot;
        productNodeIndex++
      ) {
        let title, url, image, price;
        [title, url, image, price] = await page.evaluate((productNodeIndex) => {
          return [
            document.querySelectorAll(".thumbTitle a")[productNodeIndex]
              .innerText,
            document
              .querySelectorAll(".thumbTitle a")
              [productNodeIndex].getAttribute("href"),
            document
              .querySelectorAll(".thumbnail img")
              [productNodeIndex].getAttribute("src"),
            document.querySelectorAll(".thumbPrice span")[productNodeIndex]
              .innerText,
          ];
        }, productNodeIndex);
        this.emit(events.custom.data, {
          title: title,
          url: `${baseUrl}${url}`,
          image: image,
          price: price,
        });
      }
    }

    await page.close();

    this.emit(events.custom.end);
  };

  this.run = async (baseUrl, depPids) => {
    try {
      if (_state === states.notInitialized) {
        await _initialize();
      } else if (_state === states.initializing) {
        const timeout = 10000;
        const waitTime = 10;
        let elapsed = 0;

        while (_state !== states.initialized) {
          await wait(waitTime);
          elapsed += waitTime;

          if (elapsed >= timeout) {
            throw new Error(`Initialize timeout exceeded: ${timeout}ms`);
          }
        }
      }

      await _run(baseUrl, depPids);
    } catch (err) {
      console.error(err);
      this.emit(events.custom.error, err);
    }
  };

  this.close = async () => {
    _browser && _browser.removeAllListeners() && (await _browser.close());
    _browser = undefined;
    _state = states.notInitialized;
  };
}

inherits(TuenvioScraper, EventEmitter);

module.exports = TuenvioScraper;
