// Dice, road bar, scoreboard panel, wooden brackets and bars.
const {PNG,save:_save}=require('./lib.cjs');const {extract,largest}=require('./bgfit.cjs');
const OUT='apps/web/public/art/';
function save(p,png){let x0=png.width,y0=png.height,x1=-1,y1=-1;for(let j=0;j<png.height;j++)for(let i=0;i<png.width;i++)if(png.data[(j*png.width+i)*4+3]>20){x0=Math.min(x0,i);x1=Math.max(x1,i);y0=Math.min(y0,j);y1=Math.max(y1,j)}
 const w=x1-x0+1,h=y1-y0+1,o=new PNG({width:w,height:h});PNG.bitblt(png,o,x0,y0,w,h,0,0);console.log(p.split('/').pop(),w+'x'+h);_save(p,o)}
const T={t0:22,t1:46};
const items={'die-1':[735,412,92,84,{t0:14,t1:34}],'die-2':[735,498,92,86,{t0:14,t1:34}],'road-src':[8,484,112,84,T],'panel':[522,594,168,262,T],
 'bracket-a':[24,838,254,72,T],'bracket-b':[286,838,212,72,T],'wood-long':[8,962,300,44,T],'wood-curve':[200,908,196,54,T],'wood-mid':[312,950,262,54,T]};
for(const [n,r] of Object.entries(items))save(OUT+n+'.png',largest(extract(...r.slice(0,4),r[4])));
// road bar tinted for every player colour; scoreboard panel sliced into head / row / foot with the painted marbles and zeros erased
const {COL,tint}=require('./tint.cjs');
const fs=require('fs');
const road=PNG.sync.read(fs.readFileSync(OUT+'road-src.png'));
for(const c of Object.keys(COL))save(OUT+`road-${c}.png`,c==='red'?road:tint(road,c));
const pan=PNG.sync.read(fs.readFileSync(OUT+'panel.png'));
for(let j=40;j<220;j++)for(const [a,b] of [[14,58],[112,152]])for(let i=a;i<b;i++){const s=(j*pan.width+70)*4,o=(j*pan.width+i)*4;for(let k=0;k<4;k++)pan.data[o+k]=pan.data[s+k]}
const slice=(n,y0,y1)=>{const w=pan.width,h=y1-y0,o=new PNG({width:w,height:h});PNG.bitblt(pan,o,0,y0,w,h,0,0);_save(OUT+n+'.png',o);console.log(n,w+'x'+h)};
slice('panel-head',0,40);slice('panel-row',58,94);slice('panel-foot',222,pan.height);
