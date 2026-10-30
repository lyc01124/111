const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.use(express.json());

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
        const [id, code] = line.split(';');
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

app.listen(port, ()=>{
    console.log(`服务启动，端口：${port}`);
})

// 在线编辑 time.txt
app.get('/edit-time', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const fileTime = path.join(__dirname, 'time.txt');
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
app.post('/save-time', express.text({type: '*/*'}), (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const fileTime = path.join(__dirname, 'time.txt');
  fs.writeFileSync(fileTime, req.body);
  res.send('<h3>✅ 保存成功！<a href="/edit-time">返回编辑页</a></h3>');
})
