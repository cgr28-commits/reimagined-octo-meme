/** Loopback-only static export server for production browser verification. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('out');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=http.createServer((request,response)=>{
 try{
  const url=new URL(request.url,'http://127.0.0.1:3012');
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)){response.writeHead(404).end();return;}
  response.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(file).pipe(response);
 }catch{response.writeHead(400).end();}
});
server.listen(3012,'127.0.0.1',()=>console.log('Ready: isolated production export'));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
