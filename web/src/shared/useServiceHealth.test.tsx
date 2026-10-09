import {renderHook,waitFor} from '@testing-library/react';
import {vi} from 'vitest';
import {useServiceHealth} from './useServiceHealth';

afterEach(()=>vi.unstubAllGlobals());
test.each([
  [{mode:'live',model:'groq',public_hosting:true,model_enabled:true,qloo_configured:true},'groq',true],
  [{mode:'live',model:'codex',public_hosting:false,model_enabled:false,qloo_configured:false},'codex',false],
])('health preserves provider and public hosting independently of model readiness',async(payload,modelProvider,publicHosting)=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>payload})));
  const {result}=renderHook(()=>useServiceHealth());
  await waitFor(()=>expect(result.current).toEqual({state:'ready',mode:'live',modelProvider,publicHosting,modelEnabled:payload.model_enabled,qlooConfigured:payload.qloo_configured}));
});
