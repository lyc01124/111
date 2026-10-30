const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Pantry 配置
const PANTRY_ID = process.env.PANTRY_ID;
if (!PANTRY_ID) {
  console.error("错误：未配置 PANTRY_ID 环境变量");
}
const API_BASE = `https://getpantry.cloud/apiv1/pantry/${PANTRY_ID}/basket`;
const BASKET_DATA = "data1";
const BASKET_TIME = "timeData";

// 跨域
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, './')));

// Pantry 读取
async function pantryGet(basketName) {
  try {
    const r = await axios.get(`${API_BASE}/${basketName}`, { timeout: 12000 });
    return r.data;
  } catch (e) {
    console.error("读取失败", basketName, e.message);
    return null;
  }
}
// Pantry 写入
async function pantryPut(basketName, payload) {
  try {
    await axios.post(`${API_BASE}/${basketName}`, payload, { timeout: 12000 });
    return true;
  } catch (e) {
    console.error("写入失败", basketName, e.message);
    return false;
  }
}

// 获取数据
app.get('/api/getData', async (req, res) => {
  const data = await pantryGet(BASKET_DATA);
  res.json(data || []);
});
app.get('/api/getTime', async (req, res) => {
  const data = await pantryGet(BASKET_TIME);
  res.json(data || {});
});

// 保存数据
app.post('/api/saveData', async (req, res) => {
  const ok = await pantryPut(BASKET_DATA, req.body);
  res.json({ success: ok });
});
app.post('/api/saveTime', async (req, res) => {
  const ok = await pantryPut(BASKET_TIME, req.body);
  res.json({ success: ok });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`服务启动，端口 ${PORT}`);
});
