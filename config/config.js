require("dotenv").config();
const { _isArray } = require("../utils.js");

const settings = {
  TIME_SLEEP: process.env.TIME_SLEEP ? parseInt(process.env.TIME_SLEEP) : 60,
  MAX_THEADS: process.env.MAX_THEADS ? parseInt(process.env.MAX_THEADS) : 10,
  MAX_THEADS_NO_PROXY: process.env.MAX_THEADS_NO_PROXY ? parseInt(process.env.MAX_THEADS_NO_PROXY) : 10,

  MAX_LEVEL_PET: process.env.MAX_LEVEL_PET ? parseInt(process.env.MAX_LEVEL_PET) : 10,
  LEVEL_CUSTOM_BUY: process.env.LEVEL_CUSTOM_BUY ? parseInt(process.env.LEVEL_CUSTOM_BUY) : 10,
  AUTO_ONLINE: process.env.AUTO_ONLINE ? process.env.AUTO_ONLINE.toLowerCase() === "true" : false,

  SKIP_TASKS: process.env.SKIP_TASKS ? JSON.parse(process.env.SKIP_TASKS.replace(/'/g, '"')) : [],
  AUTO_TASK: process.env.AUTO_TASK ? process.env.AUTO_TASK.toLowerCase() === "true" : false,
  AUTO_BUY_AND_MERGE_PET: process.env.AUTO_BUY_AND_MERGE_PET ? process.env.AUTO_BUY_AND_MERGE_PET.toLowerCase() === "true" : false,
  AUTO_MINING: process.env.AUTO_MINING ? process.env.AUTO_MINING.toLowerCase() === "true" : false,
  AUTO_QUICK_BUY: process.env.AUTO_QUICK_BUY ? process.env.AUTO_QUICK_BUY.toLowerCase() === "true" : false,
  CONNECT_WALLET: process.env.CONNECT_WALLET ? process.env.CONNECT_WALLET.toLowerCase() === "true" : false,
  ADVANCED_ANTI_DETECTION: process.env.ADVANCED_ANTI_DETECTION ? process.env.ADVANCED_ANTI_DETECTION.toLowerCase() === "true" : false,
  API_ID: process.env.API_ID ? process.env.API_ID : null,
  BASE_URL: process.env.BASE_URL ? process.env.BASE_URL : "https://tg-puparty-h5-api.puparty.com/api",
  DELAY_BETWEEN_REQUESTS: process.env.DELAY_BETWEEN_REQUESTS && _isArray(process.env.DELAY_BETWEEN_REQUESTS) ? JSON.parse(process.env.DELAY_BETWEEN_REQUESTS) : [1, 5],
  DELAY_START_BOT: process.env.DELAY_START_BOT && _isArray(process.env.DELAY_START_BOT) ? JSON.parse(process.env.DELAY_START_BOT) : [1, 15],
};

module.exports = settings;
