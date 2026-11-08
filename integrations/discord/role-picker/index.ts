import config from './config.json' with { type: 'json' };
import { createHandler } from './core.mjs';
import submissions from './submissions.json' with { type: 'json' };
import { reportStore, submissionDiscord } from './submissions.mjs';
import { createSubmissionHandlerV2 } from './submissions-v2.mjs';
import { createOperationsHandler, sourceStore } from './operations.mjs';
import guides from './guides.json' with { type: 'json' };
import { createGuideHandler } from './guides.mjs';
import { createMemberToolsHandler, memberStore, decorateReview } from './member-tools.mjs';
import { createResetHandler, resetStore } from './reset.mjs';
import { failureStore } from './events.mjs';
import {createNearbyHandler,nearbyStore,nationalAudience} from './nearby.mjs';
declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void };

const token=Deno.env.get('CODE3_DISCORD_BOT_TOKEN');
const waitUntil=(task: Promise<unknown>)=>EdgeRuntime.waitUntil(task);
// Redacted failure telemetry for staff error alerting (#92): stage label + status only, best-effort.
const onFailure=failureStore(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),{source:'roles'});
const reportApi=submissionDiscord(submissions,token);
const reports=reportStore(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
const nearby=nearbyStore(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
const members=memberStore(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
const enrichedReports=async(method: string,args: Record<string,unknown>)=>{
  const result=await reports(method,args);
  if(method==='submit'&&result.created){
    try{const context=await members('context',{p_id:result.report.id});result.report.possible_duplicates=context?.possible_duplicates;}
    catch{result.report.possible_duplicates=null;}
  }
  return result;
};
const nearbyHandler=createNearbyHandler(submissions,config,{api:reportApi,store:nearby,reports:enrichedReports,waitUntil,decorateReview,onFailure});
const submissionHandler=createSubmissionHandlerV2(submissions,{
  api:reportApi,
  store:enrichedReports,
  waitUntil,
  decorateReview,
  onFailure,
  nearbyAudience:(row: any,channel: any,roles: any,legacyChannel: any,allowEmpty: boolean)=>nationalAudience(submissions,row,reportApi,nearby,channel,roles,legacyChannel,allowEmpty),
});
const guideHandler=createGuideHandler(guides);
const operationsHandler=createOperationsHandler(submissions,{api:reportApi,store:sourceStore(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),waitUntil});
const memberHandler=createMemberToolsHandler(submissions,{api:reportApi,store:members,reportStore:reports,waitUntil,onFailure});
const resetHandler=createResetHandler(config,{token,store:resetStore(Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),waitUntil,onFailure});
const extraHandler=(interaction: unknown)=>nearbyHandler(interaction)??resetHandler(interaction)??memberHandler(interaction)??operationsHandler(interaction)??guideHandler(interaction)??submissionHandler(interaction);
Deno.serve(createHandler(config,{token,waitUntil,extraHandler,onFailure}));
