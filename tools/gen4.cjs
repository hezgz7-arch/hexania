// Remaining sheet elements: ribbons, octagon badges, small hexes, ship/help/swap shields, wooden bars.
const {PNG,save:_save}=require('./lib.cjs');const {extract,largest}=require('./bgfit.cjs');
const OUT='apps/web/public/art/';
function save(p,png){let x0=png.width,y0=png.height,x1=-1,y1=-1;for(let j=0;j<png.height;j++)for(let i=0;i<png.width;i++)if(png.data[(j*png.width+i)*4+3]>20){x0=Math.min(x0,i);x1=Math.max(x1,i);y0=Math.min(y0,j);y1=Math.max(y1,j)}
 const w=x1-x0+1,h=y1-y0+1,o=new PNG({width:w,height:h});PNG.bitblt(png,o,x0,y0,w,h,0,0);console.log(p.split('/').pop(),w+'x'+h);_save(p,o)}
const {COL,tint}=require('./tint.cjs');
const T={t0:22,t1:46};
const items={
  'oct-gold':[12,912,64,60],'oct-gray':[76,912,60,60],
 'hex-gray':[758,934,76,68],'hex-white':[828,934,76,68],
 'shield-ship':[1098,690,118,98],'shield-help':[1216,690,106,98],'shield-swap':[1324,690,106,98],
};
for(const [n,r] of Object.entries(items))save(OUT+n+'.png',largest(extract(...r,T)));

// ribbon: keep the clean upper part of the red banner, rebuild the swallow-tail, tint per player colour
const rr=largest(extract(698,908,62,86,T));let {width:w,height:hh}=rr;
const rib=new PNG({width:w,height:hh});PNG.bitblt(rr,rib,0,0,w,hh,0,0);
let top=0,bot=0;for(let j=0;j<hh;j++){let n=0;for(let i=0;i<w;i++)if(rib.data[(j*w+i)*4+3]>200)n++;if(n>w*0.5&&!top)top=j;}
const cut=Math.round(hh*0.62);
for(let j=cut;j<hh;j++)for(let i=0;i<w;i++){const s=((cut-1)*w+i)*4,o=(j*w+i)*4,c=w/2,notch=Math.max(0,(j-cut-4)*1.6);
 for(let k=0;k<3;k++)rib.data[o+k]=rib.data[s+k];rib.data[o+3]=rib.data[s+3]>200&&Math.abs(i-c)>=notch?255:0}
for(const c of Object.keys(COL))save(OUT+`rib-${c}.png`,c==='red'?rib:tint(rib,c,{all:false,minS:0.4}));
save(OUT+'bar-wood.png',largest(extract(390,912,186,34,T)));
