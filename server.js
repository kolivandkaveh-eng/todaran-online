const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false }, maxHttpBufferSize: 16_384, pingInterval: 25_000, pingTimeout: 20_000 });
const PORT = Number(process.env.PORT || 3000);
const players = new Map();
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS || 50);
const WORLD_LIMIT = 500;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const cleanName = v => String(v || 'مهمان').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 18) || 'مهمان';
const cleanText = v => String(v || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 180);
const banned = ['fuck','shit','bitch','کص','کسکش','کیر','جنده'];
function safeChat(v) { let s = cleanText(v); const low=s.toLowerCase(); if (!s || banned.some(w=>low.includes(w))) return ''; return s; }
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('/health', (_req,res) => res.json({ ok:true, service:'todaran-public-city', online:players.size, capacity:MAX_PLAYERS }));

io.on('connection', socket => {
  socket.on('join', raw => {
    if (players.has(socket.id)) return;
    if (players.size >= MAX_PLAYERS) { socket.emit('serverNotice','ظرفیت فعلی شهر تکمیل است.'); socket.disconnect(true); return; }
    const name=cleanName(raw?.name);
    const p={id:socket.id,name,x:clamp(Number(raw?.x)||0,-WORLD_LIMIT,WORLD_LIMIT),z:clamp(Number(raw?.z)||-6.5,-WORLD_LIMIT,WORLD_LIMIT),rot:Number.isFinite(Number(raw?.rot))?Number(raw.rot):0,updated:Date.now(),lastChat:0};
    players.set(socket.id,p);
    socket.emit('joined',{players:[...players.values()].filter(x=>x.id!==socket.id).map(({lastChat,updated,...x})=>x)});
    socket.broadcast.emit('playerJoined',{id:p.id,name:p.name,x:p.x,z:p.z,rot:p.rot});
    io.emit('onlineCount',players.size);
  });
  socket.on('move', raw => {
    const p=players.get(socket.id); if(!p||!raw)return;
    const x=Number(raw.x),z=Number(raw.z),rot=Number(raw.rot);
    if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(rot)||Math.abs(x)>WORLD_LIMIT||Math.abs(z)>WORLD_LIMIT)return;
    const now=Date.now(),dt=clamp((now-p.updated)/1000,0.05,0.5),maxStep=18*dt+1.1;
    const dx=x-p.x,dz=z-p.z,d=Math.hypot(dx,dz),scale=d>maxStep?maxStep/d:1;
    p.x+=dx*scale;p.z+=dz*scale;p.rot=rot;p.updated=now;
    socket.broadcast.volatile.emit('playerMoved',{id:p.id,name:p.name,x:p.x,z:p.z,rot:p.rot});
  });
  socket.on('chat', raw => {
    const p=players.get(socket.id);if(!p)return;
    const now=Date.now();if(now-p.lastChat<900)return;p.lastChat=now;
    const text=safeChat(raw);if(!text)return;
    io.emit('chat',{id:p.id,name:p.name,text,at:now});
  });
  socket.on('disconnect',()=>{
    const p=players.get(socket.id);if(!p)return;players.delete(socket.id);
    io.emit('playerLeft',{id:p.id,name:p.name});io.emit('onlineCount',players.size);
  });
});

server.listen(PORT,'0.0.0.0',()=>console.log(`Todaran public city listening on ${PORT}`));
