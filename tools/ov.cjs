const {crop,save}=require('./lib.cjs');
const c=crop(1040,196,496,372);
const P=(pts,col)=>{for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];for(let t=0;t<=1;t+=0.002){const x=Math.round(a[0]+(b[0]-a[0])*t)+10,y=Math.round(a[1]+(b[1]-a[1])*t)+10;const k=(y*496+x)*4;c.data[k]=col[0];c.data[k+1]=col[1];c.data[k+2]=col[2];}}};
P([[90,0],[390,0],[470,94],[470,284],[385,352],[95,352],[0,284],[0,99]],[255,0,255]);
P([[115,24],[365,24],[445,114],[445,259],[365,329],[115,329],[25,259],[25,114]],[0,255,0]);
save(process.argv[2],c);
