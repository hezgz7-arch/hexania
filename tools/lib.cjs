const fs=require('fs');const path=require('path');
const {PNG}=require(path.join(__dirname,'..','node_modules','.pnpm','pngjs@5.0.0','node_modules','pngjs'));
const src=PNG.sync.read(fs.readFileSync(path.join(__dirname,'..','DISEÑO.png')));
function crop(x,y,w,h,mask){const o=new PNG({width:w,height:h});
 for(let j=0;j<h;j++)for(let i=0;i<w;i++){const sx=x+i,sy=y+j;const di=(j*w+i)*4;
  if(sx<0||sy<0||sx>=src.width||sy>=src.height){continue}
  const si=(sy*src.width+sx)*4;
  const a=mask?mask(i,j,w,h):1;
  o.data[di]=src.data[si];o.data[di+1]=src.data[si+1];o.data[di+2]=src.data[si+2];o.data[di+3]=Math.round(255*a);}
 return o;}
const save=(p,png)=>fs.writeFileSync(p,PNG.sync.write(png));
module.exports={crop,save,src,PNG};
