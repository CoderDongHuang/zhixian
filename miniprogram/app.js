let localConfig = {};
try { localConfig = require("./config"); } catch {}

App({ globalData: { apiBase: localConfig.apiBase || "https://zhixian.asia", apiToken: localConfig.apiToken || "" } })
