// Player-coloured pieces cut from DISEÑO.png (houses, castle, roads, marbles, pawns); green + purple are hue-shifted from the red/native sets.
const {PNG,save:_save,crop}=require('./lib.cjs');const {extract,largest}=require('./bgfit.cjs');
const OUT='apps/web/public/art/';
/** save trimmed to the opaque bounding box so sprites anchor predictably */
function save(p,png){let x0=png.width,y0=png.height,x1=-1,y1=-1;for(let j=0;j<png.height;j++)for(let i=0;i<png.width;i++)if(png.data[(j*png.width+i)*4+3]>20){x0=Math.min(x0,i);x1=Math.max(x1,i);y0=Math.min(y0,j);y1=Math.max(y1,j)}
 if(x1<0)return _save(p,png);const w=x1-x0+1,h=y1-y0+1,o=new PNG({width:w,height:h});PNG.bitblt(png,o,x0,y0,w,h,0,0);console.log(p.split('/').pop(),w+'x'+h);_save(p,o)}
const {COL,tint}=require('./tint.cjs');
// keep only the house of the "house + road bar" object; the bar (lower-left) is removed by two vertical cuts
function house(c,[x,y,w,h,roofX,wallX,splitY]){const o=extract(x,y,w,h,{t0:26,t1:52});
 for(let j=0;j<h;j++)for(let i=0;i<w;i++){const sx=x+i,sy=y+j;if(sx<(sy<splitY?roofX:wallX))o.data[(j*w+i)*4+3]=0}return largest(o)}
const H={red:[6,398,120,92,57,70,445],blue:[120,398,122,82,168,185,448],orange:[232,398,116,88,277,293,448],white:[350,398,106,92,390,403,450]};
const houses={red:house('red',H.red)};save(OUT+'house-red.png',houses.red);
for(const c of ['blue','orange','white','green','purple'])save(OUT+`house-${c}.png`,tint(houses.red,c));
// castle (cities): red roofs get the player's colour, walls stay stone
const castle=largest(extract(462,396,136,176,{t0:20,t1:44}));
for(const c of Object.keys(COL))save(OUT+`city-${c}.png`,c==='red'?castle:tint(castle,c,{all:false,minS:0.45}));
// marbles (colour dots) and pawns
const circ=(cx,cy,r)=>crop(cx-r,cy-r,2*r,2*r,(i,j)=>{const d=Math.hypot(i+0.5-r,j+0.5-r);return Math.max(0,Math.min(1,r-d+0.5))});
const M={red:858,blue:906,orange:954,white:1002,green:1051};
for(const [c,x] of Object.entries(M))save(OUT+`marble-${c}.png`,circ(x,555,15));
save(OUT+'marble-purple.png',tint(circ(858,555,15),'purple'));
const P={blue:[832,428,60,92],orange:[896,430,60,90],white:[958,430,58,90],green:[1016,428,66,92]};
const pawns={};for(const [c,r] of Object.entries(P)){pawns[c]=largest(extract(...r,{t0:26,t1:52}));save(OUT+`pawn-${c}.png`,pawns[c])}
for(const c of ['red','orange','white','green','purple'])save(OUT+`pawn-${c}.png`,tint(pawns.blue,c));
