const {crop,save,PNG}=require('./lib.cjs');const fs=require('fs');
// remove smooth background by flooding from the border; steps compare with the neighbour, so gradients pass but edges stop
function cut(x,y,w,h,tol,name){const c=crop(x,y,w,h);const d=c.data;const seen=new Uint8Array(w*h);const st=[];
 const push=(i,j,pi,pj)=>{if(i<0||j<0||i>=w||j>=h)return;const k=j*w+i;if(seen[k])return;
  const a=(j*w+i)*4,b=(pj*w+pi)*4;const dd=Math.abs(d[a]-d[b])+Math.abs(d[a+1]-d[b+1])+Math.abs(d[a+2]-d[b+2]);
  if(dd>tol)return;seen[k]=1;st.push([i,j]);};
 for(let i=0;i<w;i++){seen[i]=1;st.push([i,0]);seen[(h-1)*w+i]=1;st.push([i,h-1]);}
 for(let j=0;j<h;j++){seen[j*w]=1;st.push([0,j]);seen[j*w+w-1]=1;st.push([w-1,j]);}
 while(st.length){const [i,j]=st.pop();push(i+1,j,i,j);push(i-1,j,i,j);push(i,j+1,i,j);push(i,j-1,i,j);}
 // soften: bg pixels transparent, then 1px erode
 for(let k=0;k<w*h;k++)if(seen[k])d[k*4+3]=0;
 save('apps/web/public/art/'+name+'.png',c);}
cut(600,398,125,190,14,'robber');
cut(742,414,86,62,14,'die-a');
cut(738,498,90,82,14,'die-b');
cut(830,425,255,150,14,'pawns');
