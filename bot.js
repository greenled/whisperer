const { Telegraf } = require("telegraf");
const Telegram = require("telegraf/telegram");
const session = require("telegraf/session");
const events = require("./scraper/events");
const TuenvioScraper = require("./scraper/TuenvioScraper");
const [
  commands,
  startCommandHandler,
  helpCommandHandler,
  addCommandHandler,
] = require("./commands");
const [settingsMenu] = require("./menus");
const [stage] = require("./wizards");
const express = require("express");
const mongoose = require("mongoose");
const Preferences = require("./models/Preferences");

(async () => {
  const PORT = process.env.PORT;
  const URL = process.env.URL;
  const DB_URL = process.env.DB_URL;
  const token = process.env.BOT_TOKEN;
  const baseUrl = process.env.BASE_URL;
  const depPids = process.env.DEP_PIDS.split(",");
  const bot = new Telegraf(token);
  const telegram = new Telegram(token);
  const expressApp = express();

  mongoose.connect(DB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  const db = mongoose.connection;
  db.on("error", console.error.bind(console, "MongoDB connection error:"));

  telegram.setMyCommands(commands);

  expressApp.use(bot.webhookCallback(`/bot${token}`));
  bot.telegram.setWebhook(`${URL}/bot${token}`);

  bot.start(startCommandHandler);
  bot.use(
    settingsMenu.init({
      backButtonText: "Volver…",
      mainMenuButtonText: "Volver al menú principal…",
    })
  );
  bot.help(helpCommandHandler);
  bot.command("add", addCommandHandler);
  bot.use(session());
  bot.use(stage.middleware());

  setInterval(async () => {
    try {
      const options = {
        timeout: 60000,
      };

      const scraper = new TuenvioScraper(options);
      scraper.on(events.custom.data, async ({ title, url, image, price }) => {
        const allPreferences = await Preferences.find();
        for (const preferences of allPreferences) {
          if (
            preferences.alerts.some(
              (alert) =>
                title.toLowerCase().includes(alert.term.toLowerCase()) &&
                alert.exceptions.every(
                  (exception) =>
                    !title.toLowerCase().includes(exception.toLowerCase())
                )
            )
          ) {
            await telegram.sendMessage(
              preferences.chatId,
              `${title} (${price}) ${url}`
            );
          }
        }
      });
      scraper.on(
        events.custom.error,
        console.error.bind(console, "Scraping error:")
      );
      await scraper.run(baseUrl, depPids);
      await scraper.close();
    } catch (err) {
      console.log(err.stack);
    }
  }, 300000);

  expressApp.get("/", (req, res) => {
    res.send("Hello World!");
  });
  expressApp.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})().catch((err) => console.error(err));
