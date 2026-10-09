import {render,screen,fireEvent,act} from '@testing-library/react';
import {vi} from 'vitest';
import {App} from './App';
import {searchMessage} from './tastebridge/wording';
import {describeError as describeSafeDeskError} from './safedesk/wording';

afterEach(()=>{vi.unstubAllGlobals();history.replaceState({},'','/')});

test('browser history restores the visible product and accessible navigation',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({mode:'live',model_enabled:true})})));
  history.replaceState({},'','/safedesk');await act(async()=>{render(<App/>)});
  history.replaceState({},'','/tastebridge');await act(async()=>{fireEvent(window,new PopStateEvent('popstate'))});
  expect(screen.getByRole('region',{name:'Group preferences'})).toBeVisible();
  expect(screen.getByRole('link',{name:/^TasteBridge$/})).toHaveAttribute('aria-current','page');
});
test('each product stands alone, with its own tab identity and no links to the other',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({mode:'live',model_enabled:true,qloo_configured:true})})));
  history.replaceState({},'','/tastebridge');await act(async()=>{render(<App/>)});
  expect(screen.queryByRole('link',{name:/SafeDesk/})).not.toBeInTheDocument();
  expect(document.title).toBe('TasteBridge');
  expect(document.documentElement.dataset.product).toBe('tastebridge');
});

test.each(['/safedesk','/tastebridge'])('a hosted provider is identified without local setup instructions on %s',async(path)=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({mode:'live',model:'groq',public_hosting:true,model_enabled:true,qloo_configured:true})})));
  history.replaceState({},'',path);await act(async()=>{render(<App/>)});
  expect(screen.getByText('Live · hosted')).toHaveAttribute('title',expect.stringMatching(/Groq/));
});

test.each(['/safedesk','/tastebridge'])('public service readiness errors do not send judges to local configuration on %s',async(path)=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({mode:'live',model:'groq',public_hosting:true,model_enabled:false,qloo_configured:false})})));
  history.replaceState({},'',path);await act(async()=>{render(<App/>)});
  const status=screen.getByText(path==='/tastebridge'?'Qloo unavailable':'Planner unavailable');
  expect(status.title).not.toMatch(/\.env|Codex|install|start-local/i);
  expect(status.title).toMatch(/try again|operator/i);
});

test.each(['qloo_unconfigured','unauthorized','Failed to fetch'])('TasteBridge failures give visitors recovery guidance for %s',message=>{
  const described=searchMessage(message);
  expect(described).not.toMatch(/\.env|start-local|install/i);
  expect(described).toMatch(/try again|operator/i);
});

test.each(['model_unconfigured','model_unavailable','codex_not_installed','Failed to fetch'])('SafeDesk failures give visitors recovery guidance for %s',message=>{
  const {title,detail}=describeSafeDeskError(message);
  expect(title+' '+detail).not.toMatch(/\.env|start-local|install|CODEX_EXECUTABLE/i);
  expect(detail).toMatch(/try again|operator/i);
});
