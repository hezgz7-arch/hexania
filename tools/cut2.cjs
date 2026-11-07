const {crop,save}=require('./lib.cjs');
function cut(x,y,w,h,tol,name){const c=crop(x,y,w,h);const d=c.data;const seen=new Uint8Array(w*h);const st=[];
 const push=(i,j,pi,pj)=>{if(i<0||j<0||i>=w||j>=h)return;const k=j*w+i;if(seen[k])return;const a=k*4,b=(pj*w+pi)*4;
  if(Math.abs(d[a]-d[b])+Math.abs(d[a+1]-d[b+1])+Math.abs(d[a+2]-d[b+2])>tol)return;seen[k]=1;st.push([i,j]);};
 for(let i=0;i<w;i++){seen[i]=1;st.push([i,0]);seen[(h-1)*w+i]=1;st.push([i,h-1]);}
 for(let j=0;j<h;j++){seen[j*w]=1;st.push([0,j]);seen[j*w+w-1]=1;st.push([w-1,j]);}
 while(st.length){const [i,j]=st.pop();push(i+1,j,i,j);push(i-1,j,i,j);push(i,j+1,i,j);push(i,j-1,i,j);}
 for(let k=0;k<w*h;k++)if(seen[k])d[k*4+3]=0;save('apps/web/public/art/'+name+'.png',c);}
const box=(cx,cy,r,n,t=9)=>cut(cx-r,cy-r,2*r,2*r,t,n);
box(1113,812,34,'ico-gear');box(1205,812,30,'ico-help');box(1290,812,34,'ico-trophy');box(1378,812,34,'ico-bars');
box(1150,870,28,'ico-sound');box(1243,870,28,'ico-music');box(1322,870,28,'ico-home');box(1410,870,26,'ico-info');
box(1115,978,30,'res-grain',10);box(1192,978,32,'res-lumber',10);box(1288,978,34,'res-brick',10);box(1378,978,34,'res-wool',10);box(1470,978,36,'res-ore',10);
