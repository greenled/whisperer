const { Telegraf } = require("telegraf");
const Telegram = require("telegraf/telegram");
const TelegrafInlineMenu = require("telegraf-inline-menu");
const events = require("./scraper/events");
const TuenvioScraper = require("./scraper/TuenvioScraper");
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
  const include_terms = process.env.INCLUDE_TERMS.split(",");
  const exclude_terms = process.env.EXCLUDE_TERMS.split(",");
  const bot = new Telegraf(token);
  const telegram = new Telegram(token);
  const expressApp = express();

  mongoose.connect(DB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  const db = mongoose.connection;
  db.on("error", console.error.bind(console, "MongoDB connection error:"));

  expressApp.use(bot.webhookCallback(`/bot${token}`));
  bot.telegram.setWebhook(`${URL}/bot${token}`);

  bot.start(async (ctx) => {
    try {
      let preferences = await Preferences.findOne({ chatId: ctx.chat.id });
      if (preferences === null) {
        preferences = new Preferences({
          chatId: ctx.chat.id,
          getNotifications: true,
        });
        await preferences.save();
      }
      ctx.reply("Hola");
      ctx.reply(
        `Te avisaré si hay algún producto en ${baseUrl} cuyo nombre contenga ${include_terms.join(
          ", "
        )}, excepto si también contiene ${exclude_terms.join(", ")}`
      );
    } catch (err) {
      console.log(err.stack);
    }
  });

  bot.help((ctx) => {
    ctx.reply(
      "Soy un bot que te puede informar sobre la disponibilidad de determinados productos en el sitio Tuenvio"
    );
    ctx.reply("Cada 10 minutos reviso el sitio");
    ctx.reply("Puedes cambiar las preferencias con /config");
  });

  const menu = new TelegrafInlineMenu(
    `¿Te aviso si hay algún producto en ${baseUrl} cuyo nombre contenga ${include_terms.join(
      ", "
    )}, excepto si también contiene ${exclude_terms.join(", ")}?`
  );
  menu.setCommand("config");
  menu.select("s", ["Sí", "No"], {
    setFunc: async (ctx, key) => {
      try {
        const preferences = await Preferences.findOne({
          chatId: ctx.chat.id,
        });
        if (key === "Sí") {
          if (preferences.getNotifications === false) {
            preferences.getNotifications = true;
            await preferences.save();
          }
          await ctx.answerCbQuery("Te avisaré");
        } else {
          if (preferences.getNotifications === true) {
            preferences.getNotifications = false;
            await preferences.save();
          }
          await ctx.answerCbQuery("No te avisaré");
        }
      } catch (err) {
        console.log(err.stack);
      }
    },
    isSetFunc: async (_ctx, key) => {
      try {
        const preferences = await Preferences.findOne({
          chatId: _ctx.chat.id,
        });
        return (
          (key === "Sí" && preferences.getNotifications === true) ||
          (key === "No" && preferences.getNotifications === false)
        );
      } catch (err) {
        console.log(err.stack);
      }
    },
  });
  bot.use(menu.init());

  setInterval(async () => {
    try {
      const options = {
        timeout: 60000,
      };

      const scraper = new TuenvioScraper(options);
      scraper.on(events.custom.data, async ({ title, url, image, price }) => {
        if (
          include_terms.some((term) =>
            title.toLowerCase().includes(term.toLowerCase())
          ) &&
          exclude_terms.every(
            (term) => !title.toLowerCase().includes(term.toLowerCase())
          )
        ) {
          const allPreferences = await Preferences.find();
          for (const preferences of allPreferences) {
            await telegram.sendMessage(
              preferences.chatId,
              `${title} (${price}) ${url}`
            );
          }
        }
      });
      scraper.on(events.custom.error, (err) => console.error);
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
