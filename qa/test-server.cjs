'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process');
const PORT=8699,base='ws://127.0.0.1:'+PORT+'/ws',server=cp.spawn(process.execPath,[require('node:path').resolve(__dirname,'../server/server.js')],{env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1'}});
let log='';server.stdout.on('data',d=>{log+=d});server.stderr.on('data',d=>{log+=d});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=5000){const start=Date.now();while(Date.now()-start<ms){const v=fn();if(v)return v;await sleep(25)}throw Error('Timeout waiting for event; server: '+log)}
function client(name){const c={msgs:[],name,id:null};c.ws=new WebSocket(base);c.ws.addEventListener('message',e=>{const m=JSON.parse(e.data);c.msgs.push(m);if(m.t==='welcome')c.id=m.id});c.send=m=>c.ws.send(JSON.stringify(m));return c}
async function run(){await until(()=>log.includes('listening'));let r=await fetch('http://127.0.0.1:'+PORT+'/health');assert.equal(r.status,200);assert.equal((await r.json()).status,'ok');r=await fetch('http://127.0.0.1:'+PORT+'/index.html');assert.equal(r.status,200);assert.match(await r.text(),/IRONFRONT/);
 const a=client('Alpha'),b=client('Bravo');await until(()=>a.id&&b.id);a.send({t:'hello',name:'ALPHA',skin:'sentinel',weapon:'rifle'});b.send({t:'hello',name:'BRAVO',skin:'ranger',weapon:'rifle'});a.send({t:'queue'});b.send({t:'queue'});const ma=await until(()=>a.msgs.find(x=>x.t==='start'));const mb=await until(()=>b.msgs.find(x=>x.t==='start'));assert.equal(ma.mode,'public');assert.equal(ma.players.length,2);assert.equal(mb.code,ma.code);
 await until(()=>a.msgs.find(x=>x.t==='snapshot'));
 const target=ma.players.find(x=>x.id===b.id),self=ma.players.find(x=>x.id===a.id),dx=target.x-self.x,dz=target.z-self.z,yaw=Math.atan2(dx,-dz),pitch=Math.atan2(0.14,Math.hypot(dx,dz));a.send({t:'pose',x:self.x,z:self.z,yaw,pitch,stance:'idle',spawnSeq:self.spawnSeq});await sleep(1950);
 for(let k=0;k<8;k++){a.send({t:'fire',weapon:'rifle',yaw,pitch,slot:0,spawnSeq:self.spawnSeq});await sleep(130);if(a.msgs.some(x=>x.t==='damage'&&x.victim===b.id&&x.kill))break}await sleep(150);
 const damages=a.msgs.filter(x=>x.t==='damage');assert(damages.length>=1,'server should calculate damage on hit');assert.equal(damages[0].shooter,a.id);assert.equal(damages[0].victim,b.id);
 const lethal=await until(()=>a.msgs.find(x=>x.t==='damage'&&x.victim===b.id&&x.kill),4000);
 assert(lethal.kill);
 await until(()=>b.msgs.some(x=>x.t==='snapshot'&&x.players.some(y=>y.id===b.id&&!y.alive)));
 const respawn=await until(()=>b.msgs.find(x=>x.t==='respawn'),4600);
 assert(respawn.spawnSeq>target.spawnSeq,'respawn must increment generation');
 assert(respawn.hp===100);
 b.send({t:'pose',x:target.x,z:target.z,yaw:0,pitch:0,spawnSeq:target.spawnSeq});
 await until(()=>b.msgs.some(x=>x.t==='correction'&&x.spawnSeq===respawn.spawnSeq));
 const options=[[.25,0],[-.25,0],[0,.25],[0,-.25]];
 let accepted=false;
 for(const [dx,dz] of options){
  const wantedX=respawn.x+dx,wantedZ=respawn.z+dz;
  b.send({t:'pose',x:wantedX,z:wantedZ,yaw:0,pitch:0,stance:'walk',spawnSeq:respawn.spawnSeq});
  await sleep(200);
  if(b.msgs.some(m=>m.t==='snapshot'&&m.players.some(pp=>pp.id===b.id&&Math.abs(pp.x-wantedX)<.03&&Math.abs(pp.z-wantedZ)<.03))){accepted=true;break}
 }
 assert(accepted,'server should accept movement after respawn');
 a.ws.close();b.ws.close();await sleep(130);
 const c=client('Charlie'),d=client('Delta');await until(()=>c.id&&d.id);c.send({t:'hello',name:'CHARLIE'});d.send({t:'hello',name:'DELTA'});c.send({t:'create'});const lobby=await until(()=>c.msgs.find(x=>x.t==='lobby'));assert.match(lobby.code,/^[A-F0-9]{6}$/);d.send({t:'join',code:lobby.code});await until(()=>c.msgs.find(x=>x.t==='lobby'&&x.players.length===2));c.send({t:'start'});const s=await until(()=>d.msgs.find(x=>x.t==='start'));assert.equal(s.players.length,2);d.ws.close();c.ws.close();console.log(JSON.stringify({result:'PASS',online:'two-client public matchmaking',private:'create/join/start',serverHits:damages.length,respawnSequence:respawn.spawnSeq,stalePose:'REJECTED',movementAfterRespawn:'PASS',health:'OK',files:'OK'},null,2))}
run().catch(e=>{console.error(e.stack||e);process.exitCode=1}).finally(()=>{server.kill('SIGTERM');setTimeout(()=>process.exit(),300)})
