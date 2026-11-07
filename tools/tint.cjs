const {PNG}=require('./lib.cjs');
const COL={red:{h:0,s:1,l:0},blue:{h:214,s:1,l:0},orange:{h:30,s:1,l:0},white:{h:40,s:0.06,l:0.55},green:{h:132,s:0.9,l:-0.03},purple:{h:282,s:0.8,l:0}};
function rgb2hsl(r,g,b){r/=255;g/=255;b/=255;const M=Math.max(r,g,b),m=Math.min(r,g,b),l=(M+m)/2;let h=0,s=0;if(M!==m){const d=M-m;s=l>0.5?d/(2-M-m):d/(M+m);h=M===r?(g-b)/d+(g<b?6:0):M===g?(b-r)/d+2:(r-g)/d+4;h*=60}return[h,s,l]}
function hsl2rgb(h,s,l){const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;let[r,g,b]=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return[(r+m)*255,(g+m)*255,(b+m)*255]}
/** recolour every sufficiently saturated red-ish pixel (or all, when `all`) to the target colour */
function tint(png,name,{all=true,minS=0.35}={}){const t=COL[name],o=new PNG({width:png.width,height:png.height});
 for(let k=0;k<png.width*png.height;k++){const i=k*4;let[h,s,l]=rgb2hsl(png.data[i],png.data[i+1],png.data[i+2]);
  const red=(h<22||h>335)&&s>minS;
  if(all||red){h=t.h;s=name==='white'?s*t.s:Math.min(1,s*t.s);l=name==='white'?Math.min(0.95,l*0.55+0.4):Math.max(0,Math.min(1,l+t.l))}
  const [r,g,b]=hsl2rgb(h,s,l);o.data[i]=r;o.data[i+1]=g;o.data[i+2]=b;o.data[i+3]=png.data[i+3]}return o}
module.exports={COL,tint};
