const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const configPath=process.argv[2];
if(!configPath)throw new Error('Provide the public-only setup config path.');
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.supabaseUrl)||typeof config.publishableKey!=='string')throw new Error('Invalid public setup configuration.');
const files={'/': ['setup.html','text/html; charset=utf-8'],'/setup.js':['setup.js','text/javascript; charset=utf-8']};
http.createServer((req,res)=>{
  if(req.headers.host!=='127.0.0.1:5370'||req.method!=='GET'){res.writeHead(403);return res.end();}
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src ${config.supabaseUrl}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
  if(req.url==='/public-config.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(config));}
  const file=files[req.url];if(!file){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',file[1]);return res.end(fs.readFileSync(path.join(root,file[0])));
}).listen(5370,'127.0.0.1',()=>console.log('Publisher setup: http://127.0.0.1:5370/ (loopback only; no request logging)'));
