import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {parse} from 'yaml';
const workflow=parse(readFileSync(new URL('../../.github/workflows/larm-av.yml',import.meta.url),'utf8'));
function tillaten(branch:string,name='ko-pass-pr',headRepo=1,conclusion='success') {
 const github={event:{workflow_run:{conclusion,head_branch:branch,name,head_repository:{id:headRepo}},repository:{default_branch:'main',id:1}}};
 return Function('github','startsWith',`return (${workflow.jobs.avblas.if});`)(github,(a:string,b:string)=>a.startsWith(b));
}
test('verkligt job-villkor tillåter kö-passets ordinarie gren',()=>assert.equal(tillaten('arbete/ko-pass-2026-09-27'),true));
test('job-villkoret behåller defaultgrenen för andra workflows',()=>assert.equal(tillaten('main','build'),true));
test('job-villkoret stoppar fork, annan gren, annat workflow och failure',()=>{
 assert.equal(tillaten('arbete/ko-pass-2026-09-27','ko-pass-pr',2),false);
 assert.equal(tillaten('arbete/annan-gren'),false);
 assert.equal(tillaten('arbete/ko-pass-2026-09-27','build'),false);
 assert.equal(tillaten('arbete/ko-pass-2026-09-27','ko-pass-pr',1,'failure'),false);
});

async function korScript(overrides: Record<string, unknown> = {}, issueDate = '2026-09-23T12:00:00Z', path = '.github/workflows/ko-pass-pr.yml', workflowId = 7) {
  const writes: string[] = [];
  const gron = {name: 'ko-pass-pr', head_branch: 'arbete/ko-pass-2026-09-27', event: 'push', head_repository: {id: 1}, workflow_id: 7, created_at: '2026-09-27T12:00:00Z', ...overrides};
  const github = {paginate: async () => [{number: 1910, body: 'https://github.com/bambapappa/valflask/actions/runs/123', updated_at: issueDate}], rest: {actions: {getWorkflow: async () => ({data: {path}}), getWorkflowRun: async () => ({data: {workflow_id: workflowId}})}, issues: {listForRepo: {}, createComment: async () => writes.push('comment'), update: async () => writes.push('close')}}};
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('github', 'context', 'core', workflow.jobs.avblas.steps[0].with.script)(github, {repo: {owner: 'bambapappa', repo: 'valflask'}, payload: {workflow_run: gron, repository: {id: 1, default_branch: 'main'}}}, {notice: () => {}});
  return writes;
}
test('verkligt script återställer äldre larm efter betrott kö-pass', async () => assert.deepEqual(await korScript(), ['comment', 'close']));
test('äldre framgång får inte återställa nyare larm', async () => assert.deepEqual(await korScript({}, '2026-09-28T12:00:00Z'), []));
test('lika eller ogiltiga tider lämnar larm öppna', async () => {
  assert.deepEqual(await korScript({}, '2026-09-27T12:00:00Z'), []);
  assert.deepEqual(await korScript({}, 'okänt'), []);
  assert.deepEqual(await korScript({created_at: 'okänt'}), []);
});
test('script avvisar annan workflowidentitet, fork och PR-körning', async () => {
  assert.deepEqual(await korScript({}, undefined, '.github/workflows/annan.yml'), []);
  assert.deepEqual(await korScript({head_repository: {id: 2}}), []);
  assert.deepEqual(await korScript({event: 'pull_request'}), []);
  assert.deepEqual(await korScript({}, undefined, undefined, 8), []);
});
