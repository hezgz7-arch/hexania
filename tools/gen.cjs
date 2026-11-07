const {crop,save,PNG}=require('./lib.cjs');
const out='apps/web/public/art/';
const aa=(d)=>Math.max(0,Math.min(1,0.5-d)); // d = signed distance in px (neg inside)
// pointy-top hexagon signed distance (apothem a, flat sides left/right)
function hexMask(R){const a=R*Math.sqrt(3)/2;return (i,j,w,h)=>{const x=Math.abs(i+.5-w/2),y=Math.abs(j+.5-h/2);
 const d=Math.max(x-a, (x*0.5+y*Math.sqrt(3)/2)-a);return aa(d);};}
const circ=(r)=>(i,j,w,h)=>aa(Math.hypot(i+.5-w/2,j+.5-h/2)-r);
const rrect=(r)=>(i,j,w,h)=>{const x=Math.abs(i+.5-w/2)-(w/2-r),y=Math.abs(j+.5-h/2)-(h/2-r);
 const d=Math.hypot(Math.max(x,0),Math.max(y,0))+Math.min(Math.max(x,y),0)-r;return aa(d);};
const names=['forest','mountains','pasture','fields','desert','hills','sea'];
const hx=[93,243,391,536,677,819,962];
const R=76;
names.forEach((n,k)=>save(out+'hex-'+n+'.png',crop(hx[k]-70,92-78,140,156,hexMask(R)))); 
// number tokens
const tx=[1115,1205,1292,1380,1465];
[2,3,4,5,6].forEach((n,k)=>save(out+'tok-'+n+'.png',crop(tx[k]-42,60-42,84,84,circ(40.5))));
[8,9,10,11,12].forEach((n,k)=>save(out+'tok-'+n+'.png',crop(tx[k]-42,150-42,84,84,circ(40.5))));
// resource + dev cards
const cards=[['lumber',18,132],['brick',145,257],['wool',268,381],['grain',393,506],['ore',518,630],['knight',643,755],['progress',770,884],['vp',897,1027]];
cards.forEach(([n,a,b])=>save(out+'card-'+n+'.png',crop(a,196,b-a,189,rrect(9))));
// ports
const px=[1113,1200,1287,1378,1465];
['lumber','brick','wool','grain','ore'].forEach((n,k)=>save(out+'port-'+n+'.png',crop(px[k]-46,574,92,112,(i,j,w,h)=>{
  const x=Math.abs(i+.5-w/2),y=Math.abs(j+.5-h/2);const a=43,ry=52;const d=Math.max(x-a,(x*0.5*ry/a*1.0+y*0.8660254*a/a*1)*0+(x/a*0.5+y/ry*0.866)*a-a);return aa(d);})));
