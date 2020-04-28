const { Telegraf } = require("telegraf");
const Telegram = require("telegraf/telegram");
const Stage = require("telegraf/stage");
const session = require("telegraf/session");
const WizardScene = require("telegraf/scenes/wizard");
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
  const bot = new Telegraf(token);
  const telegram = new Telegram(token);
  const expressApp = express();

  mongoose.connect(DB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  const db = mongoose.connection;
  db.on("error", console.error.bind(console, "MongoDB connection error:"));

  telegram.setMyCommands([
    {
      command: "start",
      description: "Iniciar bot",
    },
    {
      command: "settings",
      description: "Preferencias",
    },
    {
      command: "help",
      description: "Ayuda",
    },
    {
      command: "add",
      description: "Agregar alerta",
    },
  ]);

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
        `Te avisaré si hay algún producto en ${baseUrl} que te interese`
      );
    } catch (err) {
      console.log(err.stack);
    }
  });

  const settingsMenu = new TelegrafInlineMenu("Preferencias");
  settingsMenu.setCommand("settings");

  settingsMenu.toggle("Notificaciones", "notifications", {
    setFunc: async (ctx, newState) => {
      try {
        await Preferences.updateOne(
          {
            chatId: ctx.chat.id,
          },
          {
            getNotifications: newState,
          }
        );
      } catch (err) {
        console.log(err.stack);
      }
    },
    isSetFunc: async (ctx) => {
      const preferences = await Preferences.findOne({
        chatId: ctx.chat.id,
      });
      return preferences.getNotifications;
    },
  });

  const stopMenu = new TelegrafInlineMenu(
    `¿Seguro que deseas dejar de recibir notificaciones? ¡Te advierto que no guardaré tus preferencias!`
  );
  stopMenu.button("Continuar", "continue", {
    doFunc: async (ctx) => {
      try {
        await Preferences.deleteOne({ chatId: ctx.chat.id });
        await ctx.reply("😢 Listo. No volveré a enviarte notificaciones.");
        await ctx.reply(
          "Si cambias de opinión siempre puedes volver a comenzar mediante el comando /start"
        );
      } catch (err) {
        console.log(err.stack);
      }
    },
  });
  settingsMenu.submenu("🛑 Detener servicio", "stop", stopMenu);

  const alertsSubmenuOptions = async (ctx) => {
    try {
      const preferences = await Preferences.findOne({ chatId: ctx.chat.id });
      return preferences.alerts.map((alert) => alert.term);
    } catch (err) {
      console.log(err.stack);
    }
  };
  const alertMenu = new TelegrafInlineMenu(async (ctx) => {
    try {
      const preferences = await Preferences.findOne({ chatId: ctx.chat.id });
      const alert = preferences.alerts.find(
        (alert) => alert.term === ctx.match[1]
      );
      return `Alertar cuando un nombre de producto contenga:\n
        **${alert.term}**\n
        excepto si también contiene:\n
        "${alert.exceptions.map((exception) => `- ${exception}`).join("\n")}"`;
    } catch (err) {
      console.log(err.stack);
    }
  });
  alertMenu.button("Eliminar alerta", "delete", {
    doFunc: async (ctx) => {
      try {
        const preferences = await Preferences.findOne({ chatId: ctx.chat.id });
        preferences.alerts = preferences.alerts.filter(
          (alert) => alert.term !== ctx.match[1]
        );
        preferences.save();
      } catch (err) {
        console.log(err.stack);
      }
    },
    setParentMenuAfter: true,
  });

  const alertsMenu = new TelegrafInlineMenu("Alertas");
  alertsMenu.selectSubmenu("alert", alertsSubmenuOptions, alertMenu);
  settingsMenu.submenu("🔔 Alertas", "alerts", alertsMenu);

  bot.use(
    settingsMenu.init({
      backButtonText: "Volver…",
      mainMenuButtonText: "Volver al menú principal…",
    })
  );

  const alertCreationWizard = new WizardScene(
    "create_alert",
    (ctx) => {
      ctx.reply("¿Sobre qué debo alertarte?");
      return ctx.wizard.next();
    },
    async (ctx) => {
      const preferences = await Preferences.findOne({ chatId: ctx.chat.id });
      if (ctx.message.text.length == 0) {
        ctx.reply(`Debes introducir al menos una letra`);
        return ctx.scene.leave();
      } else if (
        preferences.alerts.some((alert) => alert.term === ctx.message.text)
      ) {
        ctx.reply(`Ya has agregado una alerta para "${ctx.message.text}"`);
        return ctx.scene.leave();
      }
      ctx.wizard.state.term = ctx.message.text;
      ctx.reply("¿Excepciones? (separadas por coma)");
      return ctx.wizard.next();
    },
    async (ctx) => {
      const exceptions = ctx.message.text
        .split(",")
        .map((exception) => exception.trim());
      try {
        const preferences = await Preferences.findOne({ chatId: ctx.chat.id });
        preferences.alerts.push({
          term: ctx.wizard.state.term,
          exceptions: exceptions,
        });
        preferences.save();
      } catch (err) {
        console.log(err.stack);
      }
      ctx.replyWithMarkdown(
        `Te notificaré cuando un nombre de producto contenga:\n
        **${ctx.wizard.state.term}**\n
        excepto si también contiene:\n
        "${exceptions.map((exception) => `- ${exception}`).join("\n")}"`
      );
      return ctx.scene.leave();
    }
  );
  const stage = new Stage([alertCreationWizard]);
  bot.use(session());
  bot.use(stage.middleware());
  bot.command("add", (ctx) => ctx.scene.enter("create_alert"));

  bot.help((ctx) => {
    ctx.reply(
      "Soy un bot que te puede informar sobre la disponibilidad de determinados productos en el sitio Tuenvio"
    );
    ctx.reply("Cada 10 minutos reviso el sitio");
    ctx.reply("Puedes cambiar las preferencias con /settings");
  });

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
