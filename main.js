import { BoardData, RatingData } from "./data.js";
import { BoardSheet, RatingSheet } from "./sheets.js";

Hooks.once("init", function() {
    console.log("Kexborn Connections | Инициализация модуля связей и рейтингов...");

    // Регистрируем модели данных
    CONFIG.Actor.dataModels["kexborn-connections.board"] = BoardData;
    CONFIG.Actor.dataModels["kexborn-connections.rating"] = RatingData;

    // Регистрируем листы актеров
    const DocSheetConfig = foundry.applications.apps.DocumentSheetConfig;
    DocSheetConfig.registerSheet(Actor, "kexborn-connections", BoardSheet, { types: ["kexborn-connections.board"], makeDefault: true });
    DocSheetConfig.registerSheet(Actor, "kexborn-connections", RatingSheet, { types: ["kexborn-connections.rating"], makeDefault: true });

    // Регистрируем настройку темы в меню Foundry
    game.settings.register("kexborn-connections", "theme", {
        name: "KEXBORN.SettingsThemeName",
        hint: "KEXBORN.SettingsThemeHint",
        scope: "world",     // Настройка для всего мира
        config: true,       // Показывать в меню настроек
        type: String,
        choices: {
            "dnd": "KEXBORN.ThemeDnD",
            "dnd-dark": "KEXBORN.ThemeDnDDark",
            "dark": "KEXBORN.ThemeDark",
            "scifi-light-blue": "KEXBORN.ThemeScifiLightBlue",
            "scifi-dark-blue": "KEXBORN.ThemeScifiDarkBlue",
            "scifi-red": "KEXBORN.ThemeScifiRed",
            "scifi-green": "KEXBORN.ThemeScifiGreen",
            "scifi-orange": "KEXBORN.ThemeScifiOrange",
            "scifi-violet": "KEXBORN.ThemeScifiViolet",
            "scifi-grey": "KEXBORN.ThemeScifiGrey",
            "universal": "KEXBORN.ThemeUniversal",
            "universal-dark": "KEXBORN.ThemeUniversalDark"
        },
        default: "dnd-dark",
        onChange: () => {
            // При смене темы принудительно обновляем все открытые листы связей и рейтингов
            Object.values(ui.windows).forEach(w => {
                if (w.document && (w.document.type === "kexborn-connections.board" || w.document.type === "kexborn-connections.rating")) {
                    w.render();
                }
            });
        }
    });
});

Hooks.on("preCreateActor", (actor, data, options, userId) => {
    // Устанавливаем дефолтное изображение для Древа связей
    if (actor.type === "kexborn-connections.board" && (!data.img || data.img === "icons/svg/mystery-man.svg")) {
        actor.updateSource({ img: "modules/kexborn-connections/icons/board.svg" }); 
    }
    
    // Устанавливаем дефолтное изображение для Таблицы рейтинга
    if (actor.type === "kexborn-connections.rating" && (!data.img || data.img === "icons/svg/mystery-man.svg")) {
        actor.updateSource({ img: "modules/kexborn-connections/icons/rating.svg" }); 
    }
});