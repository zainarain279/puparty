const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const { HttpsProxyAgent } = require("https-proxy-agent");
const readline = require("readline");
const user_agents = require("./config/userAgents");
const settings = require("./config/config");
const { sleep, loadData, getRandomNumber, isTokenExpired, saveToken } = require("./utils");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const { checkBaseUrl } = require("./checkAPI");

class ClientAPI {
  constructor(queryId, accountIndex, proxy, baseURL, tokens) {
    this.tokenFile = "tokens.json";
    this.accountIndex = accountIndex;
    this.queryId = queryId;
    this.headers = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
      "Content-Type": "application/json",
      "sec-ch-ua": '"Not-A.Brand";v="99", "Chromium";v="124"',
      version: "1.1.0",
      source: "ios",
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-site": "same-site",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      "accept-language": "en-US,en;q=0.9",
      gameversion: "1.3.1",
      "access-control-allow-origin": "*",
      "company-code": "7",
      origin: "https://h5.puparty.com",
      referer: "https://h5.puparty.com/",
    };
    this.proxy = proxy;
    this.proxyIP = null;
    this.session_name = null;
    this.session_user_agents = this.#load_session_data();
    this.skipTasks = settings.SKIP_TASKS;
    // this.wallets = this.loadWallets();
    this.baseURL = baseURL;
    this.tokens = tokens || {};
    this.token = null;
  }

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
    }
  }

  #get_random_user_agent() {
    const randomIndex = Math.floor(Math.random() * user_agents.length);
    return user_agents[randomIndex];
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }

    this.log(`Tạo user agent...`);
    const newUserAgent = this.#get_random_user_agent();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }

    return "Unknown";
  }

  set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `"Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  createUserAgent() {
    const telegramauth = this.queryId;
    const userData = JSON.parse(decodeURIComponent(telegramauth.split("user=")[1].split("&")[0]));
    this.session_name = userData.id;
    this.#get_user_agent();
  }

  async log(msg, type = "info") {
    const accountPrefix = `[Tài khoản ${this.accountIndex + 1}]`;
    const ipPrefix = this.proxyIP ? `[${this.proxyIP}]` : "[Unknown IP]";
    let logMessage = "";

    switch (type) {
      case "success":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.green;
        break;
      case "error":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.red;
        break;
      case "warning":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.yellow;
        break;
      case "custom":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.magenta;
        break;
      default:
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.blue;
    }
    console.log(logMessage);
  }

  async makeRequest(url, method, data = {}, retries = 0) {
    const headers = {
      ...this.headers,
      token: this.token,
    };
    let currRetries = 0,
      success = false;
    const proxyAgent = new HttpsProxyAgent(this.proxy);
    do {
      currRetries++;
      try {
        const response = await axios({
          method,
          url,
          data,
          headers,
          httpsAgent: proxyAgent,
          timeout: 30000,
        });
        success = true;
        if ([200, 201, 304].includes(response.status) && response.data.code == 0) {
          return { success: true, data: response.data.data };
        } else if (response.data.code == 10001 && response.data.msg == "login expire") {
          this.log(`Token has expired! Getting new token...`);
          success = false;
          await this.getValidToken(true);
          if (currRetries == retries) return { success: false, data: response.data };
        } else return { success: false, data: response.data, error: response?.data?.msg };
      } catch (error) {
        this.log(`Yêu cầu thất bại: ${url} | ${error.message} | đang thử lại...`, "warning");
        success = false;
        await sleep(settings.DELAY_BETWEEN_REQUESTS);
        if (currRetries == retries) return { success: false, error: error.message };
      }
    } while (currRetries < retries && !success);
  }

  async login() {
    let currRetries = 0,
      success = false;
    const proxyAgent = new HttpsProxyAgent(this.proxy);
    const headers = {
      ...this.headers,
      httpsAgent: proxyAgent,
    };

    const url = `${this.baseURL}/v1/member/login`;
    // console.log(headers);
    do {
      currRetries++;
      try {
        const response = await axios.post(
          url,
          {
            initData: this.queryId,
            pid: null,
            source: "ios",
            tgVersion: "8.0",
          },
          { headers }
        );
        success = true;
        return { success: true, data: response.data };
      } catch (error) {
        // console.log(error);
        this.log(`Yêu cầu thất bại: ${url} | ${error.message} | đang thử lại...`, "warning");
        success = false;
        await sleep(settings.DELAY_BETWEEN_REQUESTS);
        return { success: false, error: error.message };
      }
    } while (currRetries < 2 && !success);
  }

  async getUserInfo() {
    return this.makeRequest(`${this.baseURL}/v1/member/info`, "post", {});
  }

  async chheckUserExist() {
    return this.makeRequest(`${this.baseURL}/v1/member/asset/pup/collect/exist`, "post", {});
  }

  async getSetting() {
    return this.makeRequest(`${this.baseURL}/v1/member/setting/get`, "post", {});
  }

  async getAds() {
    return this.makeRequest(`${this.baseURL}/v1/game/combine/ad/get`, "post", {});
  }

  async getFreeGold() {
    return this.makeRequest(`${this.baseURL}/v1/game/combine/gold/free`, "post", {});
  }

  async getAllCards() {
    return this.makeRequest(`${this.baseURL}/v1/game/card/getAll`, "post", {});
  }

  async getAllGroups() {
    return this.makeRequest(`${this.baseURL}/v1/game/card/group/getAll`, "post", {});
  }

  async getAllPets() {
    return this.makeRequest(`${this.baseURL}/v1/game/pet/query`, "post", {});
  }

  async getAllCurrentPets() {
    return this.makeRequest(`${this.baseURL}/v1/game/combine/index`, "post", {});
  }

  // async getConfig() {
  //   return this.makeRequest(`${this.baseURL}/v1/member/config`, "post", {});
  // }

  async getPets() {
    return this.makeRequest(`${this.baseURL}/v1/game/combine/produce`, "post");
  }

  async getTasks() {
    return this.makeRequest(`${this.baseURL}/v1/member/task/query`, "post", {});
  }

  async checkin() {
    return this.makeRequest(`${this.baseURL}/v1/member/task/signin`, "post", {});
  }

  async checkTask(code) {
    return this.makeRequest(`${this.baseURL}/v1/member/task/${code}/check`, "post", {});
  }

  async completeTask(code) {
    return this.makeRequest(`${this.baseURL}/v1/member/task/${code}`, "post", {});
  }

  async getPPTs(payload) {
    return this.makeRequest(`${this.baseURL}/v1/member/asset/collect/query`, "post", {
      pageNum: 1,
      pageSize: 48,
    });
  }

  async collectPPT(payload) {
    return this.makeRequest(`${this.baseURL}/v1/member/asset/collect/receive`, "post", payload);
  }

  async collectOffline(payload) {
    return this.makeRequest(`${this.baseURL}/v1/game/combine/offline/gold/collect`, "post", payload);
  }

  async collectOnline(payload) {
    return this.makeRequest(`${this.baseURL}/v1/game/combine/index`, "post", payload);
  }
  // {
  //   "currency": 1,
  //   "sign": "ZysSkjlAXoqAeK19dTGDwlGsN/kV8ZV2rV6iu8Yb138/4FV7NRErZ0JlAV7x07jm"
  // }

  async getShop() {
    return this.makeRequest(`${this.baseURL}/v1/game/combine/shop`, "post", {});
  }

  async mergePet(payload) {
    return this.makeRequest(`${this.baseURL}/v1/game/combine/merge`, "post", payload);
  }

  async byPet(payload) {
    return this.makeRequest(`${this.baseURL}/v1/game/combine/purchase`, "post", payload);
  }

  async getUserBalance() {
    return this.makeRequest(`${this.baseURL}/user/user-balance`, "get");
  }

  async getValidToken(isNew = false) {
    const userId = this.session_name;
    const existingToken = this.token;

    // && !isTokenExpired(existingToken)
    if (existingToken && !isNew) {
      this.log("Using valid token", "success");
      return existingToken;
    }

    const loginResult = await this.login();
    // console.log(loginResult);
    const token = loginResult?.data?.token || loginResult?.data?.data?.token;

    if (loginResult.success && token) {
      this.token = token;
      // await saveToken(userId, token);
      parentPort.postMessage({
        event: "saveToken",
        id: userId,
        token,
      });
      return token;
    }
    this.log(`No valid token found!`);
    return null;
  }

  async handleMergePet(data) {
    this.log(`Starting buy and merge pet...`);
    let { pets, maxSlot, maxLevel } = data;

    const levelMap = {};

    const allMaxLevels = pets.every((item) => item.level === 7);
    if (allMaxLevels) {
      return this.log(`All pet max level: ${maxLevel}`, "warning");
    }

    // Đếm số lượng pets theo level
    pets
      .map((item, index) => ({ ...item, pos: index }))
      .forEach((pet) => {
        if (!levelMap[pet.level]) {
          levelMap[pet.level] = [];
        }
        levelMap[pet.level].push(pet);
      });

    const pairs = [];

    // Ghép các pets thành cặp
    for (const level in levelMap) {
      const group = levelMap[level];
      while (group.length > 1) {
        const first = group.pop();
        const second = group.pop();
        pairs.push([first.pos, second.pos]);
      }
    }

    if (pairs.length == 0) {
      this.log(`No pets avalible to merge`, "warning");
    }

    for (const pair of pairs) {
      await sleep(1);
      const resMerge = await this.mergePet({
        pos1: pair[0],
        pos2: pair[1],
      });
      if (resMerge.success) {
        this.log(
          `Merge pet successfully! | Max level pet now: ${resMerge.data.maxLevel} | Current pets: ${resMerge.data.pets.length} | Profit: ${resMerge.data.onlineGoldPerSecond}/second`,
          "success"
        );
        pets = resMerge.data.pets;
        data = resMerge.data;
      } else {
        this.log(`Merge pet failed!`, "warning");
      }
    }

    ///buy pet===============
    try {
      if (pets.length < maxSlot) {
        let { level, goldPrice } = data.quickPurchase;

        if (settings.AUTO_QUICK_BUY && goldPrice && +goldPrice > +data.gold) {
          return this.log(`No enough gold to buy!`, "warning");
        }
        let currentSlot = pets.length;
        if (!settings.AUTO_QUICK_BUY && settings.LEVEL_CUSTOM_BUY < data.maxLevel) {
          const resShop = await this.getShop();
          if (resShop.success) {
            const petCustomBuy = resShop.data.items.filter((item) => item.goldPrice != 0 && item.level == settings.LEVEL_CUSTOM_BUY);
            if (!petCustomBuy || petCustomBuy?.goldPrice > data.gold) {
              return this.log(`No enough gold to buy custom pet!`, "warning");
            }
          }
          level = settings.LEVEL_CUSTOM_BUY;
        }
        const payload = {
          currency: 1,
          level: level,
        };
        while (currentSlot <= maxSlot) {
          currentSlot++;
          await sleep(1);
          const resBuy = await this.byPet(payload);
          if (resBuy.success) {
            data = resBuy.data;
            this.log(`Buy pet level ${level} successfully! | Balance: ${resBuy.data.gold} | Profit: ${resBuy.data.onlineGoldPerSecond}/second`, "success");
          } else {
            this.log(`Buy pet level ${level} failed! | Balance: ${data.gold}`, "warning");
          }
        }
        if (data.maxLevel >= settings.MAX_LEVEL_PET) {
          return;
        } else {
          await this.handleMergePet(data);
        }
      }
    } catch (error) {
      this.log(`Error buy pet: ${error.message}`);
    }
    return pairs;
  }

  async handleTasks() {
    const resTasks = await this.getTasks();
    if (resTasks.success) {
      const tasks = resTasks.data.filter((t) => !settings.SKIP_TASKS.includes(t.code));
      if (tasks.length > 0) {
        for (const task of tasks) {
          await sleep(1);
          this.log(`Completting task ${task.code} | ${task.name}...`);
          let resCom = null;

          if (task.code == "signIn") {
            resCom = await this.completeTask(task.code);
            if (resCom.success) {
              this.log(`checkin successful`, "success");
            }
          } else if (task.code == "online") {
            await this.getAllCurrentPets();
          } else {
            resCom = await this.checkTask(task.code);
            if (resCom.success) {
              this.log(`Completed task ${task.code} | ${task.name} successfully!`, "success");
            } else {
              this.log(`Completed task ${task.code} | ${task.name} failed!`, "warning");
            }
          }
        }
      } else {
        this.log(`No tasks to complete!`, "warning");
      }
    }
  }

  async handleMinning() {
    const resPtt = await this.getPPTs();
    if (resPtt.success) {
      const ptts = resPtt.data.list.filter((t) => !t.received);
      if (ptts.length > 0) {
        for (const ptt of ptts) {
          await sleep(1);
          const resCollect = await this.collectPPT({ id: ptt.id });
          if (resCollect.success) {
            this.log(`Mining block ${ptt.id} successfully! | Reward: ${ptt.pup}`, "success");
          } else {
            this.log(`Mining block ${ptt.id} failed!`, "warning");
          }
        }
      } else {
        this.log(`No block to minning!`, "warning");
      }
    }
  }

  async handlePing() {
    const resgetPet = await this.getPets();
    if (resgetPet.success) {
      this.log(`Ping successful! | Balance:${resgetPet.data.gold} | Profit: ${resgetPet.data.onlineGoldPerSecond}/second`, "success");
      return resgetPet.data;
    } else {
      this.log(`Ping failed!`, "warning");
      return null;
    }
  }

  async handleAds() {
    const resAds = await this.getAds();
    if (resAds.success) {
      const { totalTimes, useTimes, videoRatio, coolDownTime, lastTime, goldIntimacy: freeClaim } = resAds.data;
      if (freeClaim) {
        const resFree = await this.getFreeGold();
        if (resFree.success) {
          this.log(`Claiming Free gold success!`, "success");
        }
      }
    } else {
      this.log(`handle Ads failed!`, "warning");
    }
  }

  async checkProxyIP() {
    try {
      const proxyAgent = new HttpsProxyAgent(this.proxy);
      const response = await axios.get("https://api.ipify.org?format=json", { httpsAgent: proxyAgent });
      if (response.status === 200) {
        this.proxyIP = response.data.ip;
        return response.data.ip;
      } else {
        throw new Error(`Cannot check proxy IP. Status code: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Error checking proxy IP: ${error.message}`);
    }
  }

  async runAccount() {
    try {
      this.proxyIP = await this.checkProxyIP();
    } catch (error) {
      this.log(`Cannot check proxy IP: ${error.message}`, "warning");
      return;
    }

    const accountIndex = this.accountIndex;
    const initData = this.queryId;
    const userData = JSON.parse(decodeURIComponent(initData.split("user=")[1].split("&")[0]));
    const firstName = userData.first_name || "";
    const lastName = userData.last_name || "";
    this.session_name = userData.id;
    this.token = this.tokens?.[userData.id];

    const timesleep = getRandomNumber(settings.DELAY_START_BOT[0], settings.DELAY_START_BOT[1]);
    console.log(`=========Tài khoản ${accountIndex + 1}| ${firstName + " " + lastName} | ${this.proxyIP} | Bắt đầu sau ${timesleep} giây...`.green);
    this.set_headers();
    await sleep(timesleep);

    // console.log(this.token);

    const token = await this.getValidToken(false);
    if (!token) {
      this.log("Đăng nhập không thành công sau. Bỏ qua tài khoản.", "error");
      return;
    }

    let infoData = null;
    let retries = 0;
    while (retries < 2) {
      retries++;
      infoData = await this.getUserInfo();
      if (infoData?.success) {
        break;
      }
    }
    const petCurData = await this.getAllCurrentPets();

    if (infoData?.success) {
      const { name, power } = infoData.data;
      const { gold, maxLevel } = petCurData.data;
      this.log(`Name: ${name} | Balance: ${gold} | Max Level Pet: ${maxLevel} | Power: ${power}`);

      // const inntervalID = setInterval(this.handlePing, 4000);
      await this.handlePing();
      await this.handleAds();

      if (settings.AUTO_TASK) {
        await this.handleTasks();
      }
      if (settings.AUTO_MINING) {
        await this.handleMinning();
      }
      if (settings.AUTO_BUY_AND_MERGE_PET) {
        await this.handleMergePet(petCurData.data);
      }

      if (settings.AUTO_ONLINE) {
        while (true) {
          await sleep(4);
          const resPing = await this.handlePing();
          if (!resPing) return;
          const { quickPurchase } = resPing;
          if (+resPing.gold > +quickPurchase.goldPrice && settings.AUTO_BUY_AND_MERGE_PET) {
            await this.handleMergePet(resPing);
          }
        }
      }
      this.log(`Completed processing!`, "custom");
    } else {
      this.log("Can't get info user, try get new query_Id again...skippig", "error");
      return;
    }
  }
}

async function wait(seconds) {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r${colors.cyan(`[*] Chờ ${Math.floor(i / 60)} phút ${i % 60} giây để tiếp tục`)}`.padEnd(80));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);
  console.log(`Bắt đầu vòng lặp mới...`);
}

async function runWorker(workerData) {
  const { queryId, accountIndex, proxy, hasIDAPI, tokens } = workerData;
  const to = new ClientAPI(queryId, accountIndex, proxy, hasIDAPI, tokens);
  try {
    await Promise.race([to.runAccount(), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 24 * 60 * 60 * 1000))]);
    parentPort.postMessage({
      accountIndex,
      status: "success",
    });

    // parentPort.on("message", async (data) => {
    //   console.log("data", data);
    //   // saveToken(id, token);
    // });
  } catch (error) {
    parentPort.postMessage({
      accountIndex,
      error: error.message,
      status: "error",
    });
  } finally {
    if (!isMainThread) {
      parentPort.postMessage("taskComplete");
    }
  }
}

async function main() {
  const queryIds = loadData("data.txt");
  const proxies = loadData("proxy.txt");
  let tokens = {};

  try {
    tokens = require("./tokens.json");
  } catch (error) {
    tokens = {};
  }

  if (queryIds.length > proxies.length) {
    console.log("Số lượng proxy và data phải bằng nhau.".red);
    console.log(`Data: ${queryIds.length}`);
    console.log(`Proxy: ${proxies.length}`);
    process.exit(1);
  }
  console.log("Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/AirdropScript6)".yellow);
  let maxThreads = settings.MAX_THEADS;

  const { endpoint: hasIDAPI, message } = await checkBaseUrl();
  if (!hasIDAPI) return console.log(`Không thể tìm thấy ID API, thử lại sau!`.red);
  console.log(`${message}`.yellow);
  // process.exit();
  queryIds.map((val, i) => new ClientAPI(val, i, proxies[i], hasIDAPI).createUserAgent());

  await sleep(1);
  while (true) {
    let currentIndex = 0;
    const errors = [];

    while (currentIndex < queryIds.length) {
      const workerPromises = [];
      const batchSize = Math.min(maxThreads, queryIds.length - currentIndex);
      for (let i = 0; i < batchSize; i++) {
        const worker = new Worker(__filename, {
          workerData: {
            hasIDAPI,
            queryId: queryIds[currentIndex],
            accountIndex: currentIndex,
            proxy: proxies[currentIndex % proxies.length],
            tokens,
          },
        });

        workerPromises.push(
          new Promise((resolve) => {
            worker.on("message", async (message) => {
              if (message === "taskComplete") {
                worker.terminate();
                resolve();
              }
              // console.log(message);

              if (message?.event === "saveToken") {
                await saveToken(message.id, message.token);
              }
            });

            worker.on("error", (error) => {
              console.log(`Lỗi worker cho tài khoản ${currentIndex}: ${error.message}`);
              worker.terminate();
              resolve();
            });
            worker.on("exit", (code) => {
              // console.log(`Lỗi code worker: ${code} cho tài khoản ${currentIndex}`);
              worker.terminate();
              resolve();
            });
          })
        );

        currentIndex++;
      }

      await Promise.all(workerPromises);

      if (errors.length > 0) {
        errors.length = 0;
      }

      if (currentIndex < queryIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    await sleep(3);

    console.log("Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/AirdropScript6)".yellow);
    console.log(`=============Hoàn thành tất cả tài khoản=============`.magenta);
    await wait(settings.TIME_SLEEP * 60);
  }
}

if (isMainThread) {
  main().catch((error) => {
    console.log("Lỗi rồi:", error);
    process.exit(1);
  });
} else {
  runWorker(workerData);
}
