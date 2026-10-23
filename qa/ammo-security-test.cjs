'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),path=require('node:path');
const PORT=8701;const child=cp.spawn(process.execPath,[path.join(__dirname,'../server/server.js')],{env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1'}});
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=5000){const start=Date.now();while(Date.now()-start<ms){const r=fn();if(r)return r;await sleep(20)}throw Error('Timeout: '+logs)}
function client(){const c={msgs:[]};c.ws=new WebSocket('ws://127.0.0.1:'+PORT+'/ws');c.ws.onmessage=e=>{const m=JSON.parse(e.data);c.msgs.push(m);if(m.t==='welcome')c.id=m.id};c.send=m=>c.ws.send(JSON.stringify(m));c.current=()=>c.msgs.filter(m=>m.t==='ammo').at(-1);return c}
async function run(){await until(()=>logs.includes('listening'));const a=client(),b=client();await until(()=>a.id&&b.id);
 a.send({t:'hello',name:'A'});b.send({t:'hello',name:'B'});a.send({t:'queue'});b.send({t:'queue'});
 const start=await until(()=>a.msgs.find(m=>m.t==='start'));await until(()=>b.msgs.find(m=>m.t==='start'));const me=start.players.find(p=>p.id===a.id);
 await until(()=>a.current()?.spawnSeq===me.spawnSeq);assert.equal(a.current().ammo,30);
 a.send({t:'pose',x:me.x,z:me.z,yaw:0,pitch:0,slot:0,spawnSeq:me.spawnSeq});
 a.send({t:'fire',yaw:0,pitch:0,slot:0,spawnSeq:me.spawnSeq-1});await sleep(110);assert.equal(a.current().ammo,30);
 a.send({t:'reload',slot:0,spawnSeq:me.spawnSeq});await sleep(100);assert.equal(a.current().reserve,120);
 for(let i=0;i<30;i++){a.send({t:'fire',yaw:0,pitch:0,slot:0,spawnSeq:me.spawnSeq});await sleep(105)}
 await until(()=>a.current()?.ammo===0);
 for(let i=0;i<4;i++){a.send({t:'fire',yaw:0,pitch:0,slot:0,spawnSeq:me.spawnSeq});await sleep(100)}
 assert.equal(a.current().ammo,0,'client bypassed empty magazine');assert.equal(a.current().reserve,120);
 a.send({t:'reload',slot:0,spawnSeq:me.spawnSeq});await until(()=>a.current()?.reloading===true);
 a.send({t:'fire',yaw:0,pitch:0,slot:0,spawnSeq:me.spawnSeq});await sleep(160);assert.equal(a.current().ammo,0,'shot accepted during reload');
 a.send({t:'reload',slot:0,spawnSeq:me.spawnSeq});await sleep(100);assert.equal(a.current().reserve,120,'duplicate reload consumed reserve');
 await until(()=>a.current()?.reloading===false&&a.current()?.ammo===30,4000);assert.equal(a.current().reserve,90);
 a.send({t:'fire',yaw:0,pitch:0,slot:0,spawnSeq:me.spawnSeq});await until(()=>a.current()?.ammo===29);
 a.ws.close();b.ws.close();console.log(JSON.stringify({result:'PASS',security:['generation-bound bullets','authoritative magazine','deny shooting while reloading','duplicate reload safe','reserve deducted server-side','valid shot after reload'],initialAmmo:30,finalAmmo:29,remainingReserve:90},null,2));}
run().catch(e=>{console.error(e.stack||e);process.exitCode=1}).finally(()=>{child.kill('SIGTERM');setTimeout(()=>process.exit(),250)});
