const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// ===== 跨域中间件（必须放在这里！app创建之后，所有路由之前）====
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.static(__dirname));
app.use(express.json());
app.use(express.text({type: '*/*'})); // 给edit-time的文本解析

const file1 = path.join(__dirname, '1.txt');
const fileTime = path.join(__dirname, 'time.txt');

const unitMap = {
    F: 60 * 1000,
    S: 10 * 60 * 1000,
    H: 60 * 60 * 1000,
    T: 24 * 60 * 60 * 1000,
    Y: 30 * 24 * 60 * 60 * 1000
};

function readFile1() {
    if (!fs.existsSync(file1)) fs.writeFileSync(file1, '');
    const txt = fs.readFileSync(file1, 'utf-8');
    const lines = txt.trim().split('\n').filter(Boolean);
    const list = [];
    lines.forEach(line => {
        const [id, code, active] = line.split(';');
        list.push({ id, code, active: active ?? '0', activateAt: null, countDownEnd: null });
    });
    return list;
}
function saveFile1(list) {
    const str = list.map(i => `${i.id};${i.code};${i.active}`).join('\n');
    fs.writeFileSync(file1, str);
}
function readTimeFile() {
    if (!fs.existsSync(fileTime)) fs.writeFileSync(fileTime, '');
    const txt = fs.readFileSync(fileTime, 'utf-8');
    const lines = txt.trim().split('\n').filter(Boolean);
    const map = new Map();
    lines.forEach(line => {
        const [code, id] = line.split(';'); // 这里注意！原来你写反了 code;id
        map.set(code, id);
    });
    return map;
}
function randomStr(len) {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let res = '';
    for(let i=0;i<len;i++){
        res += chars[Math.floor(Math.random()*chars.length)];
    }
    return res;
}
function getMaxId(list){
    let max = 0;
    list.forEach(i=>{
        const n = Number(i.id);
        if(n>max) max = n;
    })
    return max;
}

app.post('/gen', (req, res)=>{
    const { prefix } = req.body;
    if(!/^[0-9][FSH TY]$/.test(prefix)){
        return res.json({ok:false,msg:'时间格式错误！只能是【单个数字+F/S/H/T/Y】例如 1F、2H，不允许10H这类'});
    }
    const unit = prefix[1];
    if(!unitMap[unit]){
        return res.json({ok:false,msg:'单位只能是 F/S/H/T/Y'});
    }
    const bodyLen = 14 + Math.floor(Math.random()*3);
    const randBody = randomStr(bodyLen);
    const fullCode = prefix + randBody;

    let list1 = readFile1();
    const maxId = getMaxId(list1);
    const newId = maxId + 1;
    list1.push({
        id: String(newId),
        code: fullCode,
        active: '0'
    });
    saveFile1(list1);
    res.json({ok:true, code:fullCode, id:newId});
})

app.get('/list', (req,res)=>{
    let list1 = readFile1();
    const timeMap = readTimeFile();
    const now = Date.now();
    const out = [];
    const toDelete = [];
    for(let item of list1){
        const row = {...item};
        const existInTime = timeMap.has(item.code);
        if(existInTime && item.active === '0'){
            row.active = '1';
            row.activateAt = now;
        }
        let remain = 0;
        if(row.active === '1'){
            const pre = row.code.slice(0,2);
            const num = Number(pre[0]);
            const u = pre[1];
            const totalMs = num * unitMap[u];
            const endTime = row.activateAt + totalMs;
            remain = endTime - now;
            if(remain < 0) remain = 0;
            row.countDownEnd = endTime;
            if(remain <= 0){
                if(timeMap.has(item.code)){
                    toDelete.push(item.code);
                }
            }
        }
        if(row.active === '1' && !existInTime){
            toDelete.push(item.code);
        }
        row.remainMs = remain;
        row.existInTime = existInTime;
        out.push(row);
    }
    list1 = list1.filter(x=>!toDelete.includes(x.code));
    saveFile1(list1);
    res.json({ok:true, data:out});
})

function formatMs(ms){
    if(ms <= 0) return "00:00:00";
    let s = Math.floor(ms /1000);
    const d = Math.floor(s / 86400);
    s = s % 86400;
    const h = Math.floor(s / 3600);
    s = s % 3600;
    const m = Math.floor(s /60);
    s = s %60;
    if(d>0) return `${d}天 ${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`
}

app.get('/fmt/:ms', (req,res)=>{
    const ms = Number(req.params.ms);
    res.send(formatMs(ms));
})

// ========== 在线编辑 time.txt ==========
app.get('/edit-time', (req, res) => {
  let content = '';
  if (fs.existsSync(fileTime)) {
    content = fs.readFileSync(fileTime, 'utf-8');
  }
  res.send(`
  <!DOCTYPE html>
  <html>
  <body style="background:#111;color:#fff;padding:20px">
    <h3>编辑 time.txt</h3>
    <form method="POST" action="/save-time">
      <textarea name="content" style="width:100%;height:400px;background:#222;color:#eee">${content}</textarea>
      <br>
      <button type="submit" style="margin-top:10px;padding:8px 16px">保存</button>
    </form>
  </body>
  </html>
  `)
})
app.post('/save-time', (req, res) => {
  fs.writeFileSync(fileTime, req.body);
  res.send('<h3>✅ 保存成功！<a href="/edit-time">返回编辑页</a></h3>');
})

// ========== 插件API：json版本 ==========
// 读取 1.txt
app.get('/api/read1', (req, res) => {
  if (!fs.existsSync(file1)) {
    return res.json({ ok: true, content: "" });
  }
  const txt = fs.readFileSync(file1, 'utf-8');
  res.json({ ok: true, content: txt });
});
// 写入 1.txt（覆盖式写入）
app.post('/api/write1', (req, res) => {
  const { content } = req.body;
  fs.writeFileSync(file1, content, 'utf-8');
  res.json({ ok: true, msg: "写入成功" });
});

// ========== 插件API：raw纯文本版本（推荐插件用） ==========
app.get('/raw/1.txt', (req, res) => {
  res.setHeader("Content-Type", "text/plain;charset=utf-8");
  if (!fs.existsSync(file1)) return res.send("");
  res.send(fs.readFileSync(file1, 'utf-8'));
})
app.get('/raw/time.txt', (req, res) => {
  res.setHeader("Content-Type", "text/plain;charset=utf-8");
  if (!fs.existsSync(fileTime)) return res.send("");
  res.send(fs.readFileSync(fileTime, 'utf-8'));
})
// raw写入1.txt
app.post('/raw/1.txt', (req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    fs.writeFileSync(file1, body, 'utf8');
    res.send('ok');
  });
});

/**
 * 接口：POST /api/activate-code
 * 请求体 { "code":"1Fxxxx随机码" }
 * 功能：收到随机码，激活该条记录，写入time.txt
 */
app.post('/api/activate-code', express.json(), (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.json({ ok: false, msg: "缺少随机码code参数" });
  }

  let list1 = readFile1();
  // 查找这条随机码记录
  const targetItem = list1.find(item => item.code === code);
  if (!targetItem) {
    return res.json({ ok: false, msg: "找不到该随机码记录" });
  }

  // 如果已经激活，直接返回
  if (targetItem.active === "1") {
    return res.json({ ok: true, msg: "该码已经激活", id: targetItem.id });
  }

  // 修改active为1，设置激活时间为当前时间戳
  targetItem.active = "1";
  targetItem.activateAt = Date.now();
  saveFile1(list1);

  // 追加写入 time.txt：格式 code;id
  const appendLine = `${targetItem.code};${targetItem.id}\n`;
  fs.appendFileSync(fileTime, appendLine, "utf-8");

  return res.json({
    ok: true,
    msg: "已成功激活",
    id: targetItem.id,
    code: targetItem.code
  });
});

app.listen(port, ()=>{
    console.log(`服务启动，端口：${port}`);
})
