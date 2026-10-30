const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const DATA_FILE = path.join(__dirname, 'data.json');
const TIME_FILE = path.join(__dirname, 'time.json');

function initFile(filePath, defaultValue) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue));
  }
}
initFile(DATA_FILE, []);
initFile(TIME_FILE, {});

const CACHE_TTL = 120 * 1000;
let cache = {
  data: { value: null, time: 0 },
  time: { value: null, time: 0 }
};

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, './')));

app.get('/api/getData', async (req, res) => {
  const now = Date.now();
  if (cache.data.value && now - cache.data.time < CACHE_TTL) {
    return res.json(cache.data.value);
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const data = JSON.parse(raw);
  cache.data.value = data;
  cache.data.time = now;
  res.json(data);
});

app.get('/api/getTime', async (req, res) => {
  const now = Date.now();
  if (cache.time.value && now - cache.time.time < CACHE_TTL) {
    return res.json(cache.time.value);
  }
  const raw = fs.readFileSync(TIME_FILE, 'utf8');
  const data = JSON.parse(raw);
  cache.time.value = data;
  cache.time.time = now;
  res.json(data);
});

app.post('/api/saveData', async (req, res) => {
  const payload = req.body;
  if (!Array.isArray(payload) || payload.length === 0) {
    return res.json({ success: false, msg: "禁止保存空卡密列表！" });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(payload));
  cache.data.value = payload;
  cache.data.time = Date.now();
  res.json({ success: true });
});

app.post('/api/saveTime', async (req, res) => {
  const payload = req.body;
  if (typeof payload !== "object" || payload === null) {
    return res.json({ success: false, msg: "时间数据格式错误" });
  }
  fs.writeFileSync(TIME_FILE, JSON.stringify(payload));
  cache.time.value = payload;
  cache.time.time = Date.now();
  res.json({ success: true });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 服务启动，端口 ${PORT}`);
});
