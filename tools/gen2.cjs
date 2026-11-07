const {crop,save,PNG}=require('./lib.cjs');const fs=require('fs');
const out='apps/web/public/art/';
const aa=(d)=>Math.max(0,Math.min(1,0.5-d));
// convex polygon signed distance (inside negative)
function poly(pts){const n=pts.length;let area=0;for(let i=0;i<n;i++){const [a,b]=[pts[i],pts[(i+1)%n]];area+=a[0]*b[1]-b[0]*a[1]}const s=area>0?1:-1;
 return (x,y)=>{let m=-1e9;for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n];const dx=b[0]-a[0],dy=b[1]-a[1];const l=Math.hypot(dx,dy);const d=s*(dx*(y-a[1])-dy*(x-a[0]))/l*-1;m=Math.max(m,d)}return m}}
const rrect=(r)=>(i,j,w,h)=>{const x=Math.abs(i+.5-w/2)-(w/2-r),y=Math.abs(j+.5-h/2)-(h/2-r);return aa(Math.hypot(Math.max(x,0),Math.max(y,0))+Math.min(Math.max(x,y),0)-r)};
const circ=(r)=>(i,j,w,h)=>aa(Math.hypot(i+.5-w/2,j+.5-h/2)-r);
// board frame
const outer=poly([[92,1],[388,1],[468,94],[468,278],[383,347],[97,347],[2,278],[2,99]]);
const inner=poly([[115,24],[365,24],[445,114],[445,259],[365,329],[115,329],[25,259],[25,114]]);
{const f=crop(1050,206,470,352);const {src}=require('./lib.cjs');
 for(let j=0;j<352;j++)for(let i=0;i<470;i++){const k=(j*470+i)*4;const r=f.data[k],b=f.data[k+2];
  const soft=Math.max(0,Math.min(1,(r-b+12)/26));f.data[k+3]=Math.round(255*aa(outer(i+.5,j+.5))*(1-aa(inner(i+.5,j+.5)))*soft);}
 save(out+'frame.png',f);}
// panels
save(out+'card-army.png',crop(33,598,137,222,rrect(9)));
save(out+'card-road.png',crop(193,598,137,222,rrect(9)));
save(out+'card-trade.png',crop(360,598,140,222,rrect(9)));
save(out+'menu.png',crop(720,622,314,284,rrect(14)));
// round buttons
[['ok',1150],['no',1228],['swap',1317],['pause',1418]].forEach(([n,cx])=>save(out+'btn-'+n+'.png',crop(cx-25,921-25,50,50,circ(24))));
{const f=PNG.sync.read(fs.readFileSync(out+'frame.png'));for(let j=0;j<f.height;j++)for(let i=0;i<40;i++){const k=(j*f.width+i)*4;if(f.data[k+1]>f.data[k]+8&&f.data[k+1]>f.data[k+2])f.data[k+3]=0}fs.writeFileSync(out+'frame.png',PNG.sync.write(f));}
