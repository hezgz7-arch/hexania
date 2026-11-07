const {crop,save,PNG}=require('./lib.cjs');const fs=require('fs');const path=require('path');
const {PNG:P}=require('./lib.cjs');
const files=fs.readdirSync('apps/web/public/art').filter(f=>/^(tok|port|card)/.test(f));
const imgs=files.map(f=>P.sync.read(fs.readFileSync('apps/web/public/art/'+f)));
const W=1400;let x=0,y=0,rh=0;const m=new P({width:W,height:560});
for(const im of imgs){if(x+im.width>W){x=0;y+=rh+4;rh=0}P.bitblt(im,m,0,0,im.width,im.height,x,y);x+=im.width+4;rh=Math.max(rh,im.height)}
fs.writeFileSync(process.argv[2],P.sync.write(m));
