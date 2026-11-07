const {PNG}=require('./lib.cjs');const fs=require('fs');
const names=process.argv.slice(3);const ims=names.map(n=>PNG.sync.read(fs.readFileSync('apps/web/public/art/'+n+'.png')));
const W=ims.reduce((a,i)=>a+i.width+8,0),H=Math.max(...ims.map(i=>i.height));const m=new PNG({width:W,height:H});
for(let k=0;k<W*H;k++){const c=((k%W>>4)+(Math.floor(k/W)>>4))&1?60:30;m.data[k*4]=c;m.data[k*4+1]=c;m.data[k*4+2]=c+30;m.data[k*4+3]=255}
let x=0;for(const im of ims){for(let j=0;j<im.height;j++)for(let i=0;i<im.width;i++){const s=(j*im.width+i)*4,o=(j*W+x+i)*4,a=im.data[s+3]/255;for(let c=0;c<3;c++)m.data[o+c]=im.data[s+c]*a+m.data[o+c]*(1-a)}x+=im.width+8}
fs.writeFileSync(process.argv[2],PNG.sync.write(m));
