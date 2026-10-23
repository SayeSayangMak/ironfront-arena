'use strict';
/** IRONFRONT V15 authoritative Node.js dedicated game server. Zero runtime dependencies. */
const http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const PORT=Number(process.env.PORT||8080),HOST=process.env.HOST||'0.0.0.0',root=path.resolve(__dirname,'../game');
const players=new Map(),rooms=new Map(),queue=[];
const SPAWNS=[[0,18],[-13,14],[20,13],[-14,-14],[17,-18],[0,-20],[14,-12],[-27,1]];
const MAX_PER_ROOM=4,MAX_PAYLOAD=4096;let nextId=0;
const weapons={rifle:{rate:90,damage:26,head:54,mag:30,reserve:120,reload:2250},dmr:{rate:340,damage:48,head:90,mag:16,reserve:64,reload:2550},pistol:{rate:200,damage:25,head:53,mag:15,reserve:60,reload:1480}};
const now=()=>Date.now(),rnd=()=>crypto.randomBytes(3).toString('hex').toUpperCase();
const coll=[];function obstacle(x,z,w,d,h=4){coll.push({x,z,w,d,h,y:h/2})}
for(let sign of [-1,1]){obstacle(sign*44,0,2,90,5);obstacle(0,sign*44,90,2,5)}
function building(x,z,w,d,h){obstacle(x,z+d/2,w,.6,h);obstacle(x-w/2,z,.6,d,h);obstacle(x+w/2,z,.6,d,h);obstacle(x-w*.37,z-d/2,w*.26,.6,h);obstacle(x+w*.37,z-d/2,w*.26,.6,h)}
building(-25,-24,18,17,7);building(27,-21,18,19,8);building(-27,22,15,14,7);building(25,23,17,14,7);
for(const [x,z,w,d] of [[-7,-12,9,3.6],[10,-16,7,3.5],[-9,11,9,3.4],[14,14,6,4],[-21,0,8,3],[25,0,7,3],[-4,-29,5,1],[7,25,6,1.2],[-17,30,6,1.3],[20,34,5,1.2],[-33,9,4,1.2],[34,-5,5,1.2],[5,-3,3,2.5]])obstacle(x,z,w,d,d>2.9?3:1.3);
for(const [x,z,w,d] of [[-3,7,2.2,1],[5,11,2.3,1],[-15,4,3.2,1.1],[17,5,3.6,1],[-5,-6,2.6,1],[6,-8,2.8,1],[-14,-25,3.4,1.05],[12,-26,3,1],[-17,-7,1.55,1.5],[17,-9,1.55,1.5],[-2,-20,1.55,1.5],[5,29,1.55,1.5],[-32,-10,1.55,1.5]])obstacle(x,z,w,d,(w>2?1.13:.94));
for(const [x,z,w,d] of [[-4,7,3,1.05],[10,5,3,1.05],[-13,-8,3,1.05],[15,-15,3,1.05],[-8,26,3,1.05],[13,25,3,1.05]])obstacle(x,z,w,d,1.13);
function collide(x,z,r=.36){if(Math.abs(x)>41||Math.abs(z)>41)return true;return coll.some(o=>Math.abs(x-o.x)<o.w/2+r&&Math.abs(z-o.z)<o.d/2+r)}
function bestSpawn(room,self,index=0,preferIndex=false){
 const others=room.members.filter(p=>p!==self&&p.alive),choices=[];
 for(let i=0;i<SPAWNS.length;i++){
  const [bx,bz]=SPAWNS[i];for(const [ox,oz] of [[0,0],[1.4,0],[-1.4,0],[0,1.4],[0,-1.4],[2.8,0],[-2.8,0],[0,2.8],[0,-2.8]]){
   const x=bx+ox,z=bz+oz;if(collide(x,z,.55))continue;
   const nearest=others.length?Math.min(...others.map(p=>Math.hypot(x-p.x,z-p.z))):25;
   const preference=((i-index+SPAWNS.length)%SPAWNS.length);
   const score=Math.min(25,nearest)*2-(Math.abs(ox)+Math.abs(oz))*1.8-(preference===0?0:Math.min(preference,4)*1.3);
   choices.push({x,z,score,nearest})
  }
 }
 choices.sort((a,b)=>b.score-a.score);
 const ideal=SPAWNS[index%SPAWNS.length];
 if(preferIndex&&!collide(ideal[0],ideal[1],.55)&&(!others.length||others.every(p=>Math.hypot(p.x-ideal[0],p.z-ideal[1])>=7)))return ideal.slice();
 const best=choices.find(c=>c.nearest>=4)||choices[0]||{x:0,z:18};return [best.x,best.z]
}
function sendAmmo(c,reloading=null){const payload={t:'ammo',spawnSeq:c.spawnSeq,ammo:c.ammo,reserve:c.reserve,secondary:c.secondary,secReserve:c.secReserve};if(reloading!==null)payload.reloading=reloading;send(c,payload)}
function deployPlayer(c,room,index,protectionMs=2000){
 [c.x,c.z]=bestSpawn(room,c,index,protectionMs!==2000);c.alive=true;c.hp=100;c.respawnAt=0;c.spawnSeq=(c.spawnSeq||0)+1;c.lastPose=now();c.lastShot=0;c.lean=0;c.stance='idle';c.slot=0;c.invulnUntil=now()+protectionMs;
 c.ammo=weapons[c.weapon].mag;c.reserve=weapons[c.weapon].reserve;c.secondary=weapons.pistol.mag;c.secReserve=weapons.pistol.reserve;c.reloadEnds=0;c.reloadSlot=-1;
}
function wallDistance(x,y,z,dx,dy,dz){
 let closest=1000;for(const o of coll){let lo=0,hi=1000;let hit=true;
  for(const [v,d,mid,len] of [[x,dx,o.x,o.w],[y,dy,o.y,o.h],[z,dz,o.z,o.d]]){
   if(Math.abs(d)<1e-7){if(v<mid-len/2||v>mid+len/2){hit=false;break}}
   else {const a=(mid-len/2-v)/d,b=(mid+len/2-v)/d;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi){hit=false;break}}
  }if(hit&&lo<closest)closest=lo
 }return closest
}
function sphereDistance(x,y,z,dx,dy,dz,tx,ty,tz,r){const px=tx-x,py=ty-y,pz=tz-z,d=px*dx+py*dy+pz*dz;if(d<0||d>95)return Infinity;const squared=px*px+py*py+pz*pz-d*d;return squared<r*r?d:Infinity}
function send(c,obj){if(c.connected)try{c.socket.write(frame(JSON.stringify(obj)))}catch(e){drop(c)}}
function frame(str){const payload=Buffer.from(str,'utf8');if(payload.length<126)return Buffer.concat([Buffer.from([0x81,payload.length]),payload]);if(payload.length<65536){const hdr=Buffer.alloc(4);hdr[0]=0x81;hdr[1]=126;hdr.writeUInt16BE(payload.length,2);return Buffer.concat([hdr,payload])}throw Error('Frame too large')}
function broadcast(room,msg){for(const c of room.members)send(c,msg)}
function members(room){return room.members.map(c=>({id:c.id,name:c.name,skin:c.skin,weapon:c.weapon,x:+c.x.toFixed(2),z:+c.z.toFixed(2),yaw:c.yaw,pitch:c.pitch,lean:c.lean||0,hp:c.hp,alive:c.alive,kills:c.kills,deaths:c.deaths,score:c.score,stance:c.stance,firing:now()-c.lastShot<125,slot:c.slot,spawnSeq:c.spawnSeq||0}))}
function lobbyPacket(room){return{t:'lobby',code:room.code,host:room.host?.id,players:members(room)}}
function leave(c){if(c.mode==='queue'){const i=queue.indexOf(c);if(i>=0)queue.splice(i,1)}if(c.room){const room=c.room;room.members=room.members.filter(m=>m!==c);c.room=null;if(!room.members.length)rooms.delete(room.code);else if(room.status==='lobby'){if(room.host===c)room.host=room.members[0];broadcast(room,lobbyPacket(room))}else if(room.status==='playing'&&room.members.length<2){finish(room,'OTHER PLAYERS DISCONNECTED')}}c.mode='idle'}
function drop(c){if(!c.connected)return;c.connected=false;leave(c);players.delete(c.id);try{c.socket.destroy()}catch(e){}}
function newRoom(mode){let code=rnd();while(rooms.has(code))code=rnd();const r={code,mode,status:'lobby',members:[],host:null,started:0,remaining:480};rooms.set(code,r);return r}
function addToRoom(c,room){leave(c);c.mode=room.mode;c.room=room;c.kills=0;c.deaths=0;c.score=0;c.hp=100;c.alive=true;c.lastShot=0;c.lastPose=now();c.respawnAt=0;c.invulnUntil=0;room.members.push(c);if(!room.host)room.host=c;const i=room.members.length-1;deployPlayer(c,room,i,0);}
function start(room){if(room.status==='playing'||room.members.length<2)return;room.status='playing';room.started=now();for(let i=0;i<room.members.length;i++){const c=room.members[i];c.kills=0;c.deaths=0;c.score=0;c.hp=100;c.alive=true;c.respawnAt=0;c.lastShot=0;deployPlayer(c,room,i,1800)}broadcast(room,{t:'start',code:room.code,mode:room.mode,players:members(room)});for(const c of room.members)sendAmmo(c)}
function finish(room,reason){if(room.status!=='playing')return;broadcast(room,{t:'end',reason,players:members(room)});if(room.mode==='private'){room.status='lobby';for(const c of room.members){c.alive=true;c.hp=100;c.respawnAt=0}}else{room.status='finished';for(const c of [...room.members]){c.room=null;c.mode='idle'}room.members=[];rooms.delete(room.code)}}
function status(c,message,level='info'){send(c,{t:'status',message,level})}
function validName(raw){return String(raw||'OPERATIVE').replace(/[^\w -]/g,'').trim().slice(0,18)||'OPERATIVE'}
function processMessage(c,obj){if(!obj||typeof obj!=='object'||typeof obj.t!=='string')return;
 switch(obj.t){
 case 'hello':if(c.room||c.mode!=='idle')return;c.name=validName(obj.name);c.skin=['sentinel','ranger','spectre','ghost'].includes(obj.skin)?obj.skin:'sentinel';c.weapon=['rifle','dmr'].includes(obj.weapon)?obj.weapon:'rifle';c.optic=obj.optic==='scope'?'scope':'reflex';status(c,'Connected as '+c.name);break;
 case 'queue':if(c.room||c.mode==='queue')return;leave(c);c.mode='queue';queue.push(c);send(c,{t:'queue',message:'Searching for human opponents. Online players in queue: '+queue.length});matchQueue();break;
 case 'create':{const room=newRoom('private');addToRoom(c,room);send(c,lobbyPacket(room));break}
 case 'join':{const room=rooms.get(String(obj.code||'').toUpperCase());if(!room||room.mode!=='private'||room.status!=='lobby'||room.members.length>=MAX_PER_ROOM){status(c,'Room unavailable, full or already in progress.','error');return}addToRoom(c,room);broadcast(room,lobbyPacket(room));break}
 case 'lobby':if(c.room&&c.room.mode==='private'&&c.room.status==='lobby')send(c,lobbyPacket(c.room));break;
 case 'start':if(c.room&&c.room.mode==='private'&&c.room.host===c&&c.room.members.length>=2){start(c.room)}break;
 case 'reload':{if(!c.room||c.room.status!=='playing'||!c.alive||obj.spawnSeq!==c.spawnSeq)return;const slot=obj.slot===1?1:0;if(slot!==c.slot)return;const w=slot?weapons.pistol:weapons[c.weapon],n=slot?c.secondary:c.ammo,res=slot?c.secReserve:c.reserve;if(c.reloadEnds||n>=w.mag||!res){sendAmmo(c,false);return}c.reloadSlot=slot;c.reloadEnds=now()+w.reload;sendAmmo(c,true);break}
 case 'leave':leave(c);break;
 case 'pose':{
 const room=c.room;if(!room||room.status!=='playing'||!c.alive)return;
 const x=Number(obj.x),z=Number(obj.z),yaw=Number(obj.yaw),pitch=Number(obj.pitch);if(![x,z,yaw,pitch].every(Number.isFinite)||Math.abs(x)>45||Math.abs(z)>45||Math.abs(pitch)>1.45||Math.abs(yaw)>100000)return;
 const t=now(),dt=Math.max(0.016,Math.min(.4,(t-c.lastPose)/1000)),dist=Math.hypot(x-c.x,z-c.z);
 if(obj.spawnSeq!==c.spawnSeq){send(c,{t:'correction',x:c.x,z:c.z,spawnSeq:c.spawnSeq});return}
 const speedLimit=obj.stance==='crouch'?2.8:obj.stance==='run'?7.8:obj.stance==='walk'?5.5:3.0;
 if(dist>dt*speedLimit+.35||collide(x,z)){if(t-(c.lastReject||0)>700){send(c,{t:'correction',x:c.x,z:c.z,spawnSeq:c.spawnSeq});c.lastReject=t}return}
 c.x=x;c.z=z;c.yaw=yaw;c.pitch=pitch;c.lean=Number.isFinite(Number(obj.lean))?Math.max(-1,Math.min(1,Number(obj.lean))):0;c.stance=['run','walk','crouch'].includes(obj.stance)?obj.stance:'idle';const nextSlot=obj.slot===1?1:0;if(nextSlot!==c.slot){c.reloadEnds=0;c.reloadSlot=-1}c.slot=nextSlot;c.lastPose=t;break}
 case 'fire':{
 const room=c.room;if(!room||room.status!=='playing'||!c.alive||obj.spawnSeq!==c.spawnSeq)return;
 if(obj.slot!==c.slot)return;const wname=c.slot===1?'pistol':c.weapon,w=weapons[wname],t=now();if(t-c.lastShot<w.rate*.90||c.reloadEnds>t)return;const magKey=c.slot===1?'secondary':'ammo';if(c[magKey]<=0){sendAmmo(c,false);return}
 const yaw=Number(obj.yaw),pitch=Number(obj.pitch);
 if(!Number.isFinite(yaw)||!Number.isFinite(pitch)||Math.abs(pitch)>1.45||Math.abs(yaw-c.yaw)>0.35||Math.abs(pitch-c.pitch)>0.35)return;
 c.lastShot=t;c[magKey]--;sendAmmo(c);const dx=Math.sin(yaw)*Math.cos(pitch),dy=Math.sin(pitch),dz=-Math.cos(yaw)*Math.cos(pitch),sx=c.x+Math.cos(c.yaw)*c.lean*.37,sz=c.z+Math.sin(c.yaw)*c.lean*.37;if(collide(sx,sz,.08))return;const sy=c.stance==='crouch'?1.18:1.7;const wall=wallDistance(sx,sy,sz,dx,dy,dz);
 let closest=95,victim=null,head=false;for(const v of room.members){if(v===c||!v.alive||t<v.invulnUntil)continue;const hd=sphereDistance(sx,sy,sz,dx,dy,dz,v.x,v.stance==='crouch'?1.48:1.84,v.z,.29),bd=sphereDistance(sx,sy,sz,dx,dy,dz,v.x,v.stance==='crouch'?.97:1.18,v.z,.48),ld=sphereDistance(sx,sy,sz,dx,dy,dz,v.x,v.stance==='crouch'?.43:.59,v.z,.39),hit=Math.min(hd,bd,ld);if(hit<closest&&hit<wall){closest=hit;victim=v;head=hit===hd}}
 if(victim){victim.hp=Math.max(0,victim.hp-(head?w.head:w.damage));const kill=victim.hp===0;c.score+=kill?100:15;if(kill){c.kills++;victim.deaths++;victim.alive=false;victim.respawnAt=t+3000}broadcast(room,{t:'damage',shooter:c.id,victim:victim.id,kill,head,hp:victim.hp});if(c.kills>=12)finish(room,'KILL LIMIT REACHED')};break}
 case 'ping':send(c,{t:'pong',serverTime:now()});break;
 }
}
function matchQueue(){for(let i=queue.length-1;i>=0;i--)if(!queue[i].connected||queue[i].mode!=='queue')queue.splice(i,1);while(queue.length>=2){const count=Math.min(4,queue.length),selected=queue.splice(0,count),room=newRoom('public');for(const c of selected)addToRoom(c,room);start(room)}}
function parseFrames(c){let buffer=c.buffer;while(buffer.length>=2){const opcode=buffer[0]&15,masked=!!(buffer[1]&128),fin=!!(buffer[0]&128);let len=buffer[1]&127,offset=2;if(len===126){if(buffer.length<4)break;len=buffer.readUInt16BE(2);offset=4}else if(len===127){drop(c);return}if(!masked||!fin||len>MAX_PAYLOAD){drop(c);return}if(buffer.length<offset+4+len)break;const mask=buffer.subarray(offset,offset+4),payload=Buffer.from(buffer.subarray(offset+4,offset+4+len));for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];buffer=buffer.subarray(offset+4+len);
 if(opcode===8){drop(c);return}if(opcode===9){try{c.socket.write(Buffer.from([0x8a,0]))}catch(e){}continue}if(opcode!==1){drop(c);return}
 const n=now();if(n-c.windowStart>1000){c.windowStart=n;c.windowCount=0}if(++c.windowCount>65){drop(c);return}try{processMessage(c,JSON.parse(payload.toString('utf8')))}catch(e){status(c,'Invalid game message.','error')}
}c.buffer=buffer}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/health'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({status:'ok',players:players.size,waiting:queue.length,rooms:rooms.size,build:'v15'}));return}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
 const resource=url.pathname==='/'?'/index.html':url.pathname;let decoded;try{decoded=decodeURIComponent(resource)}catch(e){res.writeHead(400);res.end('Invalid path');return}if(decoded.includes('\0')){res.writeHead(400);res.end('Invalid path');return}const resolved=path.resolve(root,'.'+decoded);if(!resolved.startsWith(root+path.sep)){res.writeHead(403);res.end();return}fs.readFile(resolved,(err,data)=>{if(err){res.writeHead(404);res.end('Not found');return}res.writeHead(200,{'content-type':mime[path.extname(resolved)]||'application/octet-stream','cache-control':'public, max-age=180','x-content-type-options':'nosniff','cross-origin-opener-policy':'same-origin'});if(req.method==='HEAD')res.end();else res.end(data)})});
server.on('upgrade',(req,socket,head)=>{const uri=new URL(req.url,'http://localhost');if(uri.pathname!=='/ws'||req.headers.upgrade?.toLowerCase()!=='websocket'||req.headers['sec-websocket-version']!=='13'||!req.headers['sec-websocket-key']){socket.destroy();return}
 const key=String(req.headers['sec-websocket-key']);if(!/^[A-Za-z0-9+/=]{24}$/.test(key)){socket.destroy();return}
 const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');socket.setNoDelay(true);socket.setTimeout(90000);const c={id:'U'+(++nextId),socket,connected:true,alive:true,buffer:Buffer.alloc(0),windowCount:0,windowStart:now(),name:'OPERATIVE',skin:'sentinel',weapon:'rifle',mode:'idle',room:null,lastPose:now(),x:0,z:0,yaw:0,pitch:0,lean:0,stance:'idle',slot:0,kills:0,deaths:0,score:0,hp:100,invulnUntil:0,lastShot:0,aliveAt:now(),spawnSeq:0,lastReject:0,ammo:30,reserve:120,secondary:15,secReserve:60,reloadEnds:0,reloadSlot:-1};players.set(c.id,c);socket.on('data',chunk=>{if(!c.connected)return;c.buffer=Buffer.concat([c.buffer,chunk]);if(c.buffer.length>8192){drop(c);return}parseFrames(c)});socket.on('close',()=>drop(c));socket.on('timeout',()=>drop(c));socket.on('error',()=>drop(c));if(head.length){c.buffer=Buffer.concat([c.buffer,head]);parseFrames(c)}send(c,{t:'welcome',id:c.id})});
let loop=setInterval(()=>{const t=now();matchQueue();for(const room of rooms.values()){if(room.status!=='playing')continue;for(let i=0;i<room.members.length;i++){const c=room.members[i];if(!c.alive&&c.respawnAt&&t>=c.respawnAt){c.alive=true;c.hp=100;c.invulnUntil=t+1800;c.respawnAt=0;deployPlayer(c,room,(i+Math.floor(t/18000))%SPAWNS.length,2000);send(c,{t:'respawn',x:c.x,z:c.z,hp:c.hp,spawnSeq:c.spawnSeq});sendAmmo(c)}}
 for(const c of room.members){if(c.alive&&c.reloadEnds&&t>=c.reloadEnds){const slot=c.reloadSlot;const w=slot?weapons.pistol:weapons[c.weapon],magKey=slot?'secondary':'ammo',resKey=slot?'secReserve':'reserve',needed=Math.min(w.mag-c[magKey],c[resKey]);c[magKey]+=needed;c[resKey]-=needed;c.reloadEnds=0;c.reloadSlot=-1;sendAmmo(c,false)}}
 const remaining=Math.max(0,480-(t-room.started)/1000);broadcast(room,{t:'snapshot',players:members(room),remaining});if(remaining<=0)finish(room,'TIME LIMIT REACHED')}},100);
server.listen(PORT,HOST,()=>console.log('IRONFRONT Dedicated Server listening on '+HOST+':'+PORT));
const shutdown=()=>{clearInterval(loop);server.close();for(const c of [...players.values()])drop(c)};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
