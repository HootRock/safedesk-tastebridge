import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{host:'127.0.0.1',port:5173,strictPort:true,proxy:{'/api':{
 target:'http://127.0.0.1:8000',changeOrigin:true,
 configure(proxy){proxy.on('proxyReq',(outgoing,incoming)=>{
  if(incoming.headers.origin==='http://127.0.0.1:5173')outgoing.setHeader('origin','http://127.0.0.1:8000');
 })}
}}},test:{environment:'jsdom',setupFiles:['./src/test/setup.ts'],globals:true}});
